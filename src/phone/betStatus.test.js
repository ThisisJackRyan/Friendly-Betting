import { isCalledOff, isClosed, isFinished, isSettled, statusLabel, votingOpen } from './betStatus';
import { statusLabel as modelStatusLabel, votingOpen as modelVotingOpen } from './model';

const open = { status: 'open', closesAt: null, winnerId: null };
const settled = { ...open, status: 'closed', winnerId: 'a' };
// Both ways a bet can be called off: the status alone, or the flag (which
// the settle write may add next to a winnerId).
const CALLED_OFF = [
  ['status called-off', { ...open, status: 'called-off' }],
  ['calledOff flag on an open bet', { ...open, calledOff: true }],
  ['calledOff flag on a settled bet', { ...settled, calledOff: true }],
];

test.each(CALLED_OFF)('%s is called off, closed, never settled', (_label, bet) => {
  expect(isCalledOff(bet)).toBe(true);
  expect(isSettled(bet)).toBe(false);
  expect(isFinished(bet)).toBe(true);
  expect(isClosed(bet)).toBe(true);
  expect(votingOpen(bet)).toBe(false);
  expect(statusLabel(bet)).toBe('Closed');
});

test('an open bet is open until its close time', () => {
  expect(isCalledOff(open)).toBe(false);
  expect(isClosed(open)).toBe(false);
  expect(votingOpen(open)).toBe(true);
  expect(statusLabel(open)).toBe('Open');
  const timed = { ...open, closesAt: 100 };
  expect(votingOpen(timed, 99)).toBe(true);
  expect(votingOpen(timed, 100)).toBe(false);
  expect(isFinished(timed)).toBe(false);
  expect(statusLabel(timed, 100)).toBe('Closed');
});

test('legacy bets with no status are open', () => {
  expect(votingOpen({ bet: 'Who wins' })).toBe(true);
  expect(statusLabel({ bet: 'Who wins' })).toBe('Open');
});

test('closed without a winner is finished, not settled; with a winner it is settled', () => {
  const closed = { ...open, status: 'closed' };
  expect(isFinished(closed)).toBe(true);
  expect(isSettled(closed)).toBe(false);
  expect(statusLabel(closed)).toBe('Closed');
  expect(isSettled(settled)).toBe(true);
  expect(statusLabel(settled)).toBe('Settled');
});

test('calledOff: false and other statuses are not called off', () => {
  expect(isCalledOff({ ...open, calledOff: false })).toBe(false);
  expect(isCalledOff({ ...open, calledOff: 'true' })).toBe(false);
  expect(isCalledOff(null)).toBe(false);
  expect(isClosed(null)).toBe(true);
  expect(statusLabel(null)).toBe('');
});

test('model re-exports the same functions', () => {
  expect(modelVotingOpen).toBe(votingOpen);
  expect(modelStatusLabel).toBe(statusLabel);
});
