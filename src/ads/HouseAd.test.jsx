import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  expect(close).toHaveStyle({ width: '44px', height: '44px' });
  expect(close).toHaveFocus();
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
