import {
  EARLY_ACCESS_TYPES,
  FOUNDER_LIMIT,
  PRO_COPY,
  founderOffer,
  proEarlyTypesEnabled,
  proMockPurchaseEnabled,
  proPaywallEnabled,
  proPrivacyUrl,
  proTermsUrl,
} from './proConfig';

const FLAGS = ['NEXT_PUBLIC_PRO_PAYWALL', 'NEXT_PUBLIC_PRO_EARLY_TYPES', 'NEXT_PUBLIC_PRO_MOCK_PURCHASE'];
const saved = Object.fromEntries(FLAGS.map((flag) => [flag, process.env[flag]]));

afterEach(() => {
  FLAGS.forEach((flag) => {
    if (saved[flag] === undefined) delete process.env[flag];
    else process.env[flag] = saved[flag];
  });
});

test('founder spots: $40 for #1 to #100, $80 for #101 to #600, then sold out', () => {
  expect(founderOffer(0)).toMatchObject({ soldOut: false, price: 40, first: true, spots: 100, left: 100, next: 1 });
  expect(founderOffer(99)).toMatchObject({ price: 40, left: 1, next: 100 });
  expect(founderOffer(100)).toMatchObject({ price: 80, first: false, spots: 500, left: 500, next: 101 });
  expect(founderOffer(599)).toMatchObject({ price: 80, left: 1, next: 600 });
  expect(founderOffer(600)).toEqual({ soldOut: true });
  expect(founderOffer(9999)).toEqual({ soldOut: true });
  expect(FOUNDER_LIMIT).toBe(600);
});

test('a missing or junk count prices the first spot', () => {
  expect(founderOffer(undefined)).toMatchObject({ price: 40, next: 1 });
  expect(founderOffer('nope')).toMatchObject({ price: 40, next: 1 });
  expect(founderOffer(-3)).toMatchObject({ price: 40, next: 1 });
});

test('the copy is built from the pricing, in the spec’s words', () => {
  expect(PRO_COPY.proPrice).toBe('$3/mo');
  expect(PRO_COPY.proNote).toBe('Billed monthly. Cancel anytime.');
  expect(PRO_COPY.finePrint).toBe('Pro renews at $3/mo until you cancel in Settings.');
  expect(PRO_COPY.founderNumber(7)).toBe('Founder #7');
});

test('no Pro copy has an em dash, a TODO or a straight apostrophe', () => {
  const strings = Object.values(PRO_COPY).flatMap((value) => (typeof value === 'function' ? value({ price: 1, spots: 1, left: 1, first: true }) : value));
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
  FLAGS.forEach((flag) => delete process.env[flag]);
  expect([proPaywallEnabled(), proEarlyTypesEnabled(), proMockPurchaseEnabled()]).toEqual([false, false, false]);
  FLAGS.forEach((flag) => { process.env[flag] = 'true'; });
  expect([proPaywallEnabled(), proEarlyTypesEnabled(), proMockPurchaseEnabled()]).toEqual([false, false, false]);
  FLAGS.forEach((flag) => { process.env[flag] = '1'; });
  expect([proPaywallEnabled(), proEarlyTypesEnabled(), proMockPurchaseEnabled()]).toEqual([true, true, true]);
});

test('no real early-access types ship yet', () => {
  expect(EARLY_ACCESS_TYPES).toEqual([]);
});
