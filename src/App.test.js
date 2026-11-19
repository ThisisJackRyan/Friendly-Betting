import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  delete document.documentElement.dataset.arrive;
  navigation.pathname = '/';
  navigation.params = {};
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.back.mockReset();
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
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

jest.mock('./phone/creatorAuth', () => ({
  sendPhoneCode: jest.fn(),
  verifyPhoneCode: jest.fn(),
  signOutCreator: jest.fn(),
  mountPhoneCheck: jest.fn(() => Promise.resolve()),
  releasePhoneCheck: jest.fn(),
}));

jest.mock('./phone/identity', () => ({
  useIdentity: () => ({
    uid: 'user-1',
    email: 'sam@example.com',
    phoneNumber: '+15551234567',
    providerData: [{ providerId: 'phone' }],
  }),
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

test('opens the clubhouse with a primary creation action and shortcuts for each bet type', () => {
  renderHome();
  expect(screen.getByRole('heading', { name: 'Good times. Better stakes.' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /A little rivalry/ })).toBeInTheDocument();
  expect(screen.getByText('Friends pick in one tap. No app needed.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Start a bet' })).toHaveAttribute('href', '/new');
  expect(screen.getByRole('link', { name: /Pick a side/ })).toHaveAttribute(
    'href',
    '/new/money-line',
  );
  expect(screen.getByRole('link', { name: /Call the number/ })).toHaveAttribute(
    'href',
    '/new/over-under',
  );
  expect(screen.getByRole('link', { name: /Make it your own/ })).toHaveAttribute(
    'href',
    '/new/prop',
  );
  expect(screen.getByText('Example bet')).toBeInTheDocument();
  expect(screen.queryByText(/group chat has spoken/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/weekend plans/i)).not.toBeInTheDocument();
  expect(document.querySelector('.example-ticket .ticket-top')).not.toBeInTheDocument();
  expect(screen.getByText('Coffee on the loser')).toBeInTheDocument();
  const footer = screen.getByText('A little more on the line.');
  expect(footer).toHaveClass('ticket-footer-copy');
  expect(footer.closest('.ticket-footer')).toContainElement(document.querySelector('.sample-avatars'));
  expect(screen.queryByText(/bragging rights, secured/i)).not.toBeInTheDocument();
  expect(document.querySelector('.example-scene .scene-note')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('button', { name: /money line/i })).not.toBeInTheDocument();
  expect(document.querySelector('.app-shell')).toHaveClass('shell-landing');
  expect(document.querySelector('.landing-cta')).toHaveClass('cta');
});

test('my bets is a tab with an empty state', () => {
  jest.useFakeTimers();
  try {
    navigation.pathname = '/bets';
    render(
      <AppShell>
        <TabLayout>
          <MyBets />
        </TabLayout>
      </AppShell>,
    );
    const loader = screen.getByRole('status', { name: 'Loading' });
    expect(loader).toHaveTextContent(/^$/);
    expect(within(loader).queryByText(/friendly/i)).not.toBeInTheDocument();
    expect(loader.querySelector('.friendly-load-mark')).toBeNull();
    expect(loader.querySelector('.friendly-load-title')).toBeInTheDocument();
    expect(loader.querySelectorAll('.friendly-load-bar')).toHaveLength(3);
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My bets' })).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(449);
    });
    expect(screen.queryByRole('heading', { name: 'My bets' })).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByRole('heading', { name: 'My bets' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send code' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
    expect(screen.getByText(/no bets yet/i)).toBeInTheDocument();
    expect(screen.getByText(/start one and text the link/i)).toBeInTheDocument();
    const logout = screen.getByRole('button', { name: 'Log out' });
    expect(logout).toHaveClass('logout-link');
    expect(logout).not.toHaveClass('cta');
    expect(screen.getByRole('link', { name: /create a bet/i })).toHaveAttribute('href', '/new');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Create' })).toHaveAttribute('href', '/new');
    expect(within(nav).getByRole('link', { name: 'My bets' })).toHaveAttribute('href', '/bets');
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('Start a bet slides forward into the type picker', async () => {
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
  expect(within(entering).getByRole('button', { name: /money line/i })).toBeInTheDocument();
  expect(leaving.querySelector('.landing-title')).toHaveTextContent('A little rivalry.');
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
  let preventedByApp;
  document.addEventListener(
    'click',
    (event) => {
      preventedByApp = event.defaultPrevented;
      event.preventDefault(); // JSDOM cannot perform the browser's native navigation.
    },
    { once: true },
  );
  fireEvent.click(screen.getByRole('link', { name: 'Start a bet' }), { metaKey: true });
  expect(preventedByApp).toBe(false);
  expect(navigation.push).not.toHaveBeenCalled();
  expect(document.querySelector('.create-pane')).not.toBeInTheDocument();
});

test.each(['/', '/bets'])(
  'mobile Create slides from %s without unmounting the outgoing page',
  async (pathname) => {
    window.matchMedia = jest.fn(() => ({ matches: true }));
    navigation.pathname = pathname;
    render(
      <CreateChromeProvider>
        <AppShell>
          <p>Current page content</p>
        </AppShell>
      </CreateChromeProvider>,
    );
    const current = screen.getByText('Current page content');
    const create = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', {
      name: 'Create',
    });
    await userEvent.click(create);
    expect(document.querySelector('.app-shell')).toHaveClass('shell-creating');
    expect(document.querySelector('.create-pane.is-leaving')).toContainElement(current);
    expect(document.querySelector('.create-pane.is-leaving')).toHaveAttribute('inert');
    expect(document.querySelector('.create-pane.is-entering')).toHaveClass('slide-forward');
    expect(within(document.querySelector('.create-pane.is-entering')).getByRole('button', { name: /money line/i })).toBeInTheDocument();
    expect(create).toHaveAttribute('aria-current', 'page');
    expect(navigation.push).not.toHaveBeenCalled();
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/new'));
    expect(navigation.push).toHaveBeenCalledTimes(1);
  },
);

test.each([{ mobile: false }, { mobile: true, metaKey: true }])(
  'Create preserves a normal link for %j',
  ({ mobile, metaKey }) => {
    window.matchMedia = jest.fn(() => ({ matches: mobile }));
    render(
      <CreateChromeProvider>
        <AppShell>
          <Landing />
        </AppShell>
      </CreateChromeProvider>,
    );
    const create = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', {
      name: 'Create',
    });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey });
    let preventedByApp;
    document.addEventListener(
      'click',
      (click) => {
        preventedByApp = click.defaultPrevented;
        click.preventDefault(); // JSDOM cannot perform the browser's native navigation.
      },
      { once: true },
    );
    act(() => create.dispatchEvent(event));
    expect(preventedByApp).toBe(false);
    expect(document.querySelector('.create-pane.is-entering')).not.toBeInTheDocument();
  },
);

test('choosing another tab cancels a pending mobile Create transition', () => {
  jest.useFakeTimers();
  try {
    window.matchMedia = jest.fn(() => ({ matches: true }));
    render(
      <CreateChromeProvider>
        <AppShell>
          <Landing />
        </AppShell>
      </CreateChromeProvider>,
    );
    const nav = within(screen.getByRole('navigation', { name: 'Primary' }));
    fireEvent.click(nav.getByRole('link', { name: 'Create' }));
    document.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(nav.getByRole('link', { name: 'My bets' }));
    act(() => jest.advanceTimersByTime(500));
    expect(navigation.push).not.toHaveBeenCalled();
    expect(document.querySelector('.create-pane.is-entering')).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('sample ticket footer words are muted sentence-case body text, not a kicker or pill', () => {
  const css = fs.readFileSync(path.join(__dirname, 'phone/phone.css'), 'utf8');
  const blocks = [...css.matchAll(/(^|\n)\s*\.ticket-footer(?:-copy)? \{([^}]*)\}/g)].map((m) => m[2]);
  const copy = css.match(/\n\.ticket-footer-copy \{([^}]*)\}/)[1];
  expect(copy).toContain('color: var(--muted);');
  expect(copy).toContain('font-size: 14px;');
  expect(blocks.length).toBeGreaterThan(1);
  const all = blocks.join('\n');
  expect(all).not.toContain('uppercase');
  expect(all).not.toMatch(/letter-spacing:\s*0?\.\d/);
  expect(all).not.toMatch(/border-radius|background/);
  expect(all).not.toMatch(/font-size:\s*[0-9]px/);
  expect(css).not.toContain('.scene-note');
  expect(css).not.toContain('.wordmark');
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
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Loading' })).toHaveTextContent(/^$/);
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
});
