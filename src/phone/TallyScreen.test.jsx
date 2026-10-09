import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TallyScreen from './TallyScreen';
import { settleBet, subscribeBet } from './api';
import { buildSettlement } from './settlement';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');

// The real useIdentity runs on top of this fake auth, so the tally sees the
// same onAuthStateChanged updates it would in the browser.
const mockAuth = { currentUser: null, listener: null };
const mockSignInAnonymously = jest.fn();

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, onChange) => {
    mockAuth.listener = onChange;
    return () => {
      mockAuth.listener = null;
    };
  }),
  signInAnonymously: (...args) => mockSignInAnonymously(...args),
}));

jest.mock('../Config/firebase-config', () => ({
  get auth() {
    return mockAuth;
  },
  db: {},
}));

const openBet = {
  id: 'abc123',
  code: 'abc123',
  schemaVersion: 2,
  type: 'money-line',
  typeLabel: 'Money Line',
  question: 'Who is late',
  createdByName: 'Maya',
  createdByID: 'creator-1',
  status: 'open',
  winnerId: null,
  options: [
    { id: 'a', label: 'Yes' },
    { id: 'b', label: 'No' },
  ],
  votes: [],
};

const mockBet = { current: openBet };

jest.mock('./api', () => ({
  subscribeBet: jest.fn((_code, onChange) => {
    onChange(mockBet.current);
    return () => {};
  }),
  hydrateBet: async (bet) => ({ ...bet, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], votes: [] }),
  settleBet: jest.fn(async () => {}),
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'copied'),
}));

const anon = { uid: 'anon-1', isAnonymous: true, providerData: [{ providerId: 'anonymous' }] };
const creator = { uid: 'creator-1', phoneNumber: '+15551234567', providerData: [{ providerId: 'phone' }] };
const otherPhone = { uid: 'creator-9', phoneNumber: '+15550000000', providerData: [{ providerId: 'phone' }] };

beforeEach(() => {
  mockBet.current = openBet;
  mockAuth.currentUser = null;
  mockSignInAnonymously.mockReset();
  mockSignInAnonymously.mockImplementation(async () => {
    mockAuth.currentUser = anon;
    return { user: anon };
  });
  settleBet.mockClear();
  subscribeBet.mockClear();
  navigation.pathname = '/t/abc123';
  navigation.params = { code: 'abc123' };
});

async function signIn(user) {
  mockAuth.currentUser = user;
  await act(async () => {
    mockAuth.listener(user);
  });
}

async function renderTally() {
  jest.useFakeTimers();
  try {
    render(
      <div className="phone">
        <TallyScreen />
      </div>,
    );
    act(() => {
      jest.advanceTimersByTime(450);
    });
  } finally {
    jest.useRealTimers();
  }
  // Let any hydrateBet promise settle.
  await act(async () => {});
}

const closeButton = () => screen.queryByRole('button', { name: /close & settle/i });

test('auth changes re-check the creator: logged out, then creator, then another phone', async () => {
  await renderTally();
  expect(screen.getByText('Who is late')).toBeInTheDocument();
  expect(closeButton()).not.toBeInTheDocument();

  // Signed out: identity falls back to a fresh anonymous session.
  await act(async () => {
    mockAuth.listener(null);
  });
  expect(mockSignInAnonymously).toHaveBeenCalled();
  expect(closeButton()).not.toBeInTheDocument();

  await signIn(creator);
  expect(closeButton()).toHaveClass('danger', 'press');

  await signIn(otherPhone);
  expect(closeButton()).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();

  await signIn(creator);
  await userEvent.click(closeButton());
  expect(screen.getByText('Who won?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'No' }));
  await userEvent.click(screen.getByRole('button', { name: 'Settle & notify' }));
  expect(settleBet).toHaveBeenCalledWith('abc123', 'b');
});

test('the picker closes if the creator session goes away mid-settle', async () => {
  await renderTally();
  await signIn(creator);
  await userEvent.click(closeButton());
  expect(screen.getByText('Who won?')).toBeInTheDocument();

  await signIn(anon);
  expect(screen.queryByText('Who won?')).not.toBeInTheDocument();
  expect(closeButton()).not.toBeInTheDocument();
  expect(settleBet).not.toHaveBeenCalled();
});

test('an anonymous voter sees no close and settle', async () => {
  await renderTally();
  await signIn(anon);
  expect(screen.getByRole('button', { name: 'Text the crew' })).toBeInTheDocument();
  expect(closeButton()).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
});

test('a legacy bet without a creator uid shows no close and settle and still renders', async () => {
  mockBet.current = { id: 'legacy1', betID: 'ml-1', type: 'Money Line', bet: 'Who wins' };
  navigation.params = { code: 'legacy1' };
  await renderTally();
  await signIn(creator);
  expect(screen.getByText('Who wins')).toBeInTheDocument();
  expect(closeButton()).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
});

test('an already settled bet shows the result and no close and settle, even to the creator', async () => {
  mockBet.current = {
    ...openBet,
    status: 'closed',
    winnerId: 'a',
    settledAt: 1,
    settlement: buildSettlement(openBet, 'a'),
  };
  await renderTally();
  await signIn(creator);
  expect(screen.getByRole('heading', { name: 'The final word' })).toBeInTheDocument();
  expect(closeButton()).not.toBeInTheDocument();
});

test('the creator can still settle a bet that closed without a winner', async () => {
  mockBet.current = { ...openBet, status: 'closed', winnerId: null };
  await renderTally();
  await signIn(creator);
  expect(closeButton()).toBeInTheDocument();
  await signIn(otherPhone);
  expect(closeButton()).not.toBeInTheDocument();
});

describe('live tally', () => {
  // Every subscribeBet call becomes a feed the test can push snapshots into.
  let feeds;
  const live = () => feeds.filter((feed) => !feed.unsubscribe.mock.calls.length);
  // meta mirrors subscribeBet's third argument; fromCache marks an offline miss.
  const push = async (bet, err, meta = { fromCache: false }) => {
    await act(async () => {
      live().forEach((feed) => feed.onChange(bet, err, meta));
    });
  };
  const setVisibility = async (state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  };
  const counts = () => [...document.querySelectorAll('.bar-count')].map((node) => node.textContent);
  const widths = () => [...document.querySelectorAll('.bar-fill')].map((node) => node.style.width);
  const vote = (voterId, optionId) => ({ voterId, name: voterId, optionId });

  beforeEach(() => {
    feeds = [];
    subscribeBet.mockImplementation((code, onChange) => {
      const feed = { code, onChange, unsubscribe: jest.fn() };
      feeds.push(feed);
      onChange(mockBet.current);
      return feed.unsubscribe;
    });
  });

  afterEach(() => {
    // No leaks: once the screen is gone, every listener has been unsubscribed once.
    cleanup();
    feeds.forEach((feed) => expect(feed.unsubscribe).toHaveBeenCalledTimes(1));
    delete document.visibilityState;
    subscribeBet.mockImplementation((_code, onChange) => {
      onChange(mockBet.current);
      return () => {};
    });
  });

  test('subscribes once and tears the listener down on unmount, leaving no listeners', async () => {
    const added = jest.spyOn(document, 'addEventListener');
    const removed = jest.spyOn(document, 'removeEventListener');
    const winAdded = jest.spyOn(window, 'addEventListener');
    const winRemoved = jest.spyOn(window, 'removeEventListener');
    try {
      jest.useFakeTimers();
      const { unmount } = render(<TallyScreen />);
      act(() => {
        jest.advanceTimersByTime(450);
      });
      jest.useRealTimers();
      expect(feeds).toHaveLength(1);
      expect(feeds[0].code).toBe('abc123');
      expect(live()).toHaveLength(1);
      const onVisible = added.mock.calls.find(([type]) => type === 'visibilitychange')[1];
      const onOnline = winAdded.mock.calls.find(([type]) => type === 'online')[1];

      unmount();
      expect(feeds[0].unsubscribe).toHaveBeenCalledTimes(1);
      expect(live()).toHaveLength(0);
      expect(removed).toHaveBeenCalledWith('visibilitychange', onVisible);
      expect(winRemoved).toHaveBeenCalledWith('online', onOnline);

      // A late snapshot or visibility change after unmount does nothing.
      feeds[0].onChange({ ...openBet, votes: [vote('x', 'a')] });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(feeds).toHaveLength(1);
    } finally {
      jest.useRealTimers();
      added.mockRestore();
      removed.mockRestore();
      winAdded.mockRestore();
      winRemoved.mockRestore();
    }
  });

  test('new picks update the counts and bars without a reload', async () => {
    await renderTally();
    expect(counts()).toEqual(['0 · 0%', '0 · 0%']);
    expect(widths()).toEqual(['0%', '0%']);

    await push({ ...openBet, votes: [vote('v1', 'a')] });
    expect(counts()).toEqual(['1 · 100%', '0 · 0%']);
    expect(widths()).toEqual(['100%', '0%']);

    await push({ ...openBet, votes: [vote('v1', 'a'), vote('v2', 'b'), vote('v3', 'b'), vote('v4', 'b')] });
    expect(counts()).toEqual(['1 · 25%', '3 · 75%']);
    expect(widths()).toEqual(['25%', '75%']);
    expect(feeds).toHaveLength(1);
  });

  test('a new pick adds that name under its side live, and settling swaps the lists for the reveal', async () => {
    const named = (voterId, name, optionId) => ({ voterId, name, optionId });
    const list = (index) => document.querySelectorAll('.bar-row')[index].querySelector('.voter-list');
    await renderTally();
    expect(document.querySelector('.voter-list')).toBeNull();

    await push({ ...openBet, votes: [named('v1', 'Jake', 'a')] });
    expect(list(0)).toHaveAttribute('aria-label', 'Picked by Jake');
    expect(list(1)).toBeNull();

    const votes = [named('v1', 'Jake', 'a'), named('v2', 'Maya', 'b'), named('v3', '', 'b')];
    await push({ ...openBet, votes });
    expect(list(1)).toHaveAttribute('aria-label', 'Picked by Maya and 1 friend');
    expect(list(1)).toHaveTextContent('Maya1 friend');

    const voted = { ...openBet, votes };
    await push({ ...voted, status: 'closed', winnerId: 'a', settledAt: 1, settlement: buildSettlement(voted, 'a') });
    expect(screen.queryByText('Final tally')).not.toBeInTheDocument();
    expect(document.querySelector('.bars, .voter-list')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Jake won.' })).toBeInTheDocument();
    expect(feeds).toHaveLength(1);
  });

  test('coming back to the tab swaps in a fresh listener, one at a time', async () => {
    await renderTally();
    await setVisibility('hidden');
    expect(feeds).toHaveLength(1);

    await setVisibility('visible');
    expect(feeds).toHaveLength(2);
    expect(feeds[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(live()).toEqual([feeds[1]]);

    // Snapshots from the old listener are ignored; the new one drives the tally.
    await act(async () => {
      feeds[0].onChange({ ...openBet, votes: [vote('old', 'b')] });
    });
    expect(counts()).toEqual(['0 · 0%', '0 · 0%']);
    await push({ ...openBet, votes: [vote('v1', 'a')] });
    expect(counts()).toEqual(['1 · 100%', '0 · 0%']);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(feeds).toHaveLength(3);
    expect(live()).toEqual([feeds[2]]);
    feeds.slice(0, 2).forEach((feed) => expect(feed.unsubscribe).toHaveBeenCalledTimes(1));
  });

  test('a snapshot error or offline miss keeps the last tally on screen with no new error', async () => {
    await renderTally();
    await push({ ...openBet, votes: [vote('v1', 'a'), vote('v2', 'b')] });
    expect(counts()).toEqual(['1 · 50%', '1 · 50%']);

    await push(undefined, Object.assign(new Error('offline'), { code: 'unavailable' }));
    expect(screen.getByText('Who is late')).toBeInTheDocument();
    expect(counts()).toEqual(['1 · 50%', '1 · 50%']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('This bet’s off the table.')).not.toBeInTheDocument();

    // Offline, Firestore can report the doc missing from its cache. That is not a delete.
    await push(null, undefined, { fromCache: true });
    expect(counts()).toEqual(['1 · 50%', '1 · 50%']);
    expect(screen.queryByText('This bet’s off the table.')).not.toBeInTheDocument();

    // Back on the tab, the fresh listener picks up where it left off.
    await setVisibility('visible');
    await push({ ...openBet, votes: [vote('v1', 'a'), vote('v2', 'b'), vote('v3', 'b')] });
    expect(counts()).toEqual(['1 · 33%', '2 · 67%']);
  });

  test('a failed first load still shows the existing error', async () => {
    subscribeBet.mockImplementation((code, onChange) => {
      const feed = { code, onChange, unsubscribe: jest.fn() };
      feeds.push(feed);
      onChange(undefined, new Error('permission-denied'));
      return feed.unsubscribe;
    });
    await renderTally();
    expect(screen.getByText('This bet’s off the table.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the crew’s picks. Try again in a bit.');
  });

  test('a delete the server confirms swaps the tally for the not-found screen live', async () => {
    await renderTally();
    await push({ ...openBet, votes: [vote('v1', 'a')] });
    expect(counts()).toEqual(['1 · 100%', '0 · 0%']);

    await push(null);
    expect(screen.getByText('This bet’s off the table.')).toBeInTheDocument();
    expect(screen.getByText('It was deleted, or the link’s not quite right.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a bet' })).toHaveAttribute('href', '/new');
    expect(screen.queryByText('Who is late')).not.toBeInTheDocument();
    expect(document.querySelector('.bar-count')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a bad code shows the not-found screen on first load', async () => {
    subscribeBet.mockImplementation((code, onChange) => {
      const feed = { code, onChange, unsubscribe: jest.fn() };
      feeds.push(feed);
      onChange(null, undefined, { fromCache: false });
      return feed.unsubscribe;
    });
    await renderTally();
    expect(screen.getByText('This bet’s off the table.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a bet' })).toHaveAttribute('href', '/new');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('an offline cache miss on first load waits on the server before calling it gone', async () => {
    subscribeBet.mockImplementation((code, onChange) => {
      const feed = { code, onChange, unsubscribe: jest.fn() };
      feeds.push(feed);
      onChange(null, undefined, { fromCache: true });
      return feed.unsubscribe;
    });
    await renderTally();
    // Same as any failed first load: the existing load error, no claim it was deleted.
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the crew’s picks. Try again in a bit.');

    await push({ ...openBet, votes: [vote('v1', 'a')] });
    expect(counts()).toEqual(['1 · 100%', '0 · 0%']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('settling elsewhere flips the tally live and removes Close & settle', async () => {
    await renderTally();
    await signIn(creator);
    expect(closeButton()).toBeInTheDocument();
    await userEvent.click(closeButton());
    expect(screen.getByText('Who won?')).toBeInTheDocument();

    const votes = [vote('v1', 'a'), vote('v2', 'b')];
    await push({ ...openBet, votes, status: 'closed', winnerId: null });
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Who won?')).toBeInTheDocument();

    await push({
      ...openBet,
      votes,
      status: 'closed',
      winnerId: 'b',
      settledAt: 1,
      settlement: buildSettlement({ ...openBet, votes }, 'b'),
    });
    expect(screen.getByRole('heading', { name: 'The final word' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Settled result' })).toHaveTextContent('No won');
    expect(screen.queryByText('Final tally')).not.toBeInTheDocument();
    expect(document.querySelector('.bar-row')).toBeNull();
    expect(closeButton()).not.toBeInTheDocument();
    expect(screen.queryByText('Who won?')).not.toBeInTheDocument();
    expect(settleBet).not.toHaveBeenCalled();
  });
});
