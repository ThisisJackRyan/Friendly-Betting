import { act, renderHook } from '@testing-library/react';
import { hydrateBet, subscribeBet } from './api';
import { useLiveBet } from './useLiveBet';

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
