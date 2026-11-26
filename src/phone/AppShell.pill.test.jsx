import fs from 'fs';
import path from 'path';
import { act, render, screen } from '@testing-library/react';
import AppShell from './AppShell';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('./api', () => ({ subscribeBet: () => () => {} }));
jest.mock('./identity', () => ({ useIdentity: () => ({ uid: 'user-1' }) }));

const css = fs.readFileSync(path.join(__dirname, 'phone.css'), 'utf8');

// jsdom has no layout. Give each tab a box: 100px wide, side by side.
let sized = true;
let top = 6;
const box = {
  offsetWidth: (el) => (sized && el.classList.contains('tab') ? 100 : 0),
  offsetHeight: (el) => (sized && el.classList.contains('tab') ? 58 : 0),
  offsetLeft: (el) =>
    el.classList.contains('tab') ? [...el.parentNode.querySelectorAll('.tab')].indexOf(el) * 100 : 0,
  offsetTop: () => top,
};
const originals = {};
let frames;

beforeAll(() => {
  Object.entries(box).forEach(([key, get]) => {
    originals[key] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get() {
        return get(this);
      },
    });
  });
});

afterAll(() => {
  Object.entries(originals).forEach(([key, desc]) => {
    Object.defineProperty(HTMLElement.prototype, key, desc);
  });
});

beforeEach(() => {
  sized = true;
  top = 6;
  frames = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Runs frames until none are left (the snap re-enables over two frames).
const flushFrames = () =>
  act(() => {
    for (let i = 0; i < 10 && frames.length; i += 1) frames.splice(0).forEach((cb) => cb());
  });

// Records whether data-ready (the transition) was on each time the pill got a
// new spot, and whether style was flushed after that spot was set.
const watchPlacements = (el) => {
  const log = [];
  const set = el.style.setProperty.bind(el.style);
  jest.spyOn(el.style, 'setProperty').mockImplementation((name, value) => {
    set(name, value);
    if (name === '--pill-y') log.push({ y: value, ready: el.dataset.ready !== undefined, flushed: false });
  });
  const computed = window.getComputedStyle.bind(window);
  jest.spyOn(window, 'getComputedStyle').mockImplementation((target, ...rest) => {
    if (target === el && log.length) log.at(-1).flushed = true;
    return computed(target, ...rest);
  });
  return log;
};

const pill = () => document.querySelector('.tab-pill');

const shell = () => (
  <AppShell>
    <p>Page</p>
  </AppShell>
);

test('the pill starts on the active tab with no transition, then slides on a route change', () => {
  navigation.pathname = '/bets';
  const { rerender } = render(shell());
  const el = pill();
  expect(el).toHaveAttribute('aria-hidden', 'true');
  expect(el.parentElement).toHaveClass('app-nav');
  expect(el.style.getPropertyValue('--pill-x')).toBe('100px');
  expect(el.style.getPropertyValue('--pill-w')).toBe('100px');
  expect(el.dataset.shown).toBe('');
  // First placement never animates: no data-ready until the next frame.
  expect(el.dataset.ready).toBeUndefined();
  flushFrames();
  expect(el.dataset.ready).toBe('');

  navigation.pathname = '/new';
  rerender(shell());
  expect(screen.getByRole('link', { name: 'Create' })).toHaveAttribute('aria-current', 'page');
  expect(el.style.getPropertyValue('--pill-x')).toBe('200px');
  expect(el.dataset.ready).toBe('');

  navigation.pathname = '/';
  rerender(shell());
  expect(el.style.getPropertyValue('--pill-x')).toBe('0px');
});

test('no active tab or a hidden tab bar hides the pill', () => {
  navigation.pathname = '/t/abc123';
  render(shell());
  expect(document.querySelector('.tab.active')).toBeNull();
  expect(pill().dataset.shown).toBeUndefined();
  expect(pill().dataset.ready).toBeUndefined();
});

test('a tab bar with no size keeps the pill hidden', () => {
  sized = false;
  navigation.pathname = '/bets';
  render(shell());
  expect(pill().dataset.shown).toBeUndefined();
  flushFrames();
  expect(pill().dataset.ready).toBeUndefined();
});

test('a resize snaps the pill without sliding', () => {
  navigation.pathname = '/bets';
  render(shell());
  flushFrames();
  expect(pill().dataset.ready).toBe('');
  top = 30;
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
  expect(pill().style.getPropertyValue('--pill-y')).toBe('30px');
  expect(pill().dataset.ready).toBeUndefined();
  flushFrames();
  expect(pill().dataset.ready).toBe('');
});

test('a re-measure with the same active tab never slides, and an unchanged spot is a no-op', () => {
  navigation.pathname = '/bets';
  render(shell());
  flushFrames();
  const el = pill();
  const log = watchPlacements(el);

  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
  expect(log).toEqual([]);
  expect(el.dataset.ready).toBe('');

  top = 20;
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
  expect(log).toEqual([{ y: '20px', ready: false, flushed: true }]);
  flushFrames();
  expect(el.dataset.ready).toBe('');
});

test('a first spot that was wrong snaps to the corrected one after fonts load or a tab moves', async () => {
  let fontsDone;
  const fontListeners = {};
  const fonts = {
    ready: new Promise((resolve) => {
      fontsDone = resolve;
    }),
    addEventListener: jest.fn((type, fn) => {
      fontListeners[type] = fn;
    }),
    removeEventListener: jest.fn(),
  };
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  let observed;
  const RO = window.ResizeObserver;
  window.ResizeObserver = jest.fn((cb) => {
    observed = cb;
    return { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };
  });
  try {
    navigation.pathname = '/new';
    const { unmount } = render(shell());
    const el = pill();
    const log = watchPlacements(el);
    flushFrames();
    expect(el.dataset.ready).toBe('');

    // Web fonts swap in and the sidebar grows: the tab moves down.
    top = 48;
    await act(async () => {
      fontsDone();
      await fonts.ready;
    });
    expect(el.style.getPropertyValue('--pill-y')).toBe('48px');
    expect(log).toEqual([{ y: '48px', ready: false, flushed: true }]);
    flushFrames();
    expect(el.dataset.ready).toBe('');

    // A late layout shift the nav size does not show, caught by the observer.
    top = 226;
    act(() => observed([]));
    expect(log.at(-1)).toEqual({ y: '226px', ready: false, flushed: true });

    // Even before the snap re-enabled the transition, a font swap still snaps.
    top = 227;
    act(() => fontListeners.loadingdone());
    expect(log.at(-1)).toEqual({ y: '227px', ready: false, flushed: true });
    flushFrames();
    expect(el.dataset.ready).toBe('');

    unmount();
    expect(fonts.removeEventListener).toHaveBeenCalledWith('loadingdone', fontListeners.loadingdone);
  } finally {
    window.ResizeObserver = RO;
    delete document.fonts;
  }
});

test('a new active tab after the pill settles slides, with no style flush', () => {
  navigation.pathname = '/bets';
  const { rerender } = render(shell());
  flushFrames();
  const el = pill();
  const log = watchPlacements(el);

  navigation.pathname = '/';
  rerender(shell());
  expect(el.style.getPropertyValue('--pill-x')).toBe('0px');
  expect(log).toEqual([{ y: '6px', ready: true, flushed: false }]);
  expect(el.dataset.ready).toBe('');
  expect(frames).toHaveLength(0);
});

test('a new active tab before the pill has settled snaps instead of sliding', () => {
  navigation.pathname = '/bets';
  const { rerender } = render(shell());
  const el = pill();
  expect(el.dataset.ready).toBeUndefined();
  navigation.pathname = '/new';
  rerender(shell());
  expect(el.style.getPropertyValue('--pill-x')).toBe('200px');
  expect(el.dataset.ready).toBeUndefined();
  flushFrames();
  expect(el.dataset.ready).toBe('');
});

test('the pill slides on transform only, and not at all under reduced motion', () => {
  const rule = (selector) => {
    const at = css.indexOf(`${selector} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };
  expect(rule('.tab-pill[data-ready]')).toMatch(/transition:\s*transform 250ms ease-out;/);
  expect(rule('.tab-pill')).toMatch(/transform: translate\(/);
  expect(rule('.tab.active')).not.toMatch(/background/);

  const blocks = css.split('@media (prefers-reduced-motion: reduce)').slice(1);
  const reduced = blocks.find((b) => b.includes('.tab-pill[data-ready]'));
  expect(reduced).toBeDefined();
  expect(reduced.slice(reduced.indexOf('.tab-pill[data-ready]'))).toMatch(
    /^[^}]*transition: none;/,
  );
});

test('unmount disconnects the observer, drops listeners and cancels pending frames', () => {
  const disconnect = jest.fn();
  const observe = jest.fn();
  const RO = window.ResizeObserver;
  window.ResizeObserver = jest.fn(() => ({ observe, unobserve: jest.fn(), disconnect }));
  const add = jest.spyOn(window, 'addEventListener');
  const remove = jest.spyOn(window, 'removeEventListener');
  try {
    navigation.pathname = '/bets';
    const { unmount } = render(shell());
    expect(window.ResizeObserver).toHaveBeenCalledTimes(1);
    // The nav, its children and the active tab are all watched.
    const nav = document.querySelector('.app-nav');
    expect(observe).toHaveBeenCalledWith(nav);
    expect(observe).toHaveBeenCalledWith(document.querySelector('.tab.active'));
    // The snap's first frame and the late layout check are queued, not run.
    expect(frames).toHaveLength(2);
    const pending = window.requestAnimationFrame.mock.results.map((r) => r.value);
    const handler = (type) => add.mock.calls.find(([t]) => t === type)?.[1];
    const onResize = handler('resize');
    expect(onResize).toBeDefined();
    expect(handler('orientationchange')).toBe(onResize);
    expect(handler('load')).toBe(onResize);

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('resize', onResize);
    expect(remove).toHaveBeenCalledWith('orientationchange', onResize);
    expect(remove).toHaveBeenCalledWith('load', onResize);
    pending.forEach((id) => expect(window.cancelAnimationFrame).toHaveBeenCalledWith(id));
  } finally {
    window.ResizeObserver = RO;
  }
});

test('the active tab keeps its own highlight until the pill shows', () => {
  expect(css).toMatch(
    /\.app-nav:not\(:has\(\.tab-pill\[data-shown\]\)\) \.tab\.active \{\s*background: var\(--wash\);\s*\}/,
  );
  const at = css.indexOf('.tab-pill {');
  expect(css.slice(at, css.indexOf('}', at))).toMatch(/background: var\(--wash\);/);
});
