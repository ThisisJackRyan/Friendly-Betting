/** @jest-environment node */
import { GOOGLE_TEST_PUBLISHER } from '../ads/config';
import {
  GOOGLE_TAG_ID,
  PLACEHOLDER_RECORD,
  appAdsTxt,
  normalizePublisherId,
  publisherIdFromEnv,
} from './appAdsTxt';
import { GET } from '../../app/app-ads.txt/route';
import * as routeModule from '../../app/app-ads.txt/route';

const REAL = 'pub-1234567890123456';
const SELLER_LINE = `google.com, ${REAL}, DIRECT, f08c47fec0942fa0`;
const ENV_NAMES = ['ADMOB_PUBLISHER_ID', 'NEXT_PUBLIC_ADMOB_PUBLISHER_ID'];

function expectPlaceholder(body) {
  expect(body).toBe(`# Friendly Bets has no authorized ad sellers yet.\n${PLACEHOLDER_RECORD}\n`);
  expect(body).not.toMatch(/google\.com/);
  expect(body).not.toMatch(/pub-/);
  // Every line is a comment or the IAB placeholder record.
  body.trim().split('\n').forEach((line) => {
    expect(line.startsWith('#') || line === PLACEHOLDER_RECORD).toBe(true);
  });
}

test("Google's TAG ID is the published constant", () => {
  expect(GOOGLE_TAG_ID).toBe('f08c47fec0942fa0');
  expect(PLACEHOLDER_RECORD).toBe('placeholder.example.com, placeholder, DIRECT, placeholder');
});

test('unset env: placeholder only', () => {
  expectPlaceholder(appAdsTxt({}));
});

test.each([
  ['empty', ''],
  ['whitespace', '   \n\t'],
  ['no prefix', '1234567890123456'],
  ['too short', 'pub-1234'],
  ['too long', 'pub-12345678901234567'],
  ['letters', 'pub-12345678901234ab'],
  ['app ID, not a publisher ID', 'ca-app-pub-1234567890123456~1234567890'],
  ['ad unit ID', 'ca-app-pub-1234567890123456/1234567890'],
  ['placeholder text', 'pub-XXXXXXXXXXXXXXXX'],
  ['Google test publisher', 'pub-3940256099942544'],
  ['Google test publisher, ca-app form', GOOGLE_TEST_PUBLISHER],
  ['two IDs', `${REAL}, pub-6543210987654321`],
])('invalid env (%s): placeholder only', (_, value) => {
  ENV_NAMES.forEach((name) => expectPlaceholder(appAdsTxt({ [name]: value })));
  expectPlaceholder(appAdsTxt({ ADMOB_PUBLISHER_ID: value, NEXT_PUBLIC_ADMOB_PUBLISHER_ID: value }));
});

test.each(ENV_NAMES)('a valid ID in %s gives exactly the google.com seller line', (name) => {
  expect(appAdsTxt({ [name]: REAL })).toBe(`${SELLER_LINE}\n`);
  expect(appAdsTxt({ [name]: `  ${REAL}\n` })).toBe(`${SELLER_LINE}\n`);
  expect(appAdsTxt({ [name]: `ca-app-${REAL}` })).toBe(`${SELLER_LINE}\n`);
});

test('ADMOB_PUBLISHER_ID wins when both are valid; an invalid one falls through', () => {
  const other = 'pub-6543210987654321';
  expect(publisherIdFromEnv({ ADMOB_PUBLISHER_ID: REAL, NEXT_PUBLIC_ADMOB_PUBLISHER_ID: other })).toBe(REAL);
  expect(publisherIdFromEnv({ ADMOB_PUBLISHER_ID: 'nope', NEXT_PUBLIC_ADMOB_PUBLISHER_ID: other })).toBe(other);
  expect(publisherIdFromEnv({ ADMOB_PUBLISHER_ID: '', NEXT_PUBLIC_ADMOB_PUBLISHER_ID: REAL })).toBe(REAL);
});

test("never treats Google's test publisher as Jack's", () => {
  expect(GOOGLE_TEST_PUBLISHER).toBe('ca-app-pub-3940256099942544');
  expect(normalizePublisherId(GOOGLE_TEST_PUBLISHER)).toBeNull();
  expect(normalizePublisherId('pub-3940256099942544')).toBeNull();
  expect(normalizePublisherId(undefined)).toBeNull();
  expect(normalizePublisherId(123)).toBeNull();
});

describe('GET /app-ads.txt', () => {
  const saved = {};
  beforeEach(() => ENV_NAMES.forEach((name) => {
    saved[name] = process.env[name];
    delete process.env[name];
  }));
  afterEach(() => ENV_NAMES.forEach((name) => {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }));

  test('reads the env per request', () => {
    expect(routeModule.dynamic).toBe('force-dynamic');
  });

  test('unset: 200 text/plain placeholder', async () => {
    const res = GET(new Request('https://www.friendly-bets.com/app-ads.txt'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expectPlaceholder(await res.text());
  });

  test('set: 200 text/plain with the seller line', async () => {
    process.env.NEXT_PUBLIC_ADMOB_PUBLISHER_ID = REAL;
    const res = GET(new Request('https://www.friendly-bets.com/app-ads.txt'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe(`${SELLER_LINE}\n`);
  });
});
