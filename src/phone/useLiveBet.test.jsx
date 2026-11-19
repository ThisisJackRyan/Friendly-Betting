import { act, renderHook } from '@testing-library/react';
import { hydrateBet, subscribeBet } from './api';
import { CACHE_MISS_GRACE_MS, useLiveBet } from './useLiveBet';

jest.mock('./api', () => ({
  subscribeBet: jest.fn(),
  hydrateBet: jest.fn(),
}));

const legacy = (bet) => ({ id: 'old1', betID: 'ml-1', type: 'Money Line', bet });

let feeds;
let pending;

beforeEach(() => {
  feeds = [];
  pending = [];
  subscribeBet.mockImplementation((code, onChange) => {
    const feed = { code, onChange, unsubscribe: jest.fn() };
    feeds.push(feed);
    return feed.unsubscribe;
  });
  hydrateBet.mockImplementation((bet) => new Promise((resolve, reject) => {
    pending.push({ bet, resolve: () => resolve({ ...bet, hydrated: true }), reject });
  }));
});

afterEach(() => {
  delete document.visibilityState;
  jest.useRealTimers();
});

test('a slow hydrate never overwrites a newer snapshot', async () => {
  const { result } = renderHook(() => useLiveBet('old1'));
  act(() => feeds[0].onChange(legacy('first')));
  act(() => feeds[0].onChange(legacy('second')));
  await act(async () => pending[1].resolve());
  expect(result.current.bet).toMatchObject({ bet: 'second', hydrated: true });
  await act(async () => pending[0].resolve());
  expect(result.current.bet).toMatchObject({ bet: 'second' });
});

test('a hydrate from a replaced listener is ignored', async () => {
  const { result } = renderHook(() => useLiveBet('old1'));
  act(() => feeds[0].onChange(legacy('before')));
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(feeds[0].unsubscribe).toHaveBeenCalledTimes(1);
  await act(async () => pending[0].resolve());
  expect(result.current.bet).toBeUndefined();
  act(() => feeds[1].onChange(legacy('after')));
  await act(async () => pending[1].resolve());
  expect(result.current.bet).toMatchObject({ bet: 'after', hydrated: true });
});

test('a hydrate that lands after unmount is dropped', async () => {
  const { result, unmount } = renderHook(() => useLiveBet('old1'));
  act(() => feeds[0].onChange(legacy('late')));
  unmount();
  expect(feeds[0].unsubscribe).toHaveBeenCalledTimes(1);
  await act(async () => pending[0].resolve());
  expect(result.current.bet).toBeUndefined();
});

test('a new code drops the old bet and listener', () => {
  const { result, rerender } = renderHook(({ code }) => useLiveBet(code), { initialProps: { code: 'aaa111' } });
  act(() => feeds[0].onChange({ id: 'aaa111', schemaVersion: 2, options: [] }));
  expect(result.current.bet).toMatchObject({ id: 'aaa111' });
  rerender({ code: 'bbb222' });
  expect(feeds[0].unsubscribe).toHaveBeenCalledTimes(1);
  expect(feeds[1].code).toBe('bbb222');
  expect(result.current.bet).toBeUndefined();
});

const v2 = (extra = {}) => ({ id: 'aaa111', schemaVersion: 2, options: [], ...extra });

test('a delete the server confirms clears a loaded bet, even mid-hydrate', async () => {
  const { result } = renderHook(() => useLiveBet('old1'));
  act(() => feeds[0].onChange(v2()));
  act(() => feeds[0].onChange(legacy('pending')));
  act(() => feeds[0].onChange(null, undefined, { fromCache: false }));
  expect(result.current.bet).toBeNull();
  expect(result.current.failed).toBe(false);
  await act(async () => pending[0].resolve());
  expect(result.current.bet).toBeNull();
});

test('an offline cache miss or error never blanks a loaded bet', () => {
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(v2({ votes: [1] })));
  act(() => feeds[0].onChange(null, undefined, { fromCache: true }));
  act(() => feeds[0].onChange(undefined, new Error('unavailable')));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
});

const cacheMiss = { fromCache: true };
const serverMiss = { fromCache: false };

test('a first-load cache miss keeps the loader, then the server hit shows the bet', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(null, undefined, cacheMiss));
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS - 1));
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);
  act(() => feeds[0].onChange(v2({ votes: [1] }), undefined, serverMiss));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS * 2));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
});

test('a first-load cache miss then a server miss is gone, not a load failure', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(null, undefined, cacheMiss));
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS - 1));
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);
  act(() => feeds[0].onChange(null, undefined, serverMiss));
  expect(result.current.bet).toBeNull();
  expect(result.current.failed).toBe(false);
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS * 2));
  expect(result.current.bet).toBeNull();
  expect(result.current.failed).toBe(false);
});

test('a first-load cache miss is a load failure once the grace period runs out twice', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(null, undefined, cacheMiss));
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS - 1));
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);
  // The first deadline opens one fresh listener, silently.
  act(() => jest.advanceTimersByTime(1));
  expect(feeds).toHaveLength(2);
  expect(feeds[0].unsubscribe).toHaveBeenCalledTimes(1);
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);
  act(() => feeds[1].onChange(null, undefined, cacheMiss));
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS - 1));
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);
  act(() => jest.advanceTimersByTime(1));
  expect(feeds).toHaveLength(2);
  expect(result.current.bet).toBeNull();
  expect(result.current.failed).toBe(true);
  act(() => feeds[1].onChange(null, undefined, serverMiss));
  expect(result.current.bet).toBeNull();
  expect(result.current.failed).toBe(false);
});

test('a first-load cache miss whose retry never answers still fails at the deadline', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(null, undefined, cacheMiss));
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS));
  expect(feeds).toHaveLength(2);
  expect(result.current.failed).toBe(false);
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS));
  expect(result.current.bet).toBeNull();
  expect(result.current.failed).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('a slow cold load that answers inside the longer grace window shows the bet', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(null, undefined, cacheMiss));
  // Past the old 1500ms window, still loading.
  act(() => jest.advanceTimersByTime(3000));
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);
  act(() => feeds[0].onChange(v2({ votes: [1] }), undefined, serverMiss));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
  expect(feeds).toHaveLength(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('a cache miss that outlasts the grace window is retried once, and the retry shows the bet', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(null, undefined, cacheMiss));
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS));
  expect(feeds).toHaveLength(2);
  act(() => feeds[1].onChange(null, undefined, cacheMiss));
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS - 1));
  act(() => feeds[1].onChange(v2({ votes: [1] }), undefined, serverMiss));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS * 2));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
});

test('a first-load snapshot error is retried once silently, and the retry shows the bet', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(undefined, new Error('unavailable')));
  expect(feeds).toHaveLength(2);
  expect(feeds[0].unsubscribe).toHaveBeenCalledTimes(1);
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);
  act(() => feeds[1].onChange(v2({ votes: [1] }), undefined, serverMiss));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS * 2));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
});

test('a first-load snapshot error twice is a load failure', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(undefined, new Error('permission-denied')));
  act(() => feeds[1].onChange(undefined, new Error('permission-denied')));
  expect(feeds).toHaveLength(2);
  expect(result.current.bet).toBeNull();
  expect(result.current.failed).toBe(true);
});

test('a snapshot error during the grace period retries, and a second error fails', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(null, undefined, cacheMiss));
  expect(result.current.failed).toBe(false);
  act(() => feeds[0].onChange(undefined, new Error('unavailable')));
  expect(feeds).toHaveLength(2);
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);
  act(() => feeds[1].onChange(undefined, new Error('unavailable')));
  expect(result.current.bet).toBeNull();
  expect(result.current.failed).toBe(true);
});

test('a listener that errors synchronously is closed when the retry replaces it', () => {
  subscribeBet.mockImplementation((code, onChange) => {
    const feed = { code, onChange, unsubscribe: jest.fn() };
    feeds.push(feed);
    if (feeds.length === 1) onChange(undefined, new Error('unavailable'));
    return feed.unsubscribe;
  });
  const { result, unmount } = renderHook(() => useLiveBet('aaa111'));
  expect(feeds).toHaveLength(2);
  expect(feeds[0].unsubscribe).toHaveBeenCalledTimes(1);
  expect(feeds[1].unsubscribe).not.toHaveBeenCalled();
  expect(result.current.failed).toBe(false);
  unmount();
  expect(feeds[1].unsubscribe).toHaveBeenCalledTimes(1);
});

test('a cache miss after a loaded bet is ignored, and a server miss then shows gone', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(v2({ votes: [1] })));
  act(() => feeds[0].onChange(null, undefined, cacheMiss));
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS * 2));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
  act(() => feeds[0].onChange(null, undefined, serverMiss));
  expect(result.current.bet).toBeNull();
  expect(result.current.failed).toBe(false);
});

test('the grace timer is dropped on unmount and on a code change', () => {
  jest.useFakeTimers();
  const first = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(null, undefined, cacheMiss));
  first.unmount();
  expect(jest.getTimerCount()).toBe(0);

  const { result, rerender } = renderHook(({ code }) => useLiveBet(code), { initialProps: { code: 'aaa111' } });
  act(() => feeds[1].onChange(null, undefined, cacheMiss));
  rerender({ code: 'bbb222' });
  expect(jest.getTimerCount()).toBe(0);
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS * 2));
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);
});

test.each(['visibilitychange', 'online'])('a %s resubscribe inside the grace window drops the old timer', (event) => {
  jest.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  const target = event === 'online' ? window : document;
  const { result } = renderHook(() => useLiveBet('aaa111'));
  act(() => feeds[0].onChange(null, undefined, cacheMiss));
  expect(jest.getTimerCount()).toBe(1);
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);

  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS - 500));
  act(() => target.dispatchEvent(new Event(event)));
  expect(feeds).toHaveLength(2);
  expect(feeds[0].unsubscribe).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);

  // Past the original deadline: the old timer never fires.
  act(() => jest.advanceTimersByTime(1000));
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);

  // A cache miss on the new feed starts a fresh grace wait.
  act(() => feeds[1].onChange(null, undefined, cacheMiss));
  expect(jest.getTimerCount()).toBe(1);
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS - 1));
  expect(result.current.bet).toBeUndefined();
  expect(result.current.failed).toBe(false);

  // The server hit on the new feed shows the bet with no flash.
  act(() => feeds[1].onChange(v2({ votes: [1] }), undefined, serverMiss));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
  act(() => jest.advanceTimersByTime(CACHE_MISS_GRACE_MS * 2));
  expect(result.current.bet).toMatchObject({ votes: [1] });
  expect(result.current.failed).toBe(false);
});

test('a bad code is not-found on the first server snapshot', () => {
  const { result } = renderHook(() => useLiveBet('nope99'));
  act(() => feeds[0].onChange(null, undefined, { fromCache: false }));
  expect(result.current.bet).toBeNull();
  expect(result.current.failed).toBe(false);
});
