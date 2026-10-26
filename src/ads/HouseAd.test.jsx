import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import HouseAd, { showHouseAd } from './HouseAd';

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

test('a neutral full-screen layer with a label and a 44pt close button', () => {
  render(<HouseAd onClose={() => {}} />);
  const dialog = screen.getByRole('dialog', { name: 'Ad' });
  expect(dialog).toHaveStyle({ position: 'fixed' });
  expect(dialog).toHaveTextContent(/^Ad×$/);
  const close = screen.getByRole('button', { name: 'Close ad' });
  expect(close).toHaveClass('overlay-close');
  expect(close).toHaveFocus();
});

test('the close button sits 12px inside the safe area and is 44px square', () => {
  const css = readFileSync(join(__dirname, '../phone/phone.css'), 'utf8');
  const rule = css.match(/\n\.overlay-close \{([^}]*)\}/)[1];
  // Plain values first, for browsers without env().
  expect(rule).toMatch(/top: 12px;[\s\S]*top: calc\(env\(safe-area-inset-top, 0px\) \+ 12px\);/);
  expect(rule).toMatch(/right: 12px;[\s\S]*right: calc\(env\(safe-area-inset-right, 0px\) \+ 12px\);/);
  expect(rule).toMatch(/width: 44px;/);
  expect(rule).toMatch(/height: 44px;/);
  expect(rule).not.toMatch(/translate|-\d+px|100vw/);
});

test('closes once on the button or Escape', async () => {
  const onClose = jest.fn();
  render(<HouseAd onClose={onClose} />);
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: 'Close ad' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('showHouseAd mounts over the page, resolves on close, and cleans up', async () => {
  const done = jest.fn();
  await act(async () => {
    showHouseAd().then(done);
  });
  const close = await screen.findByRole('button', { name: 'Close ad' });
  expect(done).not.toHaveBeenCalled();
  await userEvent.click(close);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(done).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-house-ad-host]')).toBeNull();
});

test('closes by itself after autoCloseMs, so a flow never hangs on it', async () => {
  jest.useFakeTimers();
  const done = jest.fn();
  await act(async () => {
    showHouseAd({ autoCloseMs: 10000 }).then(done);
  });
  expect(screen.getByRole('dialog', { name: 'Ad' })).toBeInTheDocument();
  await act(async () => { await jest.advanceTimersByTimeAsync(9999); });
  expect(done).not.toHaveBeenCalled();
  await act(async () => { await jest.advanceTimersByTimeAsync(1); });
  expect(done).toHaveBeenCalledTimes(1);
  await act(async () => { await jest.advanceTimersByTimeAsync(1); });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test.each(['root', '__next'])('the app root #%s is inert while the ad is up, and focus returns on close', async (id) => {
  const app = document.createElement('div');
  app.id = id;
  const opener = document.createElement('button');
  app.appendChild(opener);
  document.body.appendChild(app);
  opener.focus();
  const done = jest.fn();
  await act(async () => {
    showHouseAd().then(done);
  });
  const close = await screen.findByRole('button', { name: 'Close ad' });
  expect(app).toHaveAttribute('inert');
  expect(close).toHaveFocus();
  await userEvent.click(close);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(done).toHaveBeenCalledTimes(1);
  expect(app).not.toHaveAttribute('inert');
  expect(opener).toHaveFocus();
});

test('focus goes back to the opener without scrolling, and not over focus the user has put elsewhere', async () => {
  const app = document.createElement('div');
  app.id = 'root';
  const opener = document.createElement('button');
  const other = document.createElement('input');
  app.append(opener, other);
  document.body.appendChild(app);
  opener.focus();
  const focus = jest.spyOn(HTMLElement.prototype, 'focus');
  try {
    await act(async () => { showHouseAd(); });
    const close = await screen.findByRole('button', { name: 'Close ad' });
    focus.mockClear();
    await userEvent.click(close);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(opener).toHaveFocus();
    expect(focus.mock.calls[focus.mock.contexts.indexOf(opener)]).toEqual([{ preventScroll: true }]);

    await act(async () => { showHouseAd(); });
    await screen.findByRole('button', { name: 'Close ad' });
    // Something outside the ad took focus before it closed (a script, say).
    app.removeAttribute('inert');
    act(() => { other.focus(); });
    await userEvent.keyboard('{Escape}');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByRole('button', { name: 'Close ad' })).not.toBeInTheDocument();
    expect(other).toHaveFocus();
  } finally {
    focus.mockRestore();
    app.remove();
  }
});

test('the Next app frame is the fallback root, and unmount alone clears inert', () => {
  const frame = document.createElement('div');
  frame.className = 'app-frame';
  document.body.appendChild(frame);
  const { unmount } = render(<HouseAd onClose={() => {}} />);
  expect(frame).toHaveAttribute('inert');
  unmount();
  expect(frame).not.toHaveAttribute('inert');
});

test('with no app root to find, the ad still works', () => {
  const onClose = jest.fn();
  const { unmount } = render(<HouseAd onClose={onClose} />);
  expect(screen.getByRole('button', { name: 'Close ad' })).toHaveFocus();
  expect(() => unmount()).not.toThrow();
});

test('a root that was already inert stays inert after the ad', () => {
  const app = document.createElement('div');
  app.id = 'root';
  app.setAttribute('inert', '');
  document.body.appendChild(app);
  const { unmount } = render(<HouseAd onClose={() => {}} />);
  unmount();
  expect(app).toHaveAttribute('inert');
});
