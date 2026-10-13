import { TextDecoder, TextEncoder } from 'util';
import { act, render, screen, waitFor } from '@testing-library/react';
import { App } from '@capacitor/app';

// jsdom has no TextEncoder, which react-router reads at load.
Object.assign(global, { TextDecoder, TextEncoder });
const { BrowserRouter, useLocation, useNavigate } = require('react-router-dom');
const NativeLifecycle = require('./NativeLifecycle').default;

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

const mockHandlers = {};
const mockRemoves = [];

jest.mock('@capacitor/app', () => ({
  App: {
    addListener: jest.fn(async (event, callback) => {
      mockHandlers[event] = callback;
      const remove = jest.fn(async () => {
        delete mockHandlers[event];
      });
      mockRemoves.push(remove);
      return { remove };
    }),
    getLaunchUrl: jest.fn(),
    minimizeApp: jest.fn(),
  },
}));

let navigate;

function Where() {
  navigate = useNavigate();
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

async function start(path = '/') {
  window.history.replaceState(null, '', path);
  const view = render(
    <BrowserRouter>
      <NativeLifecycle />
      <Where />
    </BrowserRouter>,
  );
  await act(async () => {});
  return view;
}

const where = () => screen.getByTestId('where').textContent;
const idx = () => window.history.state?.idx;

beforeEach(() => {
  Object.keys(mockHandlers).forEach((key) => delete mockHandlers[key]);
  mockRemoves.length = 0;
  App.addListener.mockClear();
  App.getLaunchUrl.mockReset();
  App.getLaunchUrl.mockResolvedValue(undefined);
  App.minimizeApp.mockReset();
});

test('a cold-launch link lands with Home under it', async () => {
  App.getLaunchUrl.mockResolvedValue({ url: 'https://www.friendly-bets.com/t/abc' });
  await start('/');
  expect(where()).toBe('/t/abc');
  expect(idx()).toBe(1);

  // iOS replays the launch URL as appUrlOpen: no second entry.
  await act(async () => mockHandlers.appUrlOpen({ url: 'https://www.friendly-bets.com/t/abc' }));
  expect(where()).toBe('/t/abc');
  expect(idx()).toBe(1);

  await act(async () => mockHandlers.backButton({ canGoBack: true }));
  await waitFor(() => expect(where()).toBe('/'));
  expect(idx()).toBe(0);
});

test('a launch link to Home adds nothing to swipe back through', async () => {
  App.getLaunchUrl.mockResolvedValue({ url: 'friendlybetting://' });
  await start('/');
  expect(where()).toBe('/');
  expect(idx()).toBe(0);
});

test('a link while running pushes so back returns to where the user was', async () => {
  await start('/bets');
  await act(async () => mockHandlers.appUrlOpen({ url: 'friendlybetting://b/xyz' }));
  expect(where()).toBe('/b/xyz');
  expect(idx()).toBe(1);
  await act(async () => mockHandlers.backButton({ canGoBack: true }));
  await waitFor(() => expect(where()).toBe('/bets'));
});

test('Android back pops app history, then goes home, then minimizes', async () => {
  await start('/t/abc');
  expect(idx()).toBe(0);

  await act(async () => mockHandlers.backButton({ canGoBack: false }));
  expect(where()).toBe('/');
  expect(idx()).toBe(0);
  expect(App.minimizeApp).not.toHaveBeenCalled();

  await act(async () => mockHandlers.backButton({ canGoBack: false }));
  expect(where()).toBe('/');
  expect(App.minimizeApp).toHaveBeenCalledTimes(1);
});

test('Android back steps back through a create step entry', async () => {
  await start('/new');
  await act(async () => mockHandlers.appUrlOpen({ url: 'friendlybetting://new/prop' }));
  act(() => navigate('/new/prop#step-3'));
  expect(idx()).toBe(2);
  await act(async () => mockHandlers.backButton({ canGoBack: true }));
  await waitFor(() => expect(window.location.hash).toBe(''));
  expect(where()).toBe('/new/prop');
  expect(idx()).toBe(1);
  expect(App.minimizeApp).not.toHaveBeenCalled();
});

test('one listener each, all removed on unmount', async () => {
  const { unmount } = await start('/');
  expect(App.addListener.mock.calls.map(([event]) => event)).toEqual(['appUrlOpen', 'backButton']);
  unmount();
  expect(mockRemoves).toHaveLength(2);
  mockRemoves.forEach((remove) => expect(remove).toHaveBeenCalledTimes(1));
});

test('listeners that attach after unmount are removed at once', async () => {
  let finishLaunch;
  App.getLaunchUrl.mockReturnValue(new Promise((resolve) => { finishLaunch = resolve; }));
  window.history.replaceState(null, '', '/');
  const { unmount } = render(<BrowserRouter><NativeLifecycle /></BrowserRouter>);
  await act(async () => {});
  unmount();
  await act(async () => finishLaunch({ url: 'https://www.friendly-bets.com/t/abc' }));
  expect(window.location.pathname).toBe('/');
  expect(mockRemoves).toHaveLength(2);
  mockRemoves.forEach((remove) => expect(remove).toHaveBeenCalledTimes(1));
});

test('Android back on Home minimizes even with app history behind it', async () => {
  await start('/t/abc');
  act(() => navigate('/'));
  expect(idx()).toBe(1);
  await act(async () => mockHandlers.backButton({ canGoBack: true }));
  expect(App.minimizeApp).toHaveBeenCalledTimes(1);
  expect(where()).toBe('/');
  expect(idx()).toBe(1);
});

test('Android back on My bets goes Home with nothing behind it, then minimizes', async () => {
  await start('/t/abc');
  act(() => navigate('/bets'));
  expect(idx()).toBe(1);
  await act(async () => mockHandlers.backButton({ canGoBack: true }));
  await waitFor(() => expect(where()).toBe('/'));
  await waitFor(() => expect(idx()).toBe(0));
  expect(App.minimizeApp).not.toHaveBeenCalled();
  await act(async () => mockHandlers.backButton({ canGoBack: true }));
  expect(App.minimizeApp).toHaveBeenCalledTimes(1);
});

test('Android back from a screen opened from My bets returns to My bets', async () => {
  await start('/bets');
  act(() => navigate('/t/abc'));
  await act(async () => mockHandlers.backButton({ canGoBack: true }));
  await waitFor(() => expect(where()).toBe('/bets'));
  expect(idx()).toBe(0);
  expect(App.minimizeApp).not.toHaveBeenCalled();
});

test('a link to a tab while running resets to it like tapping the tab', async () => {
  await start('/');
  act(() => navigate('/t/abc'));
  await act(async () => mockHandlers.appUrlOpen({ url: 'friendlybetting://bets' }));
  await waitFor(() => expect(where()).toBe('/bets'));
  await waitFor(() => expect(idx()).toBe(0));
});
