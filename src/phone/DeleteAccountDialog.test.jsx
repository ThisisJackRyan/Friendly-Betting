import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteAccountDialog from './DeleteAccountDialog';
import { DELETE_ACCOUNT_COPY, proBulletFor } from './deleteAccountCopy';
import { PHONE_OFFLINE_ERROR } from './creatorSession';

const noop = () => {};
const BASE = [
  'Bets you made disappear for everyone, votes and links too.',
  'Your picks on friends’ open bets are removed.',
  'Your name is cleared from settled bets.',
];

function setup(props = {}) {
  const handlers = { onConfirm: jest.fn(), onReauth: jest.fn(), onCancel: jest.fn() };
  render(<DeleteAccountDialog {...handlers} {...props} />);
  return { ...handlers, dialog: screen.getByRole('dialog', { name: 'Delete your account?' }) };
}

test('the exact copy, a red confirm and the muted Keep it, which takes focus', () => {
  const { dialog } = setup();
  expect(dialog).toHaveTextContent('This can’t be undone.');
  const items = within(dialog).getAllByRole('listitem').map((item) => item.textContent);
  expect(items).toEqual(BASE);
  const confirm = within(dialog).getByRole('button', { name: 'Delete account' });
  expect(confirm).toHaveClass('danger');
  expect(confirm).not.toHaveClass('cta');
  expect(within(dialog).getByRole('button', { name: 'Keep it' })).toHaveFocus();
  expect(within(dialog).getByRole('button', { name: 'Keep it' })).toHaveClass('dialog-keep');
});

test('a Pro bullet is added last when given', () => {
  const { dialog } = setup({ proBullet: DELETE_ACCOUNT_COPY.proBullets.stripe });
  const items = within(dialog).getAllByRole('listitem').map((item) => item.textContent);
  expect(items).toEqual([...BASE, 'Pro ends right away, with no refund.']);
});

test('confirm calls onConfirm; Keep it and Escape cancel', async () => {
  const { dialog, onConfirm, onCancel } = setup();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
  await userEvent.keyboard('{Escape}');
  expect(onCancel).toHaveBeenCalledTimes(2);
});

test('busy shows Deleting… and disables both buttons', () => {
  const { dialog } = setup({ busy: true });
  expect(within(dialog).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeDisabled();
});

test('shows the error line', () => {
  setup({ error: DELETE_ACCOUNT_COPY.error });
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t delete your account. Try again.');
});

test('the offline line is the shared one', () => {
  expect(DELETE_ACCOUNT_COPY.offline).toBe(PHONE_OFFLINE_ERROR);
});

test('re-auth swaps in the security line and a dark Sign in again button', async () => {
  const { dialog, onReauth, onConfirm } = setup({ reauth: true, error: 'stale error' });
  expect(dialog).toHaveTextContent('Sign in again to delete your account. It’s a quick security check.');
  expect(within(dialog).queryByRole('list')).toBeNull();
  expect(within(dialog).queryByRole('alert')).toBeNull();
  const button = within(dialog).getByRole('button', { name: 'Sign in again' });
  expect(button).toHaveClass('dialog-primary');
  expect(button).not.toHaveClass('danger');
  expect(button).not.toHaveClass('cta');
  await userEvent.click(button);
  expect(onReauth).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

describe('proBulletFor', () => {
  const pro = (source, extra = {}) => ({ plan: 'pro', source, since: 1, expiresAt: null, ...extra });

  test.each([
    ['stripe', 'Pro ends right away, with no refund.'],
    ['apple', 'Pro is billed by Apple. Cancel it in your phone’s settings so it doesn’t renew.'],
    ['google', 'Pro is billed by Google. Cancel it in Google Play so it doesn’t renew.'],
    ['mock', ''],
    ['admin', ''],
  ])('Pro from %s', (source, line) => {
    expect(proBulletFor(pro(source))).toBe(line);
  });

  test('a legacy founder grant, a lapsed plan and no plan get no bullet', () => {
    expect(proBulletFor({ plan: 'founder', source: 'mock', founderNumber: 7, expiresAt: null })).toBe('');
    expect(proBulletFor(pro('stripe', { expiresAt: 1 }), 2)).toBe('');
    expect(proBulletFor(null)).toBe('');
    expect(proBulletFor(pro('constructor'))).toBe('');
  });
});

test('no copy has a dash in place of punctuation or a straight apostrophe', () => {
  const all = JSON.stringify(DELETE_ACCOUNT_COPY);
  expect(all).not.toMatch(/[\u2013\u2014']/);
  expect(DELETE_ACCOUNT_COPY.busy).toBe('Deleting…');
});
