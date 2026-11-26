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
const box = {
  offsetWidth: (el) => (sized && el.classList.contains('tab') ? 100 : 0),
  offsetHeight: (el) => (sized && el.classList.contains('tab') ? 58 : 0),
  offsetLeft: (el) =>
    el.classList.contains('tab') ? [...el.parentNode.querySelectorAll('.tab')].indexOf(el) * 100 : 0,
  offsetTop: () => 6,
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
  frames = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const flushFrames = () =>
  act(() => {
    frames.splice(0).forEach((cb) => cb());
  });

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
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
  expect(pill().dataset.ready).toBeUndefined();
  flushFrames();
  expect(pill().dataset.ready).toBe('');
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

test('unmount disconnects the observer, drops listeners and cancels the pending frame', () => {
  const disconnect = jest.fn();
  const RO = window.ResizeObserver;
  window.ResizeObserver = jest.fn(() => ({ observe: jest.fn(), disconnect }));
  const add = jest.spyOn(window, 'addEventListener');
  const remove = jest.spyOn(window, 'removeEventListener');
  try {
    navigation.pathname = '/bets';
    const { unmount } = render(shell());
    expect(window.ResizeObserver).toHaveBeenCalledTimes(1);
    // First placement queued a frame and it has not run yet.
    expect(frames).toHaveLength(1);
    const pending = window.requestAnimationFrame.mock.results.at(-1).value;
    const handler = (type) => add.mock.calls.find(([t]) => t === type)?.[1];
    const onResize = handler('resize');
    const onOrientation = handler('orientationchange');
    expect(onResize).toBeDefined();
    expect(onOrientation).toBe(onResize);

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('resize', onResize);
    expect(remove).toHaveBeenCalledWith('orientationchange', onOrientation);
    expect(window.cancelAnimationFrame).toHaveBeenLastCalledWith(pending);
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
