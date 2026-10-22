/** @jest-environment node */
import { adminAuth, adminDb } from './firebaseAdmin';
import { fakeDb } from './testing/fakeDb';
import { __resetStripeClientForTests } from './stripeConfig';
import {
  createCheckout,
  handleStripeEvent,
  memberAllowed,
  nextEntitlement,
  periodEndMillis,
  subscriptionState,
} from './stripeBilling';
import { isProEntitlement } from '../phone/entitlement';
import * as checkoutRoute from '../../app/api/pro/checkout/route';
import * as portalRoute from '../../app/api/pro/portal/route';
import * as webhookRoute from '../../app/api/stripe/webhook/route';
import * as mockRoute from '../../app/api/pro/mock-purchase/route';

// The Stripe API is mocked; webhook signatures are made and checked by the
// real library, so the signature path is the real one.
const mockStripeApi = {
  customers: { create: jest.fn() },
  checkout: { sessions: { create: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
  subscriptions: { retrieve: jest.fn() },
};
jest.mock('stripe', () => {
  const Actual = jest.requireActual('stripe');
  return jest.fn().mockImplementation((key, options) => {
    const real = new Actual(key, options);
    return { ...mockStripeApi, webhooks: real.webhooks };
  });
});
jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TIME' },
  Timestamp: { fromMillis: (ms) => ({ ts: ms }) },
}));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn() }));

const RealStripe = jest.requireActual('stripe');
const signer = new RealStripe('sk_test_placeholder');

// Placeholder values in the real shapes. No real key is used anywhere.
const SECRET = 'whsec_placeholder';
const ON = {
  STRIPE_WEB_PRO: '1',
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_PRICE_ID: 'price_pro_monthly',
  STRIPE_WEB_PRO_BASE_URL: 'https://www.friendly-bets.com',
  STRIPE_TEST_UIDS: 'jack, maya',
};
const ENV_KEYS = [...Object.keys(ON), 'STRIPE_PORTAL_CONFIGURATION_ID', 'STRIPE_ALLOW_LIVE', 'VERCEL_ENV', 'NODE_ENV', 'PRO_MOCK_PURCHASE', 'PRO_MOCK_UIDS'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function setEnv(env) {
  ENV_KEYS.forEach((key) => {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  });
}

const NOW = Date.UTC(2026, 9, 21);
const SEC = Math.floor(NOW / 1000);
const DAY = 24 * 60 * 60;
const verifyIdToken = jest.fn();
let db;
let logs;

function phoneUser(uid) {
  return { uid, phone_number: 'present', firebase: { sign_in_provider: 'phone' } };
}

beforeEach(() => {
  setEnv({ ...ON, NODE_ENV: 'test' });
  __resetStripeClientForTests();
  verifyIdToken.mockReset();
  verifyIdToken.mockImplementation(async (token) => {
    if (token === 'jack-token') return phoneUser('jack');
    if (token === 'maya-token') return phoneUser('maya');
    if (token === 'anon-token') return { uid: 'jack', phone_number: 'present', firebase: { sign_in_provider: 'anonymous' } };
    if (token === 'nophone-token') return { uid: 'jack', firebase: { sign_in_provider: 'custom' } };
    if (token === 'revoked-token') throw Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' });
    throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' });
  });
  adminAuth.mockReset();
  adminAuth.mockReturnValue({ verifyIdToken });
  db = fakeDb();
  adminDb.mockReset();
  adminDb.mockImplementation(() => db);
  // Like Stripe: the same idempotency key returns the same customer.
  mockStripeApi.customers.create.mockReset();
  mockStripeApi.customers.create.mockImplementation(async (_params, { idempotencyKey }) => ({ id: `cus_${idempotencyKey.replace(/[^A-Za-z0-9]/g, '')}` }));
  mockStripeApi.checkout.sessions.create.mockReset();
  mockStripeApi.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  mockStripeApi.billingPortal.sessions.create.mockReset();
  mockStripeApi.billingPortal.sessions.create.mockResolvedValue({ id: 'bps_1', url: 'https://billing.stripe.com/p/session/bps_1' });
  mockStripeApi.subscriptions.retrieve.mockReset();
  logs = ['log', 'info', 'warn', 'error'].map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => logs.forEach((spy) => spy.mockRestore()));
afterAll(() => setEnv(savedEnv));

// Nothing logged may hold a uid, a Stripe id or a phone claim.
function expectQuietLogs() {
  const text = JSON.stringify(logs.map((spy) => spy.mock.calls));
  expect(text).not.toMatch(/jack|maya|cus_|sub_|cs_test|present|\+1/);
}

function post(route, { token, body, url = 'http://localhost/api/pro/checkout' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return route.POST(new Request(url, { method: 'POST', headers, body: JSON.stringify(body || {}) }));
}

// A subscription in the installed API version's shape: the period end lives
// on the items.
function subscription({ id = 'sub_1', customer = 'cus_1', status = 'active', end = SEC + 30 * DAY, uid = 'jack', endedAt = null } = {}) {
  return {
    id,
    object: 'subscription',
    customer,
    status,
    ended_at: endedAt,
    metadata: uid ? { uid } : {},
    items: { object: 'list', data: [{ id: 'si_1', object: 'subscription_item', current_period_end: end }] },
  };
}

let eventCount = 0;
function event(type, object, created = SEC) {
  eventCount += 1;
  return { id: `evt_${eventCount}`, object: 'event', type, created, livemode: false, data: { object } };
}

function deliver(evt, { secret = SECRET, signature, raw } = {}) {
  const payload = raw ?? JSON.stringify(evt);
  const header = signature ?? signer.webhooks.generateTestHeaderString({ payload, secret });
  const headers = { 'Content-Type': 'application/json' };
  if (header) headers['Stripe-Signature'] = header;
  return webhookRoute.POST(new Request('http://localhost/api/stripe/webhook', { method: 'POST', headers, body: payload }));
}

const ent = () => db.data('entitlements/jack');
// The fake Admin Timestamp is { ts: millis }; the app reads millis too.
const entAsRead = () => ({ ...ent(), expiresAt: ent().expiresAt?.ts ?? ent().expiresAt });

describe('every route is a 404 with the feature off', () => {
  const routes = [
    ['checkout', checkoutRoute],
    ['portal', portalRoute],
    ['webhook', webhookRoute],
  ];

  test.each([
    ['STRIPE_WEB_PRO unset', { STRIPE_WEB_PRO: undefined }],
    ['STRIPE_WEB_PRO=true', { STRIPE_WEB_PRO: 'true' }],
    ['no secret key', { STRIPE_SECRET_KEY: undefined }],
    ['a live key without STRIPE_ALLOW_LIVE', { STRIPE_SECRET_KEY: 'sk_live_placeholder' }],
    ['a test key on Vercel production', { VERCEL_ENV: 'production' }],
    ['no webhook secret', { STRIPE_WEBHOOK_SECRET: undefined }],
    ['no price', { STRIPE_PRICE_ID: undefined }],
    ['no base URL', { STRIPE_WEB_PRO_BASE_URL: undefined }],
  ])('%s: POST, GET and OPTIONS on every route, before any auth, Stripe call or write', async (_name, change) => {
    setEnv({ ...ON, ...change });
    for (const [, route] of routes) {
      const res = await post(route, { token: 'jack-token' });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not-found' });
      expect(route.GET().status).toBe(404);
      expect(route.OPTIONS().status).toBe(404);
    }
    const signed = await deliver(event('customer.subscription.updated', subscription()));
    expect(signed.status).toBe(404);
    expect(adminAuth).not.toHaveBeenCalled();
    expect(adminDb).not.toHaveBeenCalled();
    expect(mockStripeApi.checkout.sessions.create).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  test('on: GET is a 405 and OPTIONS a 204 with no CORS (web only, same origin)', () => {
    for (const [, route] of routes) {
      expect(route.GET().status).toBe(405);
      const pre = route.OPTIONS(new Request('http://localhost/x', { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost' } }));
      expect(pre.status).toBe(204);
      expect(pre.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
  });

  test('all run on Node and are never cached', () => {
    for (const [, route] of routes) {
      expect(route.runtime).toBe('nodejs');
      expect(route.dynamic).toBe('force-dynamic');
    }
  });
});

describe('checkout route', () => {
  test.each([
    ['no token', undefined, 401, 'unauthorized'],
    ['a bad token', 'forged', 401, 'unauthorized'],
    ['a revoked token', 'revoked-token', 401, 'unauthorized'],
    ['an anonymous session', 'anon-token', 403, 'forbidden'],
    ['a token without a phone number', 'nophone-token', 403, 'forbidden'],
  ])('%s: %i, and no session', async (_name, token, status, error) => {
    const res = await post(checkoutRoute, { token });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(mockStripeApi.checkout.sessions.create).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  test('checks the token with checkRevoked', async () => {
    await post(checkoutRoute, { token: 'jack-token' });
    expect(verifyIdToken).toHaveBeenCalledWith('jack-token', true);
  });

  test('a $3/mo subscription session tied to the token uid, never one from the body', async () => {
    const res = await post(checkoutRoute, { token: 'jack-token', body: { uid: 'maya', price: 'price_free', customer: 'cus_evil', success_url: 'https://evil.example' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    expect(mockStripeApi.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(mockStripeApi.checkout.sessions.create).toHaveBeenCalledWith({
      mode: 'subscription',
      customer: 'cus_customerjack',
      line_items: [{ price: 'price_pro_monthly', quantity: 1 }],
      client_reference_id: 'jack',
      metadata: { uid: 'jack' },
      subscription_data: { metadata: { uid: 'jack' } },
      success_url: 'https://www.friendly-bets.com/pro?checkout=success',
      cancel_url: 'https://www.friendly-bets.com/pro?checkout=cancel',
    });
    expect(db.paths('entitlements/')).toEqual(['entitlements/jack']);
    expect(db.data('stripeCustomers/cus_customerjack')).toEqual({ uid: 'jack' });
  });

  test('return URLs come from the configured base URL, never the request Origin', async () => {
    const req = new Request('https://evil.example/api/pro/checkout', {
      method: 'POST',
      headers: { Authorization: 'Bearer jack-token', Origin: 'https://evil.example', Host: 'evil.example' },
    });
    await checkoutRoute.POST(req);
    const params = mockStripeApi.checkout.sessions.create.mock.calls[0][0];
    expect(params.success_url.startsWith('https://www.friendly-bets.com/')).toBe(true);
    expect(params.cancel_url.startsWith('https://www.friendly-bets.com/')).toBe(true);
  });

  test('reuses the Stripe customer already on entitlements/{uid}, without making one', async () => {
    db = fakeDb({ 'entitlements/jack': { plan: 'pro', source: 'stripe', since: 1, expiresAt: NOW - 1000, stripeCustomerId: 'cus_jack', stripeSubscriptionId: 'sub_old', stripeStatus: 'canceled' } });
    await post(checkoutRoute, { token: 'jack-token' });
    expect(mockStripeApi.customers.create).not.toHaveBeenCalled();
    expect(mockStripeApi.checkout.sessions.create.mock.calls[0][0]).toMatchObject({ customer: 'cus_jack', client_reference_id: 'jack' });
    expect(db.writes).toEqual([]);
  });

  describe('one Stripe customer per uid', () => {
    const config = { priceId: 'price_x', baseUrl: 'https://www.friendly-bets.com' };
    const checkout = () => createCheckout({ db, stripe: mockStripeApi, config, uid: 'jack', now: NOW });
    const sessionCustomers = () => mockStripeApi.checkout.sessions.create.mock.calls.map(([params]) => params.customer);

    test('a first Checkout makes the customer on the server, stores it on both docs, and passes it', async () => {
      const res = await post(checkoutRoute, { token: 'jack-token' });
      expect(res.status).toBe(200);
      expect(mockStripeApi.customers.create).toHaveBeenCalledTimes(1);
      expect(mockStripeApi.customers.create).toHaveBeenCalledWith({ metadata: { uid: 'jack' } }, { idempotencyKey: 'customer-jack' });
      expect(ent()).toEqual({ stripeCustomerId: 'cus_customerjack' });
      expect(db.data('stripeCustomers/cus_customerjack')).toEqual({ uid: 'jack' });
      expect(sessionCustomers()).toEqual(['cus_customerjack']);
      expectQuietLogs();
    });

    test('a doc with only the customer is not Pro, so the member can still check out', async () => {
      await checkout();
      expect(isProEntitlement(ent(), NOW)).toBe(false);
      const res = await post(portalRoute, { token: 'jack-token' });
      expect(res.status).toBe(200);
    });

    test('the webhook then grants Pro on that doc as usual', async () => {
      await checkout();
      mockStripeApi.subscriptions.retrieve.mockResolvedValue(subscription({ customer: 'cus_customerjack' }));
      const session = { id: 'cs_1', mode: 'subscription', client_reference_id: 'jack', metadata: { uid: 'jack' }, customer: 'cus_customerjack', subscription: 'sub_1' };
      await deliver(event('checkout.session.completed', session));
      expect(ent()).toMatchObject({ plan: 'pro', source: 'stripe', stripeCustomerId: 'cus_customerjack', stripeSubscriptionId: 'sub_1' });
    });

    test('a second Checkout reuses the stored customer without calling customers.create', async () => {
      await checkout();
      await checkout();
      expect(mockStripeApi.customers.create).toHaveBeenCalledTimes(1);
      expect(sessionCustomers()).toEqual(['cus_customerjack', 'cus_customerjack']);
    });

    test('two parallel Checkouts end with one stored customer, used by both sessions', async () => {
      await Promise.all([checkout(), checkout()]);
      expect(mockStripeApi.customers.create).toHaveBeenCalledTimes(2);
      expect(new Set(mockStripeApi.customers.create.mock.calls.map(([, options]) => options.idempotencyKey))).toEqual(new Set(['customer-jack']));
      expect(ent()).toEqual({ stripeCustomerId: 'cus_customerjack' });
      expect(db.paths('stripeCustomers/')).toEqual(['stripeCustomers/cus_customerjack']);
      expect(sessionCustomers()).toEqual(['cus_customerjack', 'cus_customerjack']);
    });

    test('past the idempotency window (a different customer back), the one stored first still wins', async () => {
      let count = 0;
      mockStripeApi.customers.create.mockImplementation(async () => {
        count += 1;
        return { id: `cus_new${count}` };
      });
      await Promise.all([checkout(), checkout()]);
      const stored = ent().stripeCustomerId;
      expect(['cus_new1', 'cus_new2']).toContain(stored);
      expect(db.paths('stripeCustomers/')).toEqual([`stripeCustomers/${stored}`]);
      expect(sessionCustomers()).toEqual([stored, stored]);
    });

    test('a customer stored between the first read and the transaction is the one used', async () => {
      mockStripeApi.customers.create.mockImplementation(async () => {
        await db.doc('entitlements/jack').set({ stripeCustomerId: 'cus_webhook' }, { merge: true });
        return { id: 'cus_other' };
      });
      await checkout();
      expect(ent()).toEqual({ stripeCustomerId: 'cus_webhook' });
      expect(db.paths('stripeCustomers/')).toEqual([]);
      expect(sessionCustomers()).toEqual(['cus_webhook']);
    });

    test('every other field on an existing doc is kept; only stripeCustomerId is added', async () => {
      const lapsed = { plan: 'pro', source: 'mock', since: 'T', expiresAt: NOW - 1000, note: 'kept' };
      db = fakeDb({ 'entitlements/jack': lapsed });
      await checkout();
      expect(ent()).toEqual({ ...lapsed, stripeCustomerId: 'cus_customerjack' });
      expect(isProEntitlement(ent(), NOW)).toBe(false);
    });

    test('a stored id in the wrong shape is replaced with a real customer', async () => {
      db = fakeDb({ 'entitlements/jack': { stripeCustomerId: 'not-a-customer' } });
      await checkout();
      expect(ent()).toEqual({ stripeCustomerId: 'cus_customerjack' });
      expect(sessionCustomers()).toEqual(['cus_customerjack']);
    });

    test('a legacy founder doc is never written, even in a race', async () => {
      const legacy = { plan: 'founder', source: 'mock', since: 'T', founderNumber: 7, expiresAt: null };
      mockStripeApi.customers.create.mockImplementation(async () => {
        await db.doc('entitlements/jack').set(legacy);
        return { id: 'cus_jack' };
      });
      await expect(checkout()).rejects.toMatchObject({ code: 'already-pro' });
      expect(ent()).toEqual(legacy);
      expect(mockStripeApi.checkout.sessions.create).not.toHaveBeenCalled();
    });

    test('a customers.create failure is a 500 that logs only a code, and writes nothing', async () => {
      mockStripeApi.customers.create.mockRejectedValue(Object.assign(new Error('jack'), { type: 'StripeAPIError', code: 'api_error' }));
      const res = await post(checkoutRoute, { token: 'jack-token' });
      expect(res.status).toBe(500);
      expect(console.error).toHaveBeenCalledWith('stripe checkout failed: api_error');
      expect(db.writes).toEqual([]);
      expect(mockStripeApi.checkout.sessions.create).not.toHaveBeenCalled();
      expectQuietLogs();
    });

    test('a customer without a usable id is refused', async () => {
      mockStripeApi.customers.create.mockResolvedValue({ id: 'cus_../x' });
      await expect(checkout()).rejects.toMatchObject({ code: 'no-customer-id' });
      expect(db.writes).toEqual([]);
    });
  });

  test.each([
    ['a live Stripe plan', { plan: 'pro', source: 'stripe', since: 1, expiresAt: Date.now() + 1e9, stripeCustomerId: 'cus_jack', stripeSubscriptionId: 'sub_1', stripeStatus: 'active' }],
    ['a live mock plan', { plan: 'pro', source: 'mock', since: 1, expiresAt: Date.now() + 1e9 }],
    ['an admin plan with no expiry', { plan: 'pro', source: 'admin', since: 1, expiresAt: null }],
    ['a legacy founder doc', { plan: 'founder', source: 'mock', since: 1, founderNumber: 7, expiresAt: null }],
  ])('409 already-pro for %s, and no session', async (_name, doc) => {
    db = fakeDb({ 'entitlements/jack': doc });
    const res = await post(checkoutRoute, { token: 'jack-token' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already-pro' });
    expect(mockStripeApi.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('409 already-subscribed for a lapsed plan whose subscription is still open (past_due)', async () => {
    db = fakeDb({ 'entitlements/jack': { plan: 'pro', source: 'stripe', since: 1, expiresAt: NOW - 1, stripeCustomerId: 'cus_jack', stripeSubscriptionId: 'sub_1', stripeStatus: 'past_due' } });
    const res = await post(checkoutRoute, { token: 'jack-token' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already-subscribed' });
    expect(mockStripeApi.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('an expired, canceled Stripe plan may buy again', async () => {
    db = fakeDb({ 'entitlements/jack': { plan: 'pro', source: 'stripe', since: 1, expiresAt: NOW - 1, stripeCustomerId: 'cus_jack', stripeSubscriptionId: 'sub_1', stripeStatus: 'canceled' } });
    const res = await post(checkoutRoute, { token: 'jack-token' });
    expect(res.status).toBe(200);
  });

  test('503 without admin credentials', async () => {
    adminAuth.mockImplementation(() => {
      throw Object.assign(new Error('missing'), { code: 'admin-not-configured' });
    });
    const res = await post(checkoutRoute, { token: 'jack-token' });
    expect(res.status).toBe(503);
  });

  test('a Stripe failure is a 500 that logs only a code', async () => {
    mockStripeApi.checkout.sessions.create.mockRejectedValue(Object.assign(new Error('No such customer: cus_jack'), { type: 'StripeInvalidRequestError', code: 'resource_missing' }));
    const res = await post(checkoutRoute, { token: 'jack-token' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server' });
    expect(console.error).toHaveBeenCalledWith('stripe checkout failed: resource_missing');
    expectQuietLogs();
  });

  test('createCheckout refuses a session without a URL', async () => {
    mockStripeApi.checkout.sessions.create.mockResolvedValue({ id: 'cs_1' });
    const config = { priceId: 'price_x', baseUrl: 'https://www.friendly-bets.com' };
    await expect(createCheckout({ db, stripe: mockStripeApi, config, uid: 'jack' })).rejects.toMatchObject({ code: 'no-session-url' });
  });
});

describe('portal route', () => {
  test.each([
    ['no token', undefined, 401],
    ['a bad token', 'forged', 401],
    ['an anonymous session', 'anon-token', 403],
    ['a token without a phone number', 'nophone-token', 403],
  ])('%s: %i', async (_name, token, status) => {
    db = fakeDb({ 'entitlements/jack': { plan: 'pro', source: 'stripe', stripeCustomerId: 'cus_jack' } });
    const res = await post(portalRoute, { token });
    expect(res.status).toBe(status);
    expect(mockStripeApi.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  test('404 no-customer without a stored Stripe customer', async () => {
    let res = await post(portalRoute, { token: 'jack-token' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no-customer' });
    db = fakeDb({ 'entitlements/jack': { plan: 'pro', source: 'mock', since: 1, expiresAt: null } });
    res = await post(portalRoute, { token: 'jack-token' });
    expect(res.status).toBe(404);
    expect(mockStripeApi.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  test('a portal session for the token uid’s own customer, back to /pro', async () => {
    db = fakeDb({
      'entitlements/jack': { plan: 'pro', source: 'stripe', stripeCustomerId: 'cus_jack' },
      'entitlements/maya': { plan: 'pro', source: 'stripe', stripeCustomerId: 'cus_maya' },
    });
    const res = await post(portalRoute, { token: 'jack-token', body: { customer: 'cus_maya', uid: 'maya' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.com/p/session/bps_1' });
    expect(mockStripeApi.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: 'cus_jack', return_url: 'https://www.friendly-bets.com/pro' });
  });

  test('uses STRIPE_PORTAL_CONFIGURATION_ID when set', async () => {
    process.env.STRIPE_PORTAL_CONFIGURATION_ID = 'bpc_123';
    db = fakeDb({ 'entitlements/jack': { stripeCustomerId: 'cus_jack' } });
    await post(portalRoute, { token: 'jack-token' });
    expect(mockStripeApi.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: 'cus_jack', return_url: 'https://www.friendly-bets.com/pro', configuration: 'bpc_123' });
  });

  test('a Stripe failure is a 500 that logs only a code', async () => {
    db = fakeDb({ 'entitlements/jack': { stripeCustomerId: 'cus_jack' } });
    mockStripeApi.billingPortal.sessions.create.mockRejectedValue(Object.assign(new Error('cus_jack'), { code: 'resource_missing' }));
    const res = await post(portalRoute, { token: 'jack-token' });
    expect(res.status).toBe(500);
    expectQuietLogs();
  });
});

describe('webhook route: signatures', () => {
  test('a bad signature is a 400 that reads and writes nothing', async () => {
    const evt = event('customer.subscription.updated', subscription());
    const res = await deliver(evt, { secret: 'whsec_wrong' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-signature' });
    expect(adminDb).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
    expectQuietLogs();
  });

  test('a missing signature header is a 400', async () => {
    const res = await deliver(event('customer.subscription.updated', subscription()), { signature: '' });
    expect(res.status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  test('a body changed after signing is a 400', async () => {
    const evt = event('customer.subscription.updated', subscription());
    const payload = JSON.stringify(evt);
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const res = await deliver(evt, { signature: header, raw: payload.replace('"jack"', '"maya"') });
    expect(res.status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  test('an old signature (past the tolerance) is a 400', async () => {
    const evt = event('customer.subscription.updated', subscription());
    const payload = JSON.stringify(evt);
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    const res = await deliver(evt, { signature: header, raw: payload });
    expect(res.status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  test('unknown event types are a 200 no-op', async () => {
    const res = await deliver(event('invoice.paid', { id: 'in_1', customer: 'cus_1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(db.writes).toEqual([]);
  });

  test('a failed write is a 500 (Stripe retries) that logs only the type and a code', async () => {
    db = { doc: (path) => ({ path, get: async () => ({ exists: false }) }), runTransaction: async () => { throw Object.assign(new Error('jack'), { code: 'aborted' }); } };
    const res = await deliver(event('customer.subscription.updated', subscription()));
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith('stripe webhook failed: customer.subscription.updated aborted');
    expectQuietLogs();
  });
});

describe('webhook route: events', () => {
  test('checkout.session.completed: Pro until the period end, with the Stripe ids', async () => {
    mockStripeApi.subscriptions.retrieve.mockResolvedValue(subscription());
    const session = { id: 'cs_test_1', object: 'checkout.session', mode: 'subscription', client_reference_id: 'jack', metadata: { uid: 'jack' }, customer: 'cus_1', subscription: 'sub_1' };
    const res = await deliver(event('checkout.session.completed', session));
    expect(res.status).toBe(200);
    expect(mockStripeApi.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
    expect(ent()).toEqual({
      plan: 'pro',
      source: 'stripe',
      since: 'SERVER_TIME',
      expiresAt: { ts: (SEC + 30 * DAY) * 1000 },
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripeStatus: 'active',
      stripeEventCreated: expect.any(Number),
    });
    expect(db.data('stripeCustomers/cus_1')).toEqual({ uid: 'jack' });
    expectQuietLogs();
  });

  test('checkout.session.completed falls back to client_reference_id', async () => {
    mockStripeApi.subscriptions.retrieve.mockResolvedValue(subscription({ uid: '' }));
    const session = { id: 'cs_1', mode: 'subscription', client_reference_id: 'jack', metadata: {}, customer: 'cus_1', subscription: 'sub_1' };
    await deliver(event('checkout.session.completed', session));
    expect(ent().plan).toBe('pro');
  });

  test('checkout.session.completed without a uid, or not a subscription, is a 200 no-op', async () => {
    let res = await deliver(event('checkout.session.completed', { id: 'cs_1', mode: 'subscription', metadata: {}, subscription: 'sub_1' }));
    expect(res.status).toBe(200);
    res = await deliver(event('checkout.session.completed', { id: 'cs_1', mode: 'payment', metadata: { uid: 'jack' } }));
    expect(res.status).toBe(200);
    expect(mockStripeApi.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  test('customer.subscription.created: Pro, uid from the subscription metadata', async () => {
    await deliver(event('customer.subscription.created', subscription()));
    expect(ent()).toMatchObject({ plan: 'pro', source: 'stripe', since: 'SERVER_TIME', expiresAt: { ts: (SEC + 30 * DAY) * 1000 }, stripeStatus: 'active' });
  });

  test('customer.subscription.updated (renewal): moves expiresAt, keeps since', async () => {
    db = fakeDb({ 'entitlements/jack': { plan: 'pro', source: 'stripe', since: 'FIRST', expiresAt: { ts: 1 }, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripeStatus: 'active', stripeEventCreated: SEC - DAY } });
    await deliver(event('customer.subscription.updated', subscription({ end: SEC + 60 * DAY })));
    expect(ent()).toMatchObject({ since: 'FIRST', expiresAt: { ts: (SEC + 60 * DAY) * 1000 }, stripeEventCreated: SEC });
  });

  test('customer.subscription.updated without a uid in metadata finds the uid from the customer', async () => {
    db = fakeDb({ 'stripeCustomers/cus_1': { uid: 'jack' } });
    await deliver(event('customer.subscription.updated', subscription({ uid: '' })));
    expect(ent()).toMatchObject({ plan: 'pro', source: 'stripe' });
  });

  test('a subscription event with no uid anywhere is a 200 no-op', async () => {
    const res = await deliver(event('customer.subscription.updated', subscription({ uid: '' })));
    expect(res.status).toBe(200);
    expect(db.writes).toEqual([]);
  });

  test('customer.subscription.deleted: the doc stays, and reads as not Pro', async () => {
    await deliver(event('customer.subscription.created', subscription(), SEC - 100));
    expect(isProEntitlement(entAsRead(), Date.now())).toBe(true);
    const res = await deliver(event('customer.subscription.deleted', subscription({ status: 'canceled', endedAt: SEC - 10 }), SEC));
    expect(res.status).toBe(200);
    expect(ent()).toMatchObject({ plan: 'pro', source: 'stripe', stripeStatus: 'canceled' });
    expect(ent().expiresAt.ts).toBeLessThanOrEqual(Date.now());
    expect(isProEntitlement(entAsRead(), Date.now())).toBe(false);
  });

  test.each(['past_due', 'unpaid', 'incomplete_expired', 'paused'])('updated to %s ends Pro now', async (status) => {
    await deliver(event('customer.subscription.created', subscription(), SEC - 100));
    const before = Date.now();
    await deliver(event('customer.subscription.updated', subscription({ status }), SEC));
    expect(ent().stripeStatus).toBe(status);
    expect(ent().expiresAt.ts).toBeLessThanOrEqual(Date.now());
    expect(ent().expiresAt.ts).toBeGreaterThanOrEqual(before - 1000);
  });

  test('idempotent: the same event twice writes once', async () => {
    const evt = event('customer.subscription.created', subscription());
    await deliver(evt);
    const writes = db.writes.length;
    const first = ent();
    const res = await deliver(evt);
    expect(res.status).toBe(200);
    expect(db.writes.length).toBe(writes);
    expect(ent()).toEqual(first);
    expect(db.data(`stripeEvents/${evt.id}`)).toEqual({ type: 'customer.subscription.created', created: SEC, processedAt: 'SERVER_TIME' });
  });

  test('out of order: an older updated event after a delete cannot bring Pro back', async () => {
    const created = event('customer.subscription.created', subscription(), SEC - 300);
    const updated = event('customer.subscription.updated', subscription({ end: SEC + 90 * DAY }), SEC - 200);
    const deleted = event('customer.subscription.deleted', subscription({ status: 'canceled' }), SEC - 100);
    await deliver(created);
    await deliver(deleted);
    await deliver(updated);
    expect(ent().stripeStatus).toBe('canceled');
    expect(ent().expiresAt.ts).toBeLessThanOrEqual(Date.now());
  });

  test('out of order: an older event is ignored even for a live subscription', async () => {
    await deliver(event('customer.subscription.updated', subscription({ end: SEC + 60 * DAY }), SEC));
    await deliver(event('customer.subscription.updated', subscription({ status: 'past_due' }), SEC - 50));
    expect(ent()).toMatchObject({ stripeStatus: 'active', expiresAt: { ts: (SEC + 60 * DAY) * 1000 } });
  });

  test('a newer active event after a delete in the same second still cannot revive it', async () => {
    await deliver(event('customer.subscription.deleted', subscription({ status: 'canceled' }), SEC));
    await deliver(event('customer.subscription.updated', subscription(), SEC));
    expect(ent().stripeStatus).toBe('canceled');
  });

  test('a legacy founder doc is never touched', async () => {
    const legacy = { plan: 'founder', source: 'mock', since: 'T', founderNumber: 7, expiresAt: null };
    db = fakeDb({ 'entitlements/jack': legacy });
    mockStripeApi.subscriptions.retrieve.mockResolvedValue(subscription());
    await deliver(event('checkout.session.completed', { id: 'cs_1', mode: 'subscription', metadata: { uid: 'jack' }, customer: 'cus_1', subscription: 'sub_1' }));
    await deliver(event('customer.subscription.updated', subscription()));
    await deliver(event('customer.subscription.deleted', subscription({ status: 'canceled' })));
    expect(ent()).toEqual(legacy);
    expect(db.writes.filter(([, path]) => path === 'entitlements/jack')).toEqual([]);
  });

  test('a live admin plan with no expiry keeps its plan; the Stripe ids are added for the portal', async () => {
    db = fakeDb({ 'entitlements/jack': { plan: 'pro', source: 'admin', since: 'T', expiresAt: null } });
    await deliver(event('customer.subscription.created', subscription(), SEC - 10));
    expect(ent()).toMatchObject({ plan: 'pro', source: 'admin', since: 'T', expiresAt: null, stripeCustomerId: 'cus_1', stripeStatus: 'active' });
    await deliver(event('customer.subscription.deleted', subscription({ status: 'canceled' }), SEC));
    expect(ent()).toMatchObject({ plan: 'pro', source: 'admin', expiresAt: null, stripeStatus: 'canceled' });
  });

  test('a live mock plan that ends before the paid period is replaced by the Stripe plan', async () => {
    db = fakeDb({ 'entitlements/jack': { plan: 'pro', source: 'mock', since: 'T', expiresAt: NOW + 1000 } });
    await deliver(event('customer.subscription.created', subscription()));
    expect(ent()).toMatchObject({ source: 'stripe', since: 'SERVER_TIME', expiresAt: { ts: (SEC + 30 * DAY) * 1000 } });
  });

  test('malformed events are a 200 no-op', async () => {
    const res = await deliver({ ...event('customer.subscription.updated', subscription()), id: 'evt/../entitlements/jack' });
    expect(res.status).toBe(200);
    expect(db.writes).toEqual([]);
  });
});

describe('test mode: only uids on STRIPE_TEST_UIDS', () => {
  const routes = [
    ['checkout', checkoutRoute],
    ['portal', portalRoute],
  ];
  beforeEach(() => {
    db = fakeDb({
      'entitlements/jack': { stripeCustomerId: 'cus_jack' },
      'entitlements/maya': { stripeCustomerId: 'cus_maya' },
    });
  });

  test.each(routes)('%s: a uid on the list is allowed', async (_name, route) => {
    setEnv({ ...ON, STRIPE_TEST_UIDS: ' jack ,, ' });
    const res = await post(route, { token: 'jack-token' });
    expect(res.status).toBe(200);
  });

  test.each(routes)('%s: a verified member off the list is a 403, with no Stripe call or read', async (_name, route) => {
    setEnv({ ...ON, STRIPE_TEST_UIDS: 'jack' });
    const res = await post(route, { token: 'maya-token' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(mockStripeApi.checkout.sessions.create).not.toHaveBeenCalled();
    expect(mockStripeApi.billingPortal.sessions.create).not.toHaveBeenCalled();
    expect(adminDb).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
    expectQuietLogs();
  });

  test.each([
    ['unset', undefined],
    ['empty', ''],
    ['only commas and spaces', ' , '],
  ])('an %s list is a 403 for everyone, on both routes', async (_name, list) => {
    setEnv({ ...ON, STRIPE_TEST_UIDS: list });
    for (const [, route] of routes) {
      for (const token of ['jack-token', 'maya-token']) {
        const res = await post(route, { token });
        expect(res.status).toBe(403);
      }
    }
    expect(mockStripeApi.checkout.sessions.create).not.toHaveBeenCalled();
    expect(mockStripeApi.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  test('the allowlist runs after the token check: a bad token is still a 401', async () => {
    setEnv({ ...ON, STRIPE_TEST_UIDS: '' });
    const res = await post(checkoutRoute, { token: 'forged' });
    expect(res.status).toBe(401);
  });

  describe('webhook', () => {
    beforeEach(() => {
      db = fakeDb();
      setEnv({ ...ON, STRIPE_TEST_UIDS: 'jack' });
    });

    test('customer.subscription.created for a uid off the list: 200, no grant, nothing written', async () => {
      const res = await deliver(event('customer.subscription.created', subscription({ uid: 'maya', customer: 'cus_maya' })));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(db.writes).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith('stripe webhook skipped: customer.subscription.created not-allowlisted');
      expectQuietLogs();
    });

    test('checkout.session.completed for a uid off the list: no grant, nothing written', async () => {
      mockStripeApi.subscriptions.retrieve.mockResolvedValue(subscription({ uid: 'maya', customer: 'cus_maya' }));
      const session = { id: 'cs_1', mode: 'subscription', client_reference_id: 'maya', metadata: { uid: 'maya' }, customer: 'cus_maya', subscription: 'sub_1' };
      const res = await deliver(event('checkout.session.completed', session));
      expect(res.status).toBe(200);
      expect(db.writes).toEqual([]);
    });

    test('a uid found through stripeCustomers is checked too', async () => {
      db = fakeDb({ 'stripeCustomers/cus_maya': { uid: 'maya' } });
      await deliver(event('customer.subscription.updated', subscription({ uid: '', customer: 'cus_maya' })));
      expect(db.paths('entitlements/')).toEqual([]);
      expect(db.paths('stripeEvents/')).toEqual([]);
    });

    test('a uid on the list is granted as usual', async () => {
      await deliver(event('customer.subscription.created', subscription()));
      expect(ent()).toMatchObject({ plan: 'pro', source: 'stripe' });
    });

    test('a skipped event is not marked handled, so a preview that has the uid on its list still applies it', async () => {
      const evt = event('customer.subscription.created', subscription({ uid: 'maya', customer: 'cus_maya' }));
      await deliver(evt);
      setEnv({ ...ON, STRIPE_TEST_UIDS: 'jack, maya' });
      await deliver(evt);
      expect(db.data('entitlements/maya')).toMatchObject({ plan: 'pro', source: 'stripe' });
    });

    describe('taken off the list after buying', () => {
      const paid = () => ({ plan: 'pro', source: 'stripe', since: 'FIRST', expiresAt: { ts: (SEC + 30 * DAY) * 1000 }, stripeCustomerId: 'cus_maya', stripeSubscriptionId: 'sub_1', stripeStatus: 'active', stripeEventCreated: SEC - DAY });
      beforeEach(() => {
        db = fakeDb({ 'entitlements/maya': paid() });
      });

      test('a renewal does not extend Pro, which lapses at the paid period end', async () => {
        await deliver(event('customer.subscription.updated', subscription({ uid: 'maya', customer: 'cus_maya', end: SEC + 60 * DAY })));
        expect(db.data('entitlements/maya')).toEqual(paid());
        expect(db.writes).toEqual([]);
      });

      test('a cancellation of the subscription on the doc still ends Pro', async () => {
        await deliver(event('customer.subscription.deleted', subscription({ uid: 'maya', customer: 'cus_maya', status: 'canceled' })));
        const doc = db.data('entitlements/maya');
        expect(doc).toMatchObject({ plan: 'pro', source: 'stripe', stripeStatus: 'canceled' });
        expect(isProEntitlement({ ...doc, expiresAt: doc.expiresAt.ts }, Date.now())).toBe(false);
      });

      test('past_due on the subscription on the doc still ends Pro', async () => {
        await deliver(event('customer.subscription.updated', subscription({ uid: 'maya', customer: 'cus_maya', status: 'past_due' })));
        expect(db.data('entitlements/maya').stripeStatus).toBe('past_due');
        expect(db.data('entitlements/maya').expiresAt.ts).toBeLessThanOrEqual(Date.now());
      });

      test('an ending event about another subscription writes nothing', async () => {
        await deliver(event('customer.subscription.updated', subscription({ id: 'sub_2', uid: 'maya', customer: 'cus_maya', status: 'incomplete' })));
        expect(db.data('entitlements/maya')).toEqual(paid());
        expect(db.writes).toEqual([]);
      });
    });

    test('without a config (or with an unknown key) nothing is granted', async () => {
      const result = await handleStripeEvent({ db, stripe: mockStripeApi, event: event('customer.subscription.created', subscription()), now: NOW, since: 'T' });
      expect(result).toEqual({ handled: false, applied: false, reason: 'not-allowlisted' });
      expect(db.writes).toEqual([]);
    });
  });
});

describe('webhook helpers', () => {
  test('the period end lives on the items in this API version; older shapes still read', () => {
    expect(periodEndMillis(subscription({ end: 100 }))).toBe(100000);
    expect(periodEndMillis({ items: { data: [{ current_period_end: 100 }, { current_period_end: 200 }] } })).toBe(200000);
    expect(periodEndMillis({ current_period_end: 300, items: { data: [] } })).toBe(300000);
    expect(periodEndMillis({ items: { data: [] } })).toBeNull();
  });

  test('a live subscription with no period end is refused (never Pro forever)', () => {
    expect(() => subscriptionState({ id: 'sub_1', status: 'active', items: { data: [] } }, NOW)).toThrow('no-period-end');
  });

  test('a canceled subscription ends at ended_at, or now if that is later', () => {
    expect(subscriptionState(subscription({ status: 'canceled', endedAt: SEC - 60 }), NOW).expiresAt).toBe(NOW - 60000);
    expect(subscriptionState(subscription({ status: 'canceled', endedAt: SEC + 60 }), NOW).expiresAt).toBe(NOW);
    expect(subscriptionState(subscription({ status: 'canceled' }), NOW).expiresAt).toBe(NOW);
  });

  describe('nextEntitlement', () => {
    const live = { subscriptionId: 'sub_1', customerId: 'cus_1', status: 'active', live: true, expiresAt: NOW + 1000 };
    const ended = { ...live, status: 'canceled', live: false, expiresAt: NOW };
    const args = (existing, state, eventCreated = 10) => ({ existing, state, eventCreated, now: NOW, since: 'NOW' });

    test('a first event with no plan yet and an incomplete subscription adds only the Stripe ids', () => {
      const next = nextEntitlement(args(null, { ...live, status: 'incomplete', live: false }));
      expect(next).toEqual({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripeStatus: 'incomplete', stripeEventCreated: 10 });
      expect(isProEntitlement(next, NOW)).toBe(false);
    });

    test('an event about another subscription never ends the current one', () => {
      const current = { plan: 'pro', source: 'stripe', since: 1, expiresAt: NOW + 5000, stripeSubscriptionId: 'sub_2', stripeStatus: 'active', stripeEventCreated: 5 };
      expect(nextEntitlement(args(current, ended, 20))).toBeNull();
      expect(nextEntitlement(args(current, live, 20))).toMatchObject({ stripeSubscriptionId: 'sub_1', expiresAt: NOW + 1000, since: 'NOW' });
    });

    test('ending never extends a Stripe plan that already lapsed', () => {
      const lapsed = { plan: 'pro', source: 'stripe', since: 1, expiresAt: NOW - 5000, stripeSubscriptionId: 'sub_1', stripeStatus: 'active', stripeEventCreated: 5 };
      expect(nextEntitlement(args(lapsed, ended)).expiresAt).toBe(NOW - 5000);
    });

    test('a live store plan that outlasts the Stripe period is kept', () => {
      const store = { plan: 'pro', source: 'storekit', since: 1, expiresAt: NOW + 5000 };
      expect(nextEntitlement(args(store, live))).toMatchObject({ source: 'storekit', expiresAt: NOW + 5000, stripeSubscriptionId: 'sub_1' });
    });
  });

  test('memberAllowed mirrors mockBuyerAllowed without the allowlist', () => {
    const forbidden = { ok: false, status: 403, error: 'forbidden' };
    expect(memberAllowed(phoneUser('jack'))).toEqual({ ok: true, uid: 'jack' });
    expect(memberAllowed({ ...phoneUser('jack'), firebase: { sign_in_provider: 'anonymous' } })).toEqual(forbidden);
    expect(memberAllowed({ uid: 'jack' })).toEqual(forbidden);
    expect(memberAllowed(null)).toEqual(forbidden);
  });

  test('handleStripeEvent ignores unknown types without touching the db', async () => {
    const touched = { doc: jest.fn(), runTransaction: jest.fn() };
    await expect(handleStripeEvent({ db: touched, stripe: mockStripeApi, event: { id: 'evt_1', type: 'charge.refunded', created: 1 } })).resolves.toEqual({ handled: false, reason: 'ignored-type' });
    expect(touched.doc).not.toHaveBeenCalled();
  });
});

describe('the mock purchase with Stripe in the picture', () => {
  beforeEach(() => {
    setEnv({ ...ON, PRO_MOCK_PURCHASE: '1', PRO_MOCK_UIDS: 'jack', NODE_ENV: 'test' });
  });

  test('never overwrites a live Stripe plan', async () => {
    const paid = { plan: 'pro', source: 'stripe', since: 1, expiresAt: Date.now() + 1e9, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripeStatus: 'active' };
    db = fakeDb({ 'entitlements/jack': paid });
    const res = await post(mockRoute, { token: 'jack-token', body: { plan: 'pro' } });
    expect(await res.json()).toEqual({ ok: true, plan: 'pro', unchanged: true });
    expect(ent()).toEqual(paid);
  });

  test('keeps the Stripe ids when it replaces a lapsed Stripe plan', async () => {
    db = fakeDb({ 'entitlements/jack': { plan: 'pro', source: 'stripe', since: 1, expiresAt: 1, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripeStatus: 'canceled', stripeEventCreated: 5 } });
    await post(mockRoute, { token: 'jack-token', body: { plan: 'pro' } });
    expect(ent()).toMatchObject({ source: 'mock', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripeStatus: 'canceled', stripeEventCreated: 5 });
  });
});
