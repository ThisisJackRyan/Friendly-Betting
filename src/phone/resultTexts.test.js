import { auth } from '../Config/firebase-config';
import { isNativeApp, PROD_ORIGIN } from '../platform/runtime';
import { normalizeE164, requestResultTexts, resultTextsEnabled, saveResultText } from './resultTexts';

jest.mock('../Config/firebase-config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('../platform/runtime', () => ({
  isNativeApp: jest.fn(() => false),
  PROD_ORIGIN: 'https://www.friendly-bets.com',
}));

const flag = process.env.NEXT_PUBLIC_RESULT_TEXTS;

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  auth.currentUser = { uid: 'anon-1', isAnonymous: true, getIdToken: jest.fn(async () => 'token-1') };
});

afterEach(() => {
  isNativeApp.mockReturnValue(false);
  if (flag === undefined) delete process.env.NEXT_PUBLIC_RESULT_TEXTS;
  else process.env.NEXT_PUBLIC_RESULT_TEXTS = flag;
  delete global.fetch;
});

test.each([
  ['2025550143', '+12025550143'],
  ['(202) 555-0143', '+12025550143'],
  ['202.555.0143', '+12025550143'],
  ['12025550143', '+12025550143'],
  ['+1 (202) 555-0143', '+12025550143'],
  ['+44 20 7946 0958', '+442079460958'],
  ['+4930123456', '+4930123456'],
])('normalizes %p to %p', (input, expected) => {
  expect(normalizeE164(input)).toBe(expected);
});

test.each([
  '',
  null,
  '555',
  '202555014',
  '202555014322',
  '+1234567',
  '+1234567890123456',
  'call me maybe',
  '(012) 555-0143',
  '(102) 555-0143',
  '(202) 055-0143',
  '(202) 155-0143',
  '+1 (102) 555-0143',
  '22025550143',
])('rejects %p', (input) => {
  expect(normalizeE164(input)).toBe('');
});

test('the feature flag is off unless explicitly set to 1', () => {
  delete process.env.NEXT_PUBLIC_RESULT_TEXTS;
  expect(resultTextsEnabled()).toBe(false);
  process.env.NEXT_PUBLIC_RESULT_TEXTS = 'true';
  expect(resultTextsEnabled()).toBe(false);
  process.env.NEXT_PUBLIC_RESULT_TEXTS = '1';
  expect(resultTextsEnabled()).toBe(true);
});

test('saving posts only the phone with the existing anonymous user token', async () => {
  await saveResultText('abc123', '+12025550143');
  expect(auth.currentUser.getIdToken).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('/api/bets/abc123/result-texts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    body: JSON.stringify({ phone: '+12025550143' }),
  });
});

test('a server-rejected number throws invalid-phone; other failures throw a generic error', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'invalid-phone' }) });
  await expect(saveResultText('abc123', '+12025550143')).rejects.toMatchObject({ code: 'invalid-phone' });
  fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'not-configured' }) });
  await expect(saveResultText('abc123', '+12025550143')).rejects.toMatchObject({ code: 'save-failed' });
});

test('a request that never reaches the server is tagged as a network failure', async () => {
  fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(saveResultText('abc123', '+12025550143')).rejects.toMatchObject({ code: 'network' });
});

test('saving never signs in when there is no current user', async () => {
  auth.currentUser = null;
  await expect(saveResultText('abc123', '+12025550143')).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

test('the send request only fires with the flag on and swallows failures', async () => {
  delete process.env.NEXT_PUBLIC_RESULT_TEXTS;
  requestResultTexts('abc123');
  expect(fetch).not.toHaveBeenCalled();

  process.env.NEXT_PUBLIC_RESULT_TEXTS = '1';
  fetch.mockRejectedValueOnce(new Error('offline'));
  expect(() => requestResultTexts('abc123')).not.toThrow();
  expect(fetch).toHaveBeenCalledWith('/api/bets/abc123/result-texts/send', { method: 'POST' });
  fetch.mockImplementationOnce(() => {
    throw new Error('no fetch');
  });
  expect(() => requestResultTexts('abc123')).not.toThrow();
  await Promise.resolve();
});

test('the native app calls the production API, not the bundled app origin', async () => {
  isNativeApp.mockReturnValue(true);
  process.env.NEXT_PUBLIC_RESULT_TEXTS = '1';
  requestResultTexts('abc123');
  expect(fetch).toHaveBeenCalledWith(`${PROD_ORIGIN}/api/bets/abc123/result-texts/send`, { method: 'POST' });
  await saveResultText('abc123', '+12025550143');
  expect(fetch).toHaveBeenLastCalledWith(`${PROD_ORIGIN}/api/bets/abc123/result-texts`, expect.anything());
});

test('the native app saves to the www API with the bearer token and JSON content type', async () => {
  isNativeApp.mockReturnValue(true);
  await saveResultText('abc123', '+12025550143');
  expect(PROD_ORIGIN).toBe('https://www.friendly-bets.com');
  expect(fetch).toHaveBeenCalledWith('https://www.friendly-bets.com/api/bets/abc123/result-texts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    body: JSON.stringify({ phone: '+12025550143' }),
  });
});

test('the native app asks the www API to send texts with a plain POST when the flag is on', () => {
  isNativeApp.mockReturnValue(true);
  delete process.env.NEXT_PUBLIC_RESULT_TEXTS;
  requestResultTexts('abc123');
  expect(fetch).not.toHaveBeenCalled();
  process.env.NEXT_PUBLIC_RESULT_TEXTS = '1';
  requestResultTexts('abc123');
  expect(fetch).toHaveBeenCalledWith('https://www.friendly-bets.com/api/bets/abc123/result-texts/send', { method: 'POST' });
});
