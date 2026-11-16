import { auth } from '../Config/firebase-config';
import { requestBetPush } from './betPush';

jest.mock('./resultTexts', () => ({ apiUrl: (path) => `https://www.friendly-bets.com${path}` }));
jest.mock('../Config/firebase-config', () => ({ db: {}, auth: { currentUser: null } }));

const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;
const savedFetch = global.fetch;
const ID_TOKEN = 'id-token-test';
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

beforeEach(() => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  global.fetch = jest.fn(async () => ({ ok: true }));
  auth.currentUser = { uid: 'creator', getIdToken: jest.fn(async () => ID_TOKEN) };
});

afterAll(() => {
  global.fetch = savedFetch;
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

test('posts once to the bet’s push route with the ID token and no body', async () => {
  expect(requestBetPush('abc123')).toBeUndefined();
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toBe('https://www.friendly-bets.com/api/bets/abc123/push');
  expect(init.method).toBe('POST');
  expect(init.body).toBeUndefined();
  expect(init.headers.Authorization === `Bearer ${ID_TOKEN}`).toBe(true);
});

test('encodes the code', async () => {
  requestBetPush('a/b');
  await flush();
  expect(global.fetch.mock.calls[0][0]).toBe('https://www.friendly-bets.com/api/bets/a%2Fb/push');
});

test.each([undefined, '', '0', 'true'])('flag %p: never posts', async (value) => {
  if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
  requestBetPush('abc123');
  await flush();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(auth.currentUser.getIdToken).not.toHaveBeenCalled();
});

test('no user, no getIdToken, or a failing getIdToken: no post, no throw', async () => {
  auth.currentUser = null;
  expect(() => requestBetPush('abc123')).not.toThrow();
  auth.currentUser = { uid: 'creator' };
  expect(() => requestBetPush('abc123')).not.toThrow();
  auth.currentUser = { uid: 'creator', getIdToken: jest.fn(async () => { throw new Error('auth/network'); }) };
  expect(() => requestBetPush('abc123')).not.toThrow();
  auth.currentUser = { uid: 'creator', getIdToken: jest.fn(() => { throw new Error('sync'); }) };
  expect(() => requestBetPush('abc123')).not.toThrow();
  await flush();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a rejected or throwing fetch never surfaces', async () => {
  global.fetch = jest.fn(async () => { throw new Error('offline'); });
  expect(() => requestBetPush('abc123')).not.toThrow();
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  global.fetch = jest.fn(() => { throw new Error('no fetch'); });
  expect(() => requestBetPush('abc123')).not.toThrow();
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
