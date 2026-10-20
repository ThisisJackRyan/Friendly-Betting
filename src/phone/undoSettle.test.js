import { canUndoSettle, settledAtMs, timestampMs, undoHoldMs, undoRemainingMs } from './undoSettle';

const NOW = 1_800_000_000_000;
const stamp = (ms) => ({ toMillis: () => ms });
const settled = (settledAt) => ({ status: 'closed', winnerId: 'a', createdByID: 'creator-1', settledAt });
const creator = { uid: 'creator-1', providerData: [{ providerId: 'phone' }] };

test('reads Timestamps, their plain form and older numbers', () => {
  expect(timestampMs(stamp(5))).toBe(5);
  expect(timestampMs({ seconds: 2, nanoseconds: 500e6 })).toBe(2500);
  expect(timestampMs(5)).toBeNull();
  expect(settledAtMs({ settledAt: 7 })).toBe(7);
  expect(settledAtMs({ settledAt: { seconds: 1, nanoseconds: 0 } })).toBe(1000);
  expect(settledAtMs({})).toBeNull();
});

test('the window runs 30s from the server settledAt', () => {
  expect(undoRemainingMs(settled(stamp(NOW)), { now: NOW })).toBe(30000);
  expect(undoRemainingMs(settled(stamp(NOW - 12000)), { now: NOW })).toBe(18000);
  expect(undoRemainingMs(settled(stamp(NOW - 30000)), { now: NOW })).toBe(0);
});

test('a client clock behind the server never shows more than 30s', () => {
  expect(undoRemainingMs(settled(stamp(NOW + 10000)), { now: NOW })).toBe(30000);
  // And this screen's own settle time caps it too.
  expect(undoRemainingMs(settled(stamp(NOW + 10000)), { now: NOW + 5000, localAt: NOW })).toBe(25000);
});

test('before the server time arrives, this screen’s settle time counts', () => {
  expect(undoRemainingMs(settled(null), { now: NOW + 1000, localAt: NOW })).toBe(29000);
  expect(undoRemainingMs(settled(null), { now: NOW })).toBe(0);
});

test('no undo for older number settles, open bets or call-offs', () => {
  expect(undoRemainingMs(settled(NOW), { now: NOW, localAt: NOW })).toBe(0);
  expect(undoRemainingMs({ status: 'open' }, { now: NOW, localAt: NOW })).toBe(0);
  expect(undoRemainingMs({ ...settled(stamp(NOW)), calledOff: true }, { now: NOW })).toBe(0);
});

test('only the creator can undo', () => {
  const bet = settled(stamp(NOW));
  expect(canUndoSettle(creator, bet, { now: NOW })).toBe(true);
  expect(canUndoSettle({ ...creator, uid: 'someone' }, bet, { now: NOW })).toBe(false);
  expect(canUndoSettle({ uid: 'creator-1', providerData: [{ providerId: 'anonymous' }] }, bet, { now: NOW })).toBe(false);
});

test('the result-text server holds off for the 35s rules window', () => {
  expect(undoHoldMs(settled(stamp(NOW - 2000)), NOW)).toBe(33000);
  expect(undoHoldMs(settled(stamp(NOW - 40000)), NOW)).toBe(0);
  expect(undoHoldMs(settled(NOW), NOW)).toBe(0);
  expect(undoHoldMs({ status: 'closed', calledOff: true, settledAt: stamp(NOW) }, NOW)).toBe(0);
});
