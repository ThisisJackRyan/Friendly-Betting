import { markFreshBet, takeFirstBet, takeFreshBet } from './freshBet';

beforeEach(() => window.sessionStorage.clear());

test('a fresh bet is taken once, then never again', () => {
  markFreshBet('abc123');
  expect(takeFreshBet('abc123')).toBe(true);
  expect(takeFreshBet('abc123')).toBe(false);
});

test('another bet clears the note without taking it', () => {
  markFreshBet('abc123');
  expect(takeFreshBet('zzz999')).toBe(false);
  expect(takeFreshBet('abc123')).toBe(false);
});

test('no storage means no fresh bet', () => {
  const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  try {
    expect(takeFreshBet('abc123')).toBe(false);
  } finally {
    spy.mockRestore();
  }
});

test('a first-bet note rides along only when asked for, and is taken once', () => {
  markFreshBet('abc123', { first: true });
  expect(takeFreshBet('abc123')).toBe(true);
  expect(takeFirstBet('abc123')).toBe(true);
  expect(takeFirstBet('abc123')).toBe(false);
});

test('a later bet clears a stale first-bet note', () => {
  markFreshBet('abc123', { first: true });
  markFreshBet('def456');
  expect(takeFirstBet('def456')).toBe(false);
  expect(takeFirstBet('abc123')).toBe(false);
  expect(takeFreshBet('def456')).toBe(true);
});

test('a first-bet note for another bet is cleared without counting', () => {
  markFreshBet('abc123', { first: true });
  expect(takeFirstBet('zzz999')).toBe(false);
  expect(takeFirstBet('abc123')).toBe(false);
});
