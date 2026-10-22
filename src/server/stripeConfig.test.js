/** @jest-environment node */
import Stripe from 'stripe';
import {
  __resetStripeClientForTests,
  stripeBaseUrl,
  stripeClient,
  stripeKeyAllowed,
  stripeKeyMode,
  stripeWebProConfig,
} from './stripeConfig';

jest.mock('stripe', () => jest.fn().mockImplementation((key) => ({ key })));

// Placeholder values in the real shapes. No real key is used anywhere.
const ON = {
  STRIPE_WEB_PRO: '1',
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
  STRIPE_WEBHOOK_SECRET: 'whsec_placeholder',
  STRIPE_PRICE_ID: 'price_placeholder',
  STRIPE_WEB_PRO_BASE_URL: 'https://www.friendly-bets.com',
};

beforeEach(() => {
  Stripe.mockClear();
  __resetStripeClientForTests();
});

test('key modes', () => {
  expect(stripeKeyMode('sk_test_abc')).toBe('test');
  expect(stripeKeyMode(' rk_test_abc ')).toBe('test');
  expect(stripeKeyMode('sk_live_abc')).toBe('live');
  expect(stripeKeyMode('rk_live_abc')).toBe('live');
  ['', undefined, 'pk_test_abc', 'sk_test_', 'whsec_abc', 'test'].forEach((key) => expect(stripeKeyMode(key)).toBe(''));
});

test('test keys only, unless STRIPE_ALLOW_LIVE=1; never a test key on Vercel production', () => {
  expect(stripeKeyAllowed({ STRIPE_SECRET_KEY: 'sk_test_a' })).toBe(true);
  expect(stripeKeyAllowed({ STRIPE_SECRET_KEY: 'rk_test_a', VERCEL_ENV: 'preview' })).toBe(true);
  expect(stripeKeyAllowed({ STRIPE_SECRET_KEY: 'sk_test_a', VERCEL_ENV: 'production' })).toBe(false);
  expect(stripeKeyAllowed({ STRIPE_SECRET_KEY: 'sk_live_a' })).toBe(false);
  expect(stripeKeyAllowed({ STRIPE_SECRET_KEY: 'sk_live_a', STRIPE_ALLOW_LIVE: 'true' })).toBe(false);
  expect(stripeKeyAllowed({ STRIPE_SECRET_KEY: 'sk_live_a', STRIPE_ALLOW_LIVE: '1' })).toBe(true);
  expect(stripeKeyAllowed({ STRIPE_SECRET_KEY: 'pk_test_a' })).toBe(false);
  expect(stripeKeyAllowed({})).toBe(false);
});

test('the base URL is a bare https origin (http only for localhost)', () => {
  expect(stripeBaseUrl({ STRIPE_WEB_PRO_BASE_URL: 'https://www.friendly-bets.com' })).toBe('https://www.friendly-bets.com');
  expect(stripeBaseUrl({ STRIPE_WEB_PRO_BASE_URL: ' https://preview.example.app/ ' })).toBe('https://preview.example.app');
  expect(stripeBaseUrl({ STRIPE_WEB_PRO_BASE_URL: 'http://localhost:3000' })).toBe('http://localhost:3000');
  [
    '', 'not a url', 'http://www.friendly-bets.com', 'https://www.friendly-bets.com/pro',
    'https://www.friendly-bets.com?x=1', 'https://user:pw@www.friendly-bets.com', 'javascript:alert(1)',
  ].forEach((value) => expect(stripeBaseUrl({ STRIPE_WEB_PRO_BASE_URL: value })).toBe(''));
  expect(stripeBaseUrl({})).toBe('');
});

describe('stripeWebProConfig', () => {
  test('the full config when everything is set', () => {
    expect(stripeWebProConfig({ ...ON, STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_x' })).toEqual({
      secretKey: 'sk_test_placeholder',
      webhookSecret: 'whsec_placeholder',
      priceId: 'price_placeholder',
      portalConfigurationId: 'bpc_x',
      baseUrl: 'https://www.friendly-bets.com',
      allowLive: false,
    });
  });

  test.each([
    ['the flag unset', { STRIPE_WEB_PRO: undefined }],
    ['the flag not exactly 1', { STRIPE_WEB_PRO: 'true' }],
    ['no secret key', { STRIPE_SECRET_KEY: '' }],
    ['a live key', { STRIPE_SECRET_KEY: 'sk_live_placeholder' }],
    ['a publishable key', { STRIPE_SECRET_KEY: 'pk_test_placeholder' }],
    ['a test key on Vercel production', { VERCEL_ENV: 'production' }],
    ['no webhook secret', { STRIPE_WEBHOOK_SECRET: ' ' }],
    ['no price', { STRIPE_PRICE_ID: '' }],
    ['no base URL', { STRIPE_WEB_PRO_BASE_URL: '' }],
    ['a bad base URL', { STRIPE_WEB_PRO_BASE_URL: 'http://evil.example' }],
  ])('null (every route a 404) with %s', (_name, change) => {
    expect(stripeWebProConfig({ ...ON, ...change })).toBeNull();
  });

  test('a live key with STRIPE_ALLOW_LIVE=1', () => {
    expect(stripeWebProConfig({ ...ON, STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_ALLOW_LIVE: '1' })).toMatchObject({ allowLive: true });
  });

  test('defaults to process.env, which has none of it', () => {
    expect(stripeWebProConfig()).toBeNull();
  });
});

describe('stripeClient', () => {
  test('made lazily, once per key', () => {
    expect(Stripe).not.toHaveBeenCalled();
    const config = stripeWebProConfig(ON);
    const first = stripeClient(config);
    expect(stripeClient(config)).toBe(first);
    expect(Stripe).toHaveBeenCalledTimes(1);
    expect(Stripe).toHaveBeenCalledWith('sk_test_placeholder', expect.any(Object));
    stripeClient({ ...config, secretKey: 'sk_test_other' });
    expect(Stripe).toHaveBeenCalledTimes(2);
  });

  test('refuses to start with a live key unless allowed, or with no key', () => {
    expect(() => stripeClient({ secretKey: 'sk_live_x' })).toThrow(expect.objectContaining({ code: 'stripe-key-refused' }));
    expect(() => stripeClient({ secretKey: 'sk_live_x', allowLive: false })).toThrow('stripe-key-refused');
    expect(() => stripeClient(null)).toThrow('stripe-key-refused');
    expect(() => stripeClient({ secretKey: 'pk_test_x' })).toThrow('stripe-key-refused');
    expect(Stripe).not.toHaveBeenCalled();
    expect(stripeClient({ secretKey: 'sk_live_x', allowLive: true })).toEqual({ key: 'sk_live_x' });
  });
});
