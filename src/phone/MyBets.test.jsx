import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DELETE_WAIT_MS, MyBetsList } from './MyBets';
import { deleteBet, subscribeMyBets } from './api';
import { PHONE_OFFLINE_ERROR } from './creatorSession';
import { signOutCreator } from './creatorAuth';
import { clearLocalAccountData, deleteAccount, markDeleteAccountResume, RESUME_KEY } from './accountApi';
import { useEntitlementState } from './useEntitlement';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./identity', () => ({ useIdentity: () => null }));
jest.mock('./creatorAuth', () => ({ signOutCreator: jest.fn() }));
jest.mock('./api', () => ({ subscribeMyBets: jest.fn(), deleteBet: jest.fn() }));
jest.mock('../Config/firebase-config', () => ({ auth: null, db: null }));
jest.mock('./accountApi', () => {
  const actual = jest.requireActual('./accountApi');
  return { ...actual, deleteAccount: jest.fn(), clearLocalAccountData: jest.fn(async () => {}) };
});
jest.mock('./useEntitlement', () => {
  const actual = jest.requireActual('./useEntitlement');
  return { ...actual, useEntitlementState: jest.fn(actual.useEntitlementState) };
});
jest.mock('./FriendlyLoader', () => ({
  __esModule: true,
  default: () => <p>Loading</p>,
  useMinHold: () => true,
}));

const user = { uid: 'creator', providerData: [{ providerId: 'phone' }] };
const options = [
  { id: 'a', label: 'Yes' },
  { id: 'b', label: 'No' },
];
const bets = [
  {
    id: 'golf',
    createdByID: 'creator',
    schemaVersion: 2,
    type: 'money-line',
    question: 'Will Alex break 90?',
    status: 'open',
    stake: 'Coffee',
    options,
    votes: [{ voterId: 'sam', optionId: 'a' }],
  },
  {
    id: 'game',
    createdByID: 'creator',
    schemaVersion: 2,
    type: 'prop',
    question: 'Who wins game night?',
    status: 'closed',
    winnerId: 'b',
    options,
    votes: [],
  },
  {
    id: 'expired',
    createdByID: 'creator',
    schemaVersion: 2,
    type: 'over-under',
    question: 'Total points tonight?',
    status: 'open',
    closesAt: 1,
    options,
    votes: [],
  },
];

let publishBets;

beforeEach(() => {
  subscribeMyBets.mockImplementation((_uid, publish) => {
    publishBets = publish;
    publish(bets);
    return () => {};
  });
  deleteBet.mockReset();
});

test('filters real bets by status, including expired bets, and preserves tally links', async () => {
  render(<MyBetsList user={user} />);
  expect(subscribeMyBets).toHaveBeenCalledWith('creator', expect.any(Function));
  const filters = screen.getByRole('group', { name: 'Filter bets by status' });
  await userEvent.click(within(filters).getByRole('button', { name: 'Open 1' }));
  expect(screen.getByRole('link', { name: /Will Alex break 90/ })).toHaveAttribute(
    'href',
    '/t/golf',
  );
  expect(screen.getByText('1 pick')).toBeInTheDocument();
  expect(screen.queryByText('Who wins game night?')).not.toBeInTheDocument();
  await userEvent.click(within(filters).getByRole('button', { name: 'Closed 1' }));
  expect(screen.getByText('Total points tonight?')).toBeInTheDocument();
  expect(screen.queryByText('Will Alex break 90?')).not.toBeInTheDocument();
  await userEvent.click(within(filters).getByRole('button', { name: 'Settled 1' }));
  expect(screen.getByText('No takes it')).toBeInTheDocument();
});

test.each([
  ['status called-off', { status: 'called-off' }],
  ['calledOff flag on an open bet', { calledOff: true }],
  ['calledOff flag on a settled bet', { status: 'closed', winnerId: 'a', settledAt: 1, calledOff: true }],
])('a called-off bet (%s) counts as Closed, never Open or Settled', async (_label, patch) => {
  const off = {
    id: 'off', createdByID: 'creator', schemaVersion: 2, type: 'money-line', question: 'Rain delay?',
    status: 'open', options, votes: [{ voterId: 'sam', optionId: 'a' }], ...patch,
  };
  subscribeMyBets.mockImplementation((_uid, publish) => { publish([...bets, off]); return () => {}; });
  render(<MyBetsList user={user} />);
  const filters = screen.getByRole('group', { name: 'Filter bets by status' });
  expect(within(filters).getByRole('button', { name: 'Open 1' })).toBeInTheDocument();
  expect(within(filters).getByRole('button', { name: 'Closed 2' })).toBeInTheDocument();
  expect(within(filters).getByRole('button', { name: 'Settled 1' })).toBeInTheDocument();
  const card = screen.getByRole('link', { name: /Rain delay\?/ });
  expect(within(card).getByText('Closed')).toHaveClass('status', 'closed');
  expect(card).toHaveTextContent('This bet was called off.');
  expect(card).not.toHaveTextContent(/Yes takes it|won/i);
  await userEvent.click(within(filters).getByRole('button', { name: 'Closed 2' }));
  expect(screen.getByText('Rain delay?')).toBeInTheDocument();
  await userEvent.click(within(filters).getByRole('button', { name: 'Open 1' }));
  expect(screen.queryByText('Rain delay?')).not.toBeInTheDocument();
});

test('searches questions, stakes, and types and can recover from no results', async () => {
  render(<MyBetsList user={user} />);
  const search = screen.getByRole('searchbox', { name: 'Search bets' });
  await userEvent.type(search, 'COFFEE');
  expect(screen.getByText('Will Alex break 90?')).toBeInTheDocument();
  expect(screen.queryByText('Who wins game night?')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  await userEvent.type(search, 'prop');
  expect(screen.getByText('Who wins game night?')).toBeInTheDocument();
  await userEvent.clear(search);
  await userEvent.type(search, 'missing');
  expect(screen.getByText('No matching bets')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Show all bets' }));
  expect(search).toHaveValue('');
  expect(screen.getByText('Will Alex break 90?')).toBeInTheDocument();
  expect(screen.getByText('Total points tonight?')).toBeInTheDocument();
});

test('a load error does not misrepresent the account as having no bets', () => {
  subscribeMyBets.mockImplementation((_uid, publish) => {
    publish(null, new Error('offline'));
    return () => {};
  });
  render(<MyBetsList user={user} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load your bets.');
  expect(screen.queryByText('No bets yet')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Bet overview')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});

describe('delete a bet', () => {
  const deleteButtons = () => screen.queryAllByRole('button', { name: 'Delete' });
  const openDialog = async (index = 0) => {
    await userEvent.click(deleteButtons()[index]);
    return screen.getByRole('dialog', { name: 'Delete this bet?' });
  };

  test('only the creator sees a muted text Delete on their own bets', () => {
    const legacy = { id: 'legacy', type: 'Money Line', bet: 'Old one', votes: [] };
    subscribeMyBets.mockImplementation((_uid, publish) => {
      publish([...bets, legacy, { ...bets[0], id: 'theirs', createdByID: 'someone-else' }]);
      return () => {};
    });
    render(<MyBetsList user={user} />);
    expect(deleteButtons()).toHaveLength(3);
    deleteButtons().forEach((button) => {
      expect(button).toHaveClass('bet-delete');
      expect(button).not.toHaveClass('danger');
      expect(button).not.toHaveClass('cta');
    });
    expect(deleteButtons()[0]).toHaveAccessibleDescription('Will Alex break 90?');
  });

  test('another phone user sees no Delete on bets they did not create', () => {
    render(<MyBetsList user={{ ...user, uid: 'someone-else' }} />);
    expect(screen.getByText('Will Alex break 90?')).toBeInTheDocument();
    expect(deleteButtons()).toHaveLength(0);
  });

  test('the confirm dialog has the exact copy and Keep it takes focus', async () => {
    render(<MyBetsList user={user} />);
    const dialog = await openDialog();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { name: 'Delete this bet?' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('It’s gone for everyone, including the votes and the share link.');
    const confirm = within(dialog).getByRole('button', { name: 'Delete bet' });
    const keep = within(dialog).getByRole('button', { name: 'Keep it' });
    expect(confirm).toHaveClass('danger');
    expect(keep).not.toHaveClass('cta');
    expect(keep).not.toHaveClass('secondary');
    expect(keep).toHaveFocus();
  });

  test('Keep it and Escape close without deleting and return focus', async () => {
    render(<MyBetsList user={user} />);
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deleteButtons()[0]).toHaveFocus();
    await openDialog();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deleteBet).not.toHaveBeenCalled();
  });

  test('deleting shows Deleting… while busy, then a Bet deleted. toast', async () => {
    let finish;
    deleteBet.mockImplementation(() => new Promise((resolve) => {
      finish = resolve;
    }));
    render(<MyBetsList user={user} />);
    await openDialog(1);
    await userEvent.click(screen.getByRole('button', { name: 'Delete bet' }));
    expect(deleteBet).toHaveBeenCalledWith('game');
    const busy = screen.getByRole('button', { name: 'Deleting…' });
    expect(busy).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(busy);
    expect(deleteBet).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
      publishBets(bets.filter((bet) => bet.id !== 'game'));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Bet deleted.');
    expect(screen.queryByText('Who wins game night?')).not.toBeInTheDocument();
    expect(screen.queryByText(/undo/i)).not.toBeInTheDocument();
  });

  const GENERIC = 'Couldn\u2019t delete this bet. Try again.';
  const offlineErr = () => Object.assign(new Error('You are offline.'), { code: 'offline' });

  test.each([
    ['a server error', () => Object.assign(new Error('Could not delete this bet.'), { code: 'server' })],
    ['a 403', () => Object.assign(new Error('Could not delete this bet.'), { code: 'forbidden' })],
    ['not signed in', () => new Error('Not signed in.')],
  ])('%s shows the delete line under the buttons and keeps the dialog open', async (_label, makeErr) => {
    deleteBet.mockRejectedValue(makeErr());
    render(<MyBetsList user={user} />);
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Delete bet' }));
    const dialog = screen.getByRole('dialog');
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent(GENERIC);
    expect(alert.textContent).toBe('Couldn’t delete this bet. Try again.');
    expect(alert).toHaveClass('form-error');
    expect(dialog).not.toHaveTextContent('Still connecting');
    const confirm = within(dialog).getByRole('button', { name: 'Delete bet' });
    const keep = within(dialog).getByRole('button', { name: 'Keep it' });
    [confirm, keep].forEach((button) => {
      expect(button).toBeEnabled();
      expect(button.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.getByText('Will Alex break 90?')).toBeInTheDocument();
  });

  test('a dropped network shows the offline line', async () => {
    deleteBet.mockRejectedValue(offlineErr());
    render(<MyBetsList user={user} />);
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Delete bet' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert').textContent).toBe(PHONE_OFFLINE_ERROR);
    expect(within(dialog).getByRole('button', { name: 'Delete bet' })).toBeEnabled();
    expect(screen.getByText('Will Alex break 90?')).toBeInTheDocument();
  });

  test('a browser that reports offline shows the offline line', async () => {
    const onLine = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      deleteBet.mockRejectedValue(new Error('Could not delete this bet.'));
      render(<MyBetsList user={user} />);
      await openDialog();
      await userEvent.click(screen.getByRole('button', { name: 'Delete bet' }));
      expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe(PHONE_OFFLINE_ERROR);
    } finally {
      onLine.mockRestore();
    }
  });

  describe('a delete whose answer never comes back', () => {
    beforeEach(() => {
      deleteBet.mockImplementation(() => new Promise(() => {}));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    test('finishes once the live list no longer has the bet', async () => {
      render(<MyBetsList user={user} />);
      await openDialog(1);
      await userEvent.click(screen.getByRole('button', { name: 'Delete bet' }));
      expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
      // Another bet changing is not this delete landing.
      await act(async () => publishBets(bets.map((bet) => ({ ...bet }))));
      expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
      await act(async () => publishBets(bets.filter((bet) => bet.id !== 'game')));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Bet deleted.');
    });

    test('a failed list load is not taken for the delete landing', async () => {
      render(<MyBetsList user={user} />);
      await openDialog(1);
      await userEvent.click(screen.getByRole('button', { name: 'Delete bet' }));
      await act(async () => publishBets(null, new Error('offline')));
      expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
      expect(screen.getByRole('status')).toHaveTextContent('');
    });

    test('gives up after DELETE_WAIT_MS with the delete line, and a late delete still closes the dialog', async () => {
      jest.useFakeTimers();
      const actor = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MyBetsList user={user} />);
      await actor.click(screen.queryAllByRole('button', { name: 'Delete' })[1]);
      await actor.click(screen.getByRole('button', { name: 'Delete bet' }));
      await act(async () => jest.advanceTimersByTime(DELETE_WAIT_MS - 1));
      expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
      await act(async () => jest.advanceTimersByTime(1));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('alert').textContent).toBe(GENERIC);
      expect(within(dialog).getByRole('button', { name: 'Delete bet' })).toBeEnabled();
      await act(async () => publishBets(bets.filter((bet) => bet.id !== 'game')));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Bet deleted.');
    });

    test('leaving the screen mid-delete clears the wait', async () => {
      jest.useFakeTimers();
      const actor = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { unmount } = render(<MyBetsList user={user} />);
      await actor.click(screen.queryAllByRole('button', { name: 'Delete' })[1]);
      await actor.click(screen.getByRole('button', { name: 'Delete bet' }));
      expect(jest.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  test('a retry after a failed delete succeeds and closes the dialog', async () => {
    deleteBet.mockRejectedValueOnce(new Error('server')).mockResolvedValueOnce(undefined);
    render(<MyBetsList user={user} />);
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Delete bet' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(GENERIC);
    await userEvent.click(screen.getByRole('button', { name: 'Delete bet' }));
    expect(deleteBet).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Bet deleted.');
  });
});

describe('Friends', () => {
  const pick = (voterId, name, optionId) => ({ voterId, name, optionId });
  const crewBets = [
    {
      id: 'won', createdByID: 'creator', createdAt: 5, schemaVersion: 2, type: 'money-line', question: 'Bears win?',
      status: 'closed', winnerId: 'a', options,
      votes: [pick('creator', 'Me', 'a'), pick('uid-ana', 'Ana', 'b'), pick('uid-ben', 'Ben', 'a')],
    },
    {
      id: 'lost', createdByID: 'creator', createdAt: 4, schemaVersion: 2, type: 'money-line', question: 'Over 40?',
      status: 'closed', winnerId: 'b', options, votes: [pick('creator', 'Me', 'a'), pick('uid-ana', 'Ana', 'b')],
    },
    {
      id: 'off', createdByID: 'creator', createdAt: 3, schemaVersion: 2, type: 'money-line', question: 'Rain delay?',
      status: 'called-off', options, votes: [pick('uid-ana', 'Ana', 'b')],
    },
    {
      id: 'live', createdByID: 'creator', createdAt: 2, schemaVersion: 2, type: 'prop', question: 'Who wins game night?',
      status: 'open', stake: 'Coffee', options, votes: [pick('uid-ana', 'Ana', 'b')],
    },
  ];
  const showFriends = async () => {
    const filters = screen.getByRole('group', { name: 'Filter bets by status' });
    await userEvent.click(within(filters).getByRole('button', { name: /^Friends/ }));
  };

  test('lists each friend with their record and opens their shared bets', async () => {
    subscribeMyBets.mockImplementation((_uid, publish) => { publish(crewBets); return () => {}; });
    render(<MyBetsList user={user} />);
    const filters = screen.getByRole('group', { name: 'Filter bets by status' });
    expect(within(filters).getByRole('button', { name: 'Friends 2' })).toBeInTheDocument();
    await showFriends();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Bears win?')).not.toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Head to head' });
    expect(within(section).getByRole('heading', { level: 2, name: 'Head to head' })).toBeInTheDocument();
    const rows = within(section).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Ana1 W1 LBets together 4',
      'Ben0 W0 LBets together 1',
    ]);
    expect(within(rows[0]).getByRole('img', { name: '1 win' })).toHaveTextContent('1 W');
    expect(within(rows[0]).getByRole('img', { name: '1 loss' })).toHaveTextContent('1 L');
    expect(within(rows[1]).getByRole('img', { name: '0 wins' })).toHaveTextContent('0 W');
    expect(within(rows[1]).getByRole('img', { name: '0 losses' })).toHaveTextContent('0 L');
    expect(section).not.toHaveTextContent('Me');
    expect(rows[0]).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(rows[0]);
    expect(rows[0]).toHaveAttribute('aria-expanded', 'true');
    const history = document.getElementById(rows[0].getAttribute('aria-controls'));
    const links = within(history).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/t/won', '/t/lost', '/t/off', '/t/live']);
    expect(links[0]).toHaveTextContent('Settled');
    expect(within(links[0]).getByRole('img', { name: 'Won' })).toHaveClass('friend-pill', 'win');
    expect(within(links[0]).getByRole('img', { name: 'Won' })).toHaveTextContent('W');
    expect(within(links[1]).getByRole('img', { name: 'Lost' })).toHaveClass('friend-pill', 'loss');
    expect(within(links[1]).getByRole('img', { name: 'Lost' })).toHaveTextContent('L');
    expect(links[2]).toHaveTextContent('This bet was called off.');
    expect(links[2]).not.toHaveTextContent(/\bW\b|\bL\b/);
    expect(within(links[3]).getByText('Open')).toHaveClass('status', 'open');
    expect(links[3]).toHaveTextContent('Coffee');
    expect(links[3].querySelector('.friend-pill')).toBeNull();

    await userEvent.click(rows[1]);
    expect(rows[0]).toHaveAttribute('aria-expanded', 'false');
    const benLinks = within(document.getElementById(rows[1].getAttribute('aria-controls'))).getAllByRole('link');
    // Same side as the creator: settled, but no W or L.
    expect(benLinks).toHaveLength(1);
    expect(benLinks[0]).toHaveTextContent('Settled');
    expect(benLinks[0].querySelector('.friend-pill')).toBeNull();
    await userEvent.click(rows[1]);
    expect(screen.queryAllByRole('link', { name: /Bears win/ })).toHaveLength(0);
  });

  test('with no friends yet it shows a plain label', async () => {
    render(<MyBetsList user={user} />);
    // The only pick on the fixtures has no name, so nobody can be listed.
    await showFriends();
    expect(screen.getByRole('heading', { name: 'No friends yet' })).toHaveClass('friends-empty');
    expect(screen.getByText('Bet with someone and they’ll show up here.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Head to head' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All 3' }));
    expect(screen.getByText('Will Alex break 90?')).toBeInTheDocument();
  });
});

describe('the settled card line, from the creator’s side', () => {
  const settled = (id, votes, winnerId = 'a') => ({
    id, createdByID: 'creator', schemaVersion: 2, type: 'money-line', question: `${id}?`,
    status: 'closed', winnerId, options, votes,
  });
  const cardLine = (id) => screen.getByRole('link', { name: new RegExp(`${id}\\?`) }).querySelector('.bet-card-bottom');

  test('the creator as the solo winner reads You called it., never A friend won', () => {
    // QA h2h1: the creator picked Yes with no name saved, a friend picked No,
    // settled Yes. The tally says "You called it."
    subscribeMyBets.mockImplementation((_uid, publish) => {
      publish([
        settled('solo', [{ voterId: 'creator', name: '', optionId: 'a' }, { voterId: 'ava', name: 'Ava', optionId: 'b' }]),
        settled('named', [{ voterId: 'creator', name: 'Jack', optionId: 'a' }, { voterId: 'ava', name: 'Ava', optionId: 'b' }]),
      ]);
      return () => {};
    });
    render(<MyBetsList user={user} />);
    expect(cardLine('solo')).toHaveTextContent('You called it.');
    expect(cardLine('solo')).not.toHaveTextContent(/friend won/i);
    expect(cardLine('named')).toHaveTextContent('You called it.');
    expect(cardLine('named')).not.toHaveTextContent('Jack won');
  });

  test('the creator among several winners reads You called it.; a creator who lost sees who won', () => {
    subscribeMyBets.mockImplementation((_uid, publish) => {
      publish([
        settled('crew', [
          { voterId: 'creator', name: '', optionId: 'a' },
          { voterId: 'ben', name: 'Ben', optionId: 'a' },
          { voterId: 'ava', name: 'Ava', optionId: 'b' },
        ]),
        settled('lost', [{ voterId: 'creator', name: '', optionId: 'a' }, { voterId: 'ava', name: 'Ava', optionId: 'b' }], 'b'),
        settled('sideline', [{ voterId: 'ava', name: '', optionId: 'a' }]),
      ]);
      return () => {};
    });
    render(<MyBetsList user={user} />);
    expect(cardLine('crew')).toHaveTextContent('You called it.');
    expect(cardLine('lost')).toHaveTextContent('Ava won');
    // The creator didn't pick: the friend's win reads as before.
    expect(cardLine('sideline')).toHaveTextContent('A friend won');
  });
});

describe('delete account', () => {
  const row = () => screen.queryByRole('button', { name: 'Delete account' });
  const openDialog = async () => {
    await userEvent.click(row());
    return screen.getByRole('dialog', { name: 'Delete your account?' });
  };
  const offlineSpy = () => jest.spyOn(window.navigator, 'onLine', 'get');

  beforeEach(() => {
    deleteAccount.mockReset();
    clearLocalAccountData.mockClear();
    signOutCreator.mockReset();
    signOutCreator.mockResolvedValue();
    navigation.replace.mockClear();
    sessionStorage.clear();
  });

  test('a phone-verified member sees a quiet Delete account row above Log out', () => {
    render(<MyBetsList user={user} />);
    const button = row();
    expect(button).toHaveClass('logout-link', 'delete-account-link');
    expect(button).not.toHaveClass('danger');
    expect(button.nextElementSibling).toHaveTextContent('Log out');
  });

  test.each([
    ['an anonymous user', { uid: 'anon', isAnonymous: true, providerData: [] }],
    ['a device-only user', { uid: 'local', isLocal: true, providerData: [{ providerId: 'phone' }] }],
    ['nobody yet', null],
  ])('%s gets no row', (_name, who) => {
    render(<MyBetsList user={who} />);
    expect(row()).toBeNull();
  });

  test('nothing is deleted until the confirm; Keep it closes and returns focus', async () => {
    render(<MyBetsList user={user} />);
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent('This can’t be undone.');
    expect(deleteAccount).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(row()).toHaveFocus();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  test('busy, then on success clears local data, signs out and goes home', async () => {
    let finish;
    deleteAccount.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<MyBetsList user={user} />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(within(dialog).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeDisabled();
    await act(async () => finish());
    expect(clearLocalAccountData).toHaveBeenCalledWith('creator');
    expect(signOutCreator).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith('/');
    expect(clearLocalAccountData.mock.invocationCallOrder[0]).toBeLessThan(signOutCreator.mock.invocationCallOrder[0]);
    expect(screen.queryByRole('status')).not.toHaveTextContent(/deleted/i);
  });

  test('a server error shows the error copy and keeps them signed in', async () => {
    deleteAccount.mockRejectedValue(Object.assign(new Error('x'), { code: 'server' }));
    render(<MyBetsList user={user} />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Couldn’t delete your account. Try again.');
    expect(signOutCreator).not.toHaveBeenCalled();
    expect(clearLocalAccountData).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Delete account' })).toBeEnabled();
  });

  test('offline shows the shared offline line', async () => {
    deleteAccount.mockRejectedValue(Object.assign(new Error('x'), { code: 'offline' }));
    render(<MyBetsList user={user} />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(PHONE_OFFLINE_ERROR);
  });

  test('a browser that reports offline shows the offline line', async () => {
    const spy = offlineSpy().mockReturnValue(false);
    deleteAccount.mockRejectedValue(new Error('x'));
    render(<MyBetsList user={user} />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(PHONE_OFFLINE_ERROR);
    spy.mockRestore();
  });

  test('a stale sign-in shows the re-auth line; Sign in again notes the resume and signs out to phone sign-in', async () => {
    deleteAccount.mockRejectedValue(Object.assign(new Error('x'), { code: 'requires-recent-login' }));
    render(<MyBetsList user={user} />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    const again = await within(dialog).findByRole('button', { name: 'Sign in again' });
    expect(dialog).toHaveTextContent('Sign in again to delete your account. It’s a quick security check.');
    expect(again).toHaveClass('dialog-primary');
    expect(again).not.toHaveClass('danger');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await userEvent.click(again);
    expect(JSON.parse(sessionStorage.getItem(RESUME_KEY)).uid).toBe('creator');
    expect(signOutCreator).toHaveBeenCalledTimes(1);
    expect(clearLocalAccountData).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  test('back from sign-in, the confirm opens again, once', () => {
    markDeleteAccountResume('creator');
    const { unmount } = render(<MyBetsList user={user} />);
    expect(screen.getByRole('dialog', { name: 'Delete your account?' })).toBeInTheDocument();
    unmount();
    render(<MyBetsList user={user} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('a resume note does not open the confirm for someone who is not a member', () => {
    markDeleteAccountResume('creator');
    render(<MyBetsList user={null} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sessionStorage.getItem(RESUME_KEY)).not.toBeNull();
  });

  test('a resume note left by another member does not open the confirm, and is dropped', () => {
    markDeleteAccountResume('someone-else');
    render(<MyBetsList user={user} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sessionStorage.getItem(RESUME_KEY)).toBeNull();
  });

  test.each([
    ['stripe', 'Pro ends right away, with no refund.'],
    ['apple', 'Pro is billed by Apple. Cancel it in your phone’s settings so it doesn’t renew.'],
    ['google', 'Pro is billed by Google. Cancel it in Google Play so it doesn’t renew.'],
  ])('Pro from %s adds its line', async (source, line) => {
    useEntitlementState.mockReturnValue({ uid: 'creator', entitlement: { plan: 'pro', source, expiresAt: null }, isPro: true, loading: false });
    render(<MyBetsList user={user} />);
    const dialog = await openDialog();
    expect(within(dialog).getAllByRole('listitem').at(-1)).toHaveTextContent(line);
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(4);
    useEntitlementState.mockImplementation(jest.requireActual('./useEntitlement').useEntitlementState);
  });

  test.each([
    ['a mock test purchase', { plan: 'pro', source: 'mock', expiresAt: null }],
    ['a legacy founder grant', { plan: 'founder', source: 'mock', founderNumber: 3, expiresAt: null }],
    ['no plan', null],
  ])('%s gets no Pro line', async (_name, entitlement) => {
    useEntitlementState.mockReturnValue({ uid: 'creator', entitlement, isPro: Boolean(entitlement), loading: false });
    render(<MyBetsList user={user} />);
    const dialog = await openDialog();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
    expect(dialog).not.toHaveTextContent(/Pro /);
    useEntitlementState.mockImplementation(jest.requireActual('./useEntitlement').useEntitlementState);
  });

  test('another user’s loaded plan never adds a Pro line', async () => {
    useEntitlementState.mockReturnValue({ uid: 'someone-else', entitlement: { plan: 'pro', source: 'stripe' }, isPro: true, loading: false });
    render(<MyBetsList user={user} />);
    const dialog = await openDialog();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
    useEntitlementState.mockImplementation(jest.requireActual('./useEntitlement').useEntitlementState);
  });
});
