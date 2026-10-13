import { TextDecoder, TextEncoder } from 'util';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// jsdom has no TextEncoder, which react-router reads at load.
Object.assign(global, { TextDecoder, TextEncoder });
const { BrowserRouter, useLocation } = require('react-router-dom');
const Link = require('./Link').default;
const { useRouter } = require('./navigation');

let router;

function Screen() {
  router = useRouter();
  const { pathname, hash } = useLocation();
  return <>
    <p data-testid="where">{`${pathname}${hash}`}</p>
    <Link href="/">Home</Link>
    <Link href="/bets">My bets</Link>
    <Link href="/t/abc">Tally</Link>
  </>;
}

const where = () => screen.getByTestId('where').textContent;
const idx = () => window.history.state?.idx;
const tap = (name) => userEvent.click(screen.getByRole('link', { name }));
const settle = async (path, index) => {
  await waitFor(() => expect(where()).toBe(path));
  await waitFor(() => expect(idx()).toBe(index));
  // Let a pending unwind finish before the next step.
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
};

async function start(path = '/') {
  window.history.replaceState(null, '', path);
  render(<BrowserRouter><Screen /></BrowserRouter>);
  await act(async () => {});
}

test('switching tabs replaces, so neither tab has the other behind it', async () => {
  await start('/');
  const length = window.history.length;
  await tap('My bets');
  await settle('/bets', 0);
  await tap('Home');
  await settle('/', 0);
  expect(window.history.length).toBe(length);
});

test('a screen opened from a tab pushes, so back returns to that tab', async () => {
  await start('/bets');
  await tap('Tally');
  await settle('/t/abc', 1);
  act(() => router.back());
  await settle('/bets', 0);
});

test('a tab from deeper in the app unwinds to the first entry instead of pushing', async () => {
  await start('/');
  await tap('My bets');
  await settle('/bets', 0);
  await tap('Tally');
  await settle('/t/abc', 1);
  await tap('Home');
  await settle('/', 0);
});

test('router.push to Home from a Create step lands on the first entry', async () => {
  await start('/');
  act(() => router.push('/new'));
  act(() => router.push('/new#step-2'));
  act(() => router.push('/new#step-3'));
  await settle('/new#step-3', 3);
  act(() => router.push('/'));
  await settle('/', 0);
  // Non-tab paths still push and replace as asked.
  act(() => router.push('/t/abc'));
  await settle('/t/abc', 1);
  act(() => router.replace('/t/xyz'));
  await settle('/t/xyz', 1);
});

test('two tab taps while unwinding end on the last tab tapped', async () => {
  await start('/');
  act(() => router.push('/new'));
  act(() => router.push('/t/abc'));
  await settle('/t/abc', 2);
  act(() => {
    router.push('/');
    router.push('/bets');
  });
  await settle('/bets', 0);
});

test('a modified click on a tab is left to the browser', async () => {
  await start('/t/abc');
  const link = screen.getByRole('link', { name: 'Home' });
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true, button: 0 });
  link.dispatchEvent(event);
  expect(where()).toBe('/t/abc');
});

test('a stale index that cannot walk back still reaches the tab', async () => {
  window.history.replaceState({ usr: null, key: 'stale', idx: 5 }, '', '/t/abc');
  render(<BrowserRouter><Screen /></BrowserRouter>);
  await act(async () => {});
  await tap('My bets');
  await waitFor(() => expect(where()).toBe('/bets'), { timeout: 2000 });
  // Tabs keep working afterwards.
  await tap('Home');
  await waitFor(() => expect(where()).toBe('/'), { timeout: 2000 });
});
