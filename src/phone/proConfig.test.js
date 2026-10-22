import {
  EARLY_ACCESS_TYPES,
  PRO_COPY,
  STRIPE_COPY,
  proEarlyTypesEnabled,
  proMockPurchaseEnabled,
  proPaywallEnabled,
  proPrivacyUrl,
  proTermsUrl,
  stripeWebProEnabled,
} from './proConfig';

const FLAGS = ['NEXT_PUBLIC_PRO_PAYWALL', 'NEXT_PUBLIC_PRO_EARLY_TYPES', 'NEXT_PUBLIC_PRO_MOCK_PURCHASE', 'NEXT_PUBLIC_STRIPE_WEB_PRO'];
const saved = Object.fromEntries(FLAGS.map((flag) => [flag, process.env[flag]]));

afterEach(() => {
  FLAGS.forEach((flag) => {
    if (saved[flag] === undefined) delete process.env[flag];
    else process.env[flag] = saved[flag];
  });
});

test('the copy is built from the pricing, in the spec’s words', () => {
  expect(PRO_COPY.proPrice).toBe('$3/mo');
  expect(PRO_COPY.proNote).toBe('Billed monthly. Cancel anytime.');
  expect(PRO_COPY.finePrint).toBe('Pro renews at $3/mo until you cancel in Settings.');
});

test('no Pro copy has an em dash, a TODO or a straight apostrophe', () => {
  const strings = Object.values(PRO_COPY).flat();
  strings.forEach((text) => {
    expect(text).not.toMatch(/—|TODO|'/);
  });
});

test('Terms and Privacy URLs: each its own, blank when unset', () => {
  const saved = [process.env.NEXT_PUBLIC_TERMS_URL, process.env.NEXT_PUBLIC_PRIVACY_URL];
  delete process.env.NEXT_PUBLIC_TERMS_URL;
  delete process.env.NEXT_PUBLIC_PRIVACY_URL;
  expect([proTermsUrl(), proPrivacyUrl()]).toEqual(['', '']);
  process.env.NEXT_PUBLIC_TERMS_URL = ' https://example.com/terms ';
  expect([proTermsUrl(), proPrivacyUrl()]).toEqual(['https://example.com/terms', '']);
  [process.env.NEXT_PUBLIC_TERMS_URL, process.env.NEXT_PUBLIC_PRIVACY_URL] = saved;
  if (saved[0] === undefined) delete process.env.NEXT_PUBLIC_TERMS_URL;
  if (saved[1] === undefined) delete process.env.NEXT_PUBLIC_PRIVACY_URL;
});

test('every flag is off by default and on only for "1"', () => {
  const all = () => [proPaywallEnabled(), proEarlyTypesEnabled(), proMockPurchaseEnabled(), stripeWebProEnabled()];
  FLAGS.forEach((flag) => delete process.env[flag]);
  expect(all()).toEqual([false, false, false, false]);
  FLAGS.forEach((flag) => { process.env[flag] = 'true'; });
  expect(all()).toEqual([false, false, false, false]);
  FLAGS.forEach((flag) => { process.env[flag] = '1'; });
  expect(all()).toEqual([true, true, true, true]);
});

test('no real early-access types ship yet', () => {
  expect(EARLY_ACCESS_TYPES).toEqual([]);
});

// Placeholder strings for Stripe web billing (docs/STRIPE-WEB-PRO.md): as few
// as possible, plain ASCII (straight apostrophes only), no em dash, no TODO
// in the text itself, and none of them already in PRO_COPY.
test('Stripe copy: few, ASCII, no em dash or TODO, nothing PRO_COPY already has', () => {
  const strings = Object.values(STRIPE_COPY);
  expect(strings).toEqual(['Manage subscription']);
  strings.forEach((text) => {
    expect(text).toMatch(/^[\x20-\x7E]+$/);
    expect(text).not.toMatch(/\u2014|TODO/);
    expect(Object.values(PRO_COPY).flat()).not.toContain(text);
  });
});
