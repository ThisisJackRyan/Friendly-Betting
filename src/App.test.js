import { render, screen, within } from '@testing-library/react';
import AppShell from './phone/AppShell';
import TabLayout from './phone/TabLayout';
import Landing from './phone/Landing';
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
        <Landing />
      </TabLayout>
    </AppShell>,
  );
}

test('opens on a landing page whose only action starts a bet', () => {
  renderHome();
  expect(document.querySelector('.landing-mark')).toHaveTextContent('Friendly');
  expect(screen.getByRole('heading', { name: 'Bet with friends by text' })).toBeInTheDocument();
  expect(screen.getByText('Create a wager, text the link, vote once — no app.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Start a bet' })).toHaveAttribute('href', '/new');
  expect(screen.queryByRole('button', { name: /money line/i })).not.toBeInTheDocument();
  expect(document.querySelector('.app-shell')).toHaveClass('shell-landing');
  expect(document.querySelector('.landing-cta')).toHaveClass('cta');
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
  expect(screen.getByRole('link', { name: /create a bet/i })).toHaveAttribute('href', '/new');
  const nav = screen.getByRole('navigation', { name: 'Primary' });
  expect(within(nav).getByRole('link', { name: 'Create' })).toHaveAttribute('href', '/new');
  expect(within(nav).getByRole('link', { name: 'My bets' })).toHaveAttribute('href', '/bets');
});

test('a vote link stays focused and does not render the app nav', () => {
  navigation.pathname = '/b/abc123';
  navigation.params = { code: 'abc123' };
  render(<VoteScreen />);
  expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
