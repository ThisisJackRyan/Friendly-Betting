import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppShell from './phone/AppShell';
import TabLayout from './phone/TabLayout';
import Landing from './phone/Landing';
import MyBets from './phone/MyBets';
import VoteScreen from './phone/VoteScreen';
import { CreateChromeProvider } from './phone/createChrome';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');

beforeEach(() => {
  delete document.documentElement.dataset.arrive;
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

test('Start a bet slides forward into Pick a type', async () => {
  navigation.pathname = '/';
  render(
    <CreateChromeProvider>
      <AppShell>
        <TabLayout>
          <Landing />
        </TabLayout>
      </AppShell>
    </CreateChromeProvider>,
  );

  await userEvent.click(screen.getByRole('link', { name: 'Start a bet' }));

  const entering = document.querySelector('.create-pane.is-entering');
  const leaving = document.querySelector('.create-pane.is-leaving');
  expect(entering).toHaveClass('slide-forward');
  expect(leaving).toHaveClass('slide-forward');
  expect(entering).toHaveTextContent('Pick a type');
  expect(leaving.querySelector('.landing-title')).toHaveTextContent('Bet with friends by text');
  expect(document.querySelector('.app-shell')).toHaveClass('shell-tabs');
  expect(navigation.push).not.toHaveBeenCalled();

  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/new'));
  expect(navigation.push).not.toHaveBeenCalledWith('/bets');
});

test('a modified Start a bet click keeps the browser link', () => {
  navigation.pathname = '/';
  render(
    <CreateChromeProvider>
      <AppShell>
        <Landing />
      </AppShell>
    </CreateChromeProvider>,
  );
  fireEvent.click(screen.getByRole('link', { name: 'Start a bet' }), { metaKey: true });
  expect(navigation.push).not.toHaveBeenCalled();
  expect(document.querySelector('.create-pane')).not.toBeInTheDocument();
});

test('reduced motion fades create slides instead of translating them', () => {
  const css = fs.readFileSync(path.join(__dirname, 'phone/phone.css'), 'utf8');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  expect(reduced).toContain('.create-pane.is-entering.slide-forward');
  expect(reduced).toContain('animation: fade-tab 150ms ease-out');
  expect(reduced).toContain('.create-pane.is-leaving.slide-forward');
  expect(reduced).toContain('animation: none');
  expect(reduced).toContain('display: none');
});

test('a vote link stays focused and does not render the app nav', () => {
  navigation.pathname = '/b/abc123';
  navigation.params = { code: 'abc123' };
  render(<VoteScreen />);
  expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
