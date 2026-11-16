import { requestBetPush } from './betPush';

jest.mock('./resultTexts', () => ({ apiUrl: (path) => `https://www.friendly-bets.com${path}` }));

const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;
const savedFetch = global.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  global.fetch = jest.fn(async () => ({ ok: true }));
});

afterAll(() => {
  global.fetch = savedFetch;
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

test('posts once to the bet’s push route with no body', () => {
  expect(requestBetPush('abc123')).toBeUndefined();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith('https://www.friendly-bets.com/api/bets/abc123/push', { method: 'POST' });
});

test('encodes the code', () => {
  requestBetPush('a/b');
  expect(global.fetch.mock.calls[0][0]).toBe('https://www.friendly-bets.com/api/bets/a%2Fb/push');
});

test.each([undefined, '', '0', 'true'])('flag %p: never posts', (value) => {
  if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
  requestBetPush('abc123');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a rejected or throwing fetch never surfaces', async () => {
  const rejection = Promise.reject(new Error('offline'));
  global.fetch = jest.fn(() => rejection);
  expect(() => requestBetPush('abc123')).not.toThrow();
  await rejection.catch(() => {});
  global.fetch = jest.fn(() => { throw new Error('no fetch'); });
  expect(() => requestBetPush('abc123')).not.toThrow();
});
