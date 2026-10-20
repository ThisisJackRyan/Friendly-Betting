import {
  EARLY_ACCESS_TYPES,
  FOUNDER_LIMIT,
  PRO_COPY,
  founderOffer,
  proEarlyTypesEnabled,
  proMockPurchaseEnabled,
  proPaywallEnabled,
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
  expect(founderOffer(0)).toMatchObject({ soldOut: false, price: 40, first: true, spots: 100, next: 1 });
  expect(founderOffer(99)).toMatchObject({ price: 40, next: 100 });
  expect(founderOffer(100)).toMatchObject({ price: 80, first: false, spots: 500, next: 101 });
  expect(founderOffer(599)).toMatchObject({ price: 80, next: 600 });
  expect(founderOffer(600)).toEqual({ soldOut: true });
  expect(founderOffer(9999)).toEqual({ soldOut: true });
  expect(FOUNDER_LIMIT).toBe(600);
});

test('a missing or junk count prices the first spot', () => {
  expect(founderOffer(undefined)).toMatchObject({ price: 40, next: 1 });
  expect(founderOffer('nope')).toMatchObject({ price: 40, next: 1 });
  expect(founderOffer(-3)).toMatchObject({ price: 40, next: 1 });
});

test('the copy is built from the pricing', () => {
  expect(PRO_COPY.free).toBe('Start 3 bets free, then $3/mo.');
  expect(PRO_COPY.founder(founderOffer(0))).toBe('Founder: $40 once, Pro for life. First 100 only.');
  expect(PRO_COPY.founder(founderOffer(150))).toBe('Founder: $80 once, Pro for life. Next 500 only.');
  expect(PRO_COPY.founderNumber(7)).toBe('Founder #7');
});

test('no Pro copy has an em dash or a TODO', () => {
  const strings = Object.values(PRO_COPY).map((value) => (typeof value === 'function' ? value({ price: 1, spots: 1, first: true }) : value));
  strings.forEach((text) => {
    expect(text).not.toMatch(/—|TODO/);
  });
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
