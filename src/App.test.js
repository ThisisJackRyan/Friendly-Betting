import { render, screen } from '@testing-library/react';
import AppShell from './phone/AppShell';
import TabLayout from './phone/TabLayout';
import CreateForm from './phone/CreateForm';
import MyBets from './phone/MyBets';
import VoteScreen from './phone/VoteScreen';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');

beforeEach(() => {
  navigation.pathname = '/';
  navigation.params = {};
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.back.mockReset();
});

jest.mock('./phone/api', () => ({
  subscribeMyBets: (_uid, onChange) => {
    onChange([]);
    return () => {};
  },
  subscribeBet: () => () => {},
  hydrateBet: async (bet) => bet,
  saveBet: jest.fn(),
  castVote: jest.fn(),
  settleBet: jest.fn(),
}));

jest.mock('./phone/identity', () => ({
  useIdentity: () => ({ uid: 'user-1', email: 'sam@example.com' }),
  creatorName: () => 'Sam',
  rememberName: () => {},
  savedName: () => '',
  watchIdentity: () => () => {},
}));

function renderHome() {
  navigation.pathname = '/';
  return render(
    <AppShell>
      <TabLayout>
        <CreateForm />
      </TabLayout>
    </AppShell>,
  );
}

test('opens on New bet with all three types and a Create / My bets tab bar', () => {
  renderHome();
  expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'New bet' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /money line/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /over-under/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /prop/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /create/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /my bets/i })).toHaveAttribute('href', '/bets');
});

test('my bets is a tab with an empty state', () => {
  navigation.pathname = '/bets';
  render(
    <AppShell>
      <TabLayout>
        <MyBets />
      </TabLayout>
    </AppShell>,
  );
  expect(screen.getByRole('heading', { name: 'My bets' })).toBeInTheDocument();
  expect(screen.getByText(/no bets yet/i)).toBeInTheDocument();
  expect(screen.getByText(/create one and text it to friends/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /create a bet/i })).toHaveAttribute('href', '/');
});

test('a vote link stays focused and does not render the app nav', () => {
  navigation.pathname = '/b/abc123';
  navigation.params = { code: 'abc123' };
  render(<VoteScreen />);
  expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
