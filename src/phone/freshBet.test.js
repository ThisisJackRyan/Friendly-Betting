import { markFreshBet, takeFreshBet } from './freshBet';

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
