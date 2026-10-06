import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyBetsList } from './MyBets';
import { subscribeMyBets } from './api';

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./identity', () => ({ useIdentity: () => null }));
jest.mock('./creatorAuth', () => ({ signOutCreator: jest.fn() }));
jest.mock('./api', () => ({ subscribeMyBets: jest.fn() }));
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
    schemaVersion: 2,
    type: 'over-under',
    question: 'Total points tonight?',
    status: 'open',
    closesAt: 1,
    options,
    votes: [],
  },
];

beforeEach(() => {
  subscribeMyBets.mockImplementation((_uid, publish) => {
    publish(bets);
    return () => {};
  });
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
