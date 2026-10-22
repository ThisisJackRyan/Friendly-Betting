import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TallyScreen from './TallyScreen';
import { saveBet } from './api';
import { buildSettlement } from './settlement';
import { openShareSheet } from './share';
import { takeFreshBet } from './freshBet';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');

// The real useIdentity runs on this fake auth, as in TallyScreen.test.jsx.
const mockAuth = { currentUser: null, listener: null };

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, onChange) => {
    mockAuth.listener = onChange;
    return () => {
      mockAuth.listener = null;
    };
  }),
  signInAnonymously: jest.fn(async () => ({ user: null })),
}));

jest.mock('../Config/firebase-config', () => ({
  get auth() {
    return mockAuth;
  },
  db: {},
}));

const openBet = {
  id: 'old123',
  code: 'old123',
  schemaVersion: 2,
  type: 'money-line',
  typeLabel: 'Money Line',
  question: 'Who is late',
  stake: '$5',
  createdByName: 'Maya',
  createdByID: 'creator-1',
  status: 'open',
  winnerId: null,
  options: [
    { id: 'a', label: 'Yes' },
    { id: 'b', label: 'No' },
  ],
  votes: [{ voterId: 'anon-1', name: 'Sam', optionId: 'a' }],
};

const settledBet = {
  ...openBet,
  status: 'closed',
  winnerId: 'a',
  settledAt: 1,
  settlement: buildSettlement(openBet, 'a'),
};

const mockBets = { current: {} };

jest.mock('./api', () => ({
  subscribeBet: jest.fn((code, onChange) => {
    onChange(mockBets.current[code] ?? null);
    return () => {};
  }),
  hydrateBet: async (bet) => bet,
  settleBet: jest.fn(async () => {}),
  saveBet: jest.fn(),
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'copied'),
  hasShareSheet: jest.fn(() => true),
  openShareSheet: jest.fn(async () => 'aborted'),
}));

const creator = { uid: 'creator-1', displayName: 'Maya', providerData: [{ providerId: 'phone' }] };
const voter = { uid: 'anon-1', isAnonymous: true, providerData: [{ providerId: 'anonymous' }] };
const otherPhone = { uid: 'creator-9', providerData: [{ providerId: 'phone' }] };

const runItBack = () => screen.queryByRole('button', { name: /run it back|getting it ready/i });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockBets.current = { old123: settledBet };
  mockAuth.currentUser = null;
  saveBet.mockReset();
  navigation.push.mockClear();
  navigation.replace.mockClear();
  navigation.pathname = '/t/old123';
  navigation.params = { code: 'old123' };
  window.sessionStorage.clear();
  openShareSheet.mockClear();
});

afterEach(() => {
  cleanup();
});

async function renderTally(user) {
  jest.useFakeTimers();
  let view;
  try {
    view = render(<div className="phone"><TallyScreen /></div>);
    act(() => {
      jest.advanceTimersByTime(450);
    });
  } finally {
    jest.useRealTimers();
  }
  mockAuth.currentUser = user;
  await act(async () => {
    mockAuth.listener(user);
  });
  return view;
}

describe('who sees Run it back', () => {
  test('the creator on their settled bet', async () => {
    await renderTally(creator);
    expect(runItBack()).toHaveTextContent('Run it back');
    expect(runItBack()).toHaveClass('secondary', 'press');
    expect(runItBack()).toBeEnabled();
  });

  test('not on a called-off bet', async () => {
    mockBets.current = { old123: { ...settledBet, calledOff: true } };
    await renderTally(creator);
    expect(screen.getByText('This bet was called off.')).toBeInTheDocument();
    expect(runItBack()).not.toBeInTheDocument();
  });

  test('not on an open bet', async () => {
    mockBets.current = { old123: openBet };
    await renderTally(creator);
    expect(screen.getByRole('button', { name: /text the crew/i })).toBeInTheDocument();
    expect(runItBack()).not.toBeInTheDocument();
  });

  test('not for a voter or another phone user', async () => {
    await renderTally(voter);
    expect(screen.getByRole('heading', { name: 'The final word' })).toBeInTheDocument();
    expect(runItBack()).not.toBeInTheDocument();
    await act(async () => {
      mockAuth.listener(otherPhone);
    });
    expect(runItBack()).not.toBeInTheDocument();
  });
});

test('one tap makes the same bet, marks it fresh, and pushes its tally', async () => {
  saveBet.mockResolvedValue('new456');
  await renderTally(creator);
  await userEvent.click(runItBack());

  expect(saveBet).toHaveBeenCalledTimes(1);
  const [existing, fields] = saveBet.mock.calls[0];
  expect(existing).toBeNull();
  expect(fields).toEqual({
    schemaVersion: 2,
    type: 'money-line',
    typeLabel: 'Money Line',
    question: 'Who is late',
    stake: '$5',
    closesAt: null,
    options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }],
    line: null,
    rematchOf: { code: 'old123' },
    createdByID: 'creator-1',
    createdByName: 'Maya',
  });
  expect(navigation.push).toHaveBeenCalledWith('/t/new456');
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(takeFreshBet('new456')).toBe(true);
});

test('a double tap makes one bet', async () => {
  const save = deferred();
  saveBet.mockReturnValue(save.promise);
  await renderTally(creator);
  const button = runItBack();
  await act(async () => {
    button.click();
    button.click();
  });
  expect(saveBet).toHaveBeenCalledTimes(1);
  expect(runItBack()).toBeDisabled();
  expect(runItBack()).toHaveTextContent('Getting it ready…');
  await act(async () => {
    save.resolve('new456');
  });
  expect(saveBet).toHaveBeenCalledTimes(1);
  expect(navigation.push).toHaveBeenCalledTimes(1);
});

test('a failed save shows Create’s error and lets the creator try again', async () => {
  saveBet.mockRejectedValueOnce({});
  await renderTally(creator);
  await userEvent.click(runItBack());
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save this bet.');
  expect(runItBack()).toBeEnabled();
  expect(runItBack()).toHaveTextContent('Run it back');
  expect(navigation.push).not.toHaveBeenCalled();
  expect(takeFreshBet('new456')).toBe(false);

  // Denied twice: the save without the rematch link is denied too.
  saveBet.mockRejectedValueOnce({ code: 'permission-denied' });
  saveBet.mockRejectedValueOnce({ code: 'permission-denied' });
  await userEvent.click(runItBack());
  expect(screen.getByRole('alert')).toHaveTextContent('Saving was blocked. Try again in a moment.');

  saveBet.mockResolvedValueOnce('new456');
  await userEvent.click(runItBack());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(navigation.push).toHaveBeenCalledWith('/t/new456');
});

test('leaving mid-save opens no tally', async () => {
  const save = deferred();
  saveBet.mockReturnValue(save.promise);
  const view = await renderTally(creator);
  await act(async () => {
    runItBack().click();
  });
  view.unmount();
  await act(async () => {
    save.resolve('new456');
  });
  expect(navigation.push).not.toHaveBeenCalled();
  expect(takeFreshBet('new456')).toBe(false);
});

test('the new code gets a fresh tally that opens the invite once', async () => {
  saveBet.mockResolvedValue('new456');
  mockBets.current = {
    old123: settledBet,
    new456: { ...openBet, id: 'new456', code: 'new456', votes: [], rematchOf: { code: 'old123' } },
  };
  const view = await renderTally(creator);
  await userEvent.click(runItBack());
  expect(navigation.push).toHaveBeenCalledWith('/t/new456');

  // React Router keeps the same element for a param change; the tally is
  // keyed by code, so it starts over for the new bet.
  navigation.pathname = '/t/new456';
  navigation.params = { code: 'new456' };
  jest.useFakeTimers();
  try {
    view.rerender(<div className="phone"><TallyScreen /></div>);
    act(() => {
      jest.advanceTimersByTime(450);
    });
  } finally {
    jest.useRealTimers();
  }
  await act(async () => {});
  expect(screen.getByRole('heading', { name: 'The picks' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /text the crew/i })).toBeInTheDocument();
  expect(runItBack()).not.toBeInTheDocument();
  expect(openShareSheet).toHaveBeenCalledTimes(1);
});
