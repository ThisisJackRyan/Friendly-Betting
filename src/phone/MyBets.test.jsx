import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyBetsList } from './MyBets';
import { deleteBet, subscribeMyBets } from './api';

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./identity', () => ({ useIdentity: () => null }));
jest.mock('./creatorAuth', () => ({ signOutCreator: jest.fn() }));
jest.mock('./api', () => ({ subscribeMyBets: jest.fn(), deleteBet: jest.fn() }));
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

  test('a failed delete keeps the dialog open with the reused error', async () => {
    deleteBet.mockRejectedValue(new Error('server'));
    render(<MyBetsList user={user} />);
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Delete bet' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Still connecting. Try again.');
    expect(within(dialog).getByRole('button', { name: 'Delete bet' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.getByText('Will Alex break 90?')).toBeInTheDocument();
  });
});
