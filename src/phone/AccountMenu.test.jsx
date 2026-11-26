import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Capacitor } from '@capacitor/core';
import AccountMenu from './AccountMenu';
import AppShell from './AppShell';
import { signOutCreator } from './creatorAuth';
import { __resetAccountNavForTests, cameFromBets } from './accountNav';
import { accountPhone } from './accountCopy';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');
const mockIdentity = { user: null };
jest.mock('./identity', () => ({ useIdentity: () => mockIdentity.user }));
jest.mock('./creatorAuth', () => ({ signOutCreator: jest.fn() }));
jest.mock('../Config/firebase-config', () => ({ auth: null, db: null }));
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => false), getPlatform: jest.fn(() => 'web') },
}));

const member = { uid: 'creator', phoneNumber: '+18165550123', providerData: [{ providerId: 'phone' }] };
const anon = { uid: 'anon-1', isAnonymous: true, providerData: [] };

const icon = () => screen.queryByRole('button', { name: 'Account' });
const sheet = () => screen.queryByRole('dialog', { name: 'Account' });
const openSheet = async () => {
  await userEvent.click(icon());
  return sheet();
};

const savedPush = process.env.NEXT_PUBLIC_PUSH_ENABLED;

afterEach(() => {
  if (savedPush === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = savedPush;
});

beforeEach(() => {
  mockIdentity.user = member;
  Capacitor.isNativePlatform.mockReturnValue(false);
  signOutCreator.mockReset();
  signOutCreator.mockResolvedValue();
  navigation.push.mockClear();
  navigation.replace.mockClear();
  __resetAccountNavForTests();
});

describe('the icon', () => {
  test('a phone-signed-in member on the web gets a 24px person icon labelled Account', () => {
    render(<AccountMenu />);
    const button = icon();
    expect(button).toHaveClass('account-button');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const glyph = button.querySelector('svg');
    expect(glyph).toHaveAttribute('width', '24');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
  });

  test('a phone-signed-in member in the app gets it too', () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    render(<AccountMenu />);
    expect(icon()).toBeInTheDocument();
  });

  test('a phone-signed-in member in the app with push off still gets it', () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
    render(<AccountMenu />);
    expect(icon()).toBeInTheDocument();
  });

  test('an anonymous app user with push off gets no icon (their sheet would be empty)', () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
    mockIdentity.user = anon;
    render(<AccountMenu />);
    expect(icon()).toBeNull();
  });

  // The sheet it opens (title and Notifications only): MyBets.push.test.jsx.
  test('an anonymous app user with push on gets it', () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
    mockIdentity.user = anon;
    render(<AccountMenu />);
    expect(icon()).toBeInTheDocument();
  });

  test('a device-only app user with push on gets no icon (no Notifications row without a real user)', () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
    mockIdentity.user = { uid: 'local', isLocal: true, providerData: [] };
    render(<AccountMenu />);
    expect(icon()).toBeNull();
  });

  test('an anonymous web visitor with the push flag on still gets no icon', () => {
    process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
    mockIdentity.user = anon;
    render(<AccountMenu />);
    expect(icon()).toBeNull();
  });

  test.each([
    ['an anonymous web visitor', anon],
    ['a device-only web visitor', { uid: 'local', isLocal: true, providerData: [] }],
    ['nobody yet', null],
  ])('%s sees no icon', (_name, who) => {
    mockIdentity.user = who;
    render(<AccountMenu />);
    expect(icon()).toBeNull();
  });

  test('sits at the top right of the app header on My bets only', () => {
    navigation.pathname = '/bets';
    const view = render(<AppShell><p>page</p></AppShell>);
    const header = document.querySelector('.app-header');
    expect(within(header).getByRole('button', { name: 'Account' })).toBe(header.lastElementChild);
    navigation.pathname = '/';
    view.rerender(<AppShell><p>page</p></AppShell>);
    expect(icon()).toBeNull();
    navigation.pathname = '/t/abc';
    view.rerender(<AppShell><p>page</p></AppShell>);
    expect(icon()).toBeNull();
    navigation.pathname = '/';
  });
});

describe('the sheet', () => {
  test('a member: grab handle, Account, Signed in as, then Log out and the quiet Delete account row', async () => {
    render(<AccountMenu />);
    const dialog = await openSheet();
    expect(icon()).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.querySelector('.account-sheet-handle')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(within(dialog).getByText('Signed in as (816) 555-0123')).toHaveClass('account-sheet-phone');
    expect(within(dialog).queryByRole('button', { name: /close/i })).toBeNull();
    const buttons = within(dialog).getAllByRole('button').map((button) => button.textContent);
    expect(buttons).toEqual(['Log out', 'Delete account']);
    expect(within(dialog).getByRole('button', { name: 'Log out' })).toHaveClass('account-row');
    const remove = within(dialog).getByRole('button', { name: 'Delete account' });
    expect(remove).toHaveClass('account-delete-row');
    expect(remove).not.toHaveClass('danger');
    expect(remove.querySelector('svg')).toBeInTheDocument();
    expect(dialog).toHaveFocus();
  });

  test('a number outside +1 shows as stored', async () => {
    mockIdentity.user = { ...member, phoneNumber: '+447911123456' };
    render(<AccountMenu />);
    const dialog = await openSheet();
    expect(within(dialog).getByText('Signed in as +447911123456')).toBeInTheDocument();
  });

  test('Escape closes it and focus goes back to the icon', async () => {
    render(<AccountMenu />);
    await openSheet();
    await userEvent.keyboard('{Escape}');
    expect(sheet()).toBeNull();
    expect(icon()).toHaveFocus();
    expect(icon()).toHaveAttribute('aria-expanded', 'false');
  });

  test('a tap outside closes it and focus goes back to the icon', async () => {
    render(<AccountMenu />);
    await openSheet();
    await userEvent.click(document.querySelector('.push-sheet-scrim'));
    expect(sheet()).toBeNull();
    expect(icon()).toHaveFocus();
  });

  test('a swipe down closes it; a small drag does not', async () => {
    render(<AccountMenu />);
    const dialog = await openSheet();
    fireEvent.touchStart(dialog, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(dialog, { touches: [{ clientY: 340 }] });
    expect(dialog.style.transform).toBe('translateY(40px)');
    fireEvent.touchEnd(dialog);
    expect(sheet()).toBe(dialog);
    expect(dialog.style.transform).toBe('');
    fireEvent.touchStart(dialog, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(dialog, { touches: [{ clientY: 420 }] });
    fireEvent.touchEnd(dialog);
    expect(sheet()).toBeNull();
    expect(icon()).toHaveFocus();
  });

  test('Tab and Shift+Tab stay inside the sheet', async () => {
    render(<AccountMenu />);
    const dialog = await openSheet();
    const logOut = within(dialog).getByRole('button', { name: 'Log out' });
    const remove = within(dialog).getByRole('button', { name: 'Delete account' });
    await userEvent.tab();
    expect(logOut).toHaveFocus();
    await userEvent.tab();
    expect(remove).toHaveFocus();
    await userEvent.tab();
    expect(logOut).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(remove).toHaveFocus();
  });

  test('Delete account closes the sheet and pushes the Delete account page', async () => {
    render(<AccountMenu />);
    const dialog = await openSheet();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(sheet()).toBeNull();
    expect(navigation.push).toHaveBeenCalledWith('/account/delete');
    expect(cameFromBets()).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Log out?', () => {
  const openConfirm = async () => {
    const dialog = await openSheet();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log out' }));
    return screen.getByRole('dialog', { name: 'Log out?' });
  };

  test('the copy, a dark Log out and a muted Cancel, which has focus', async () => {
    render(<AccountMenu />);
    const confirm = await openConfirm();
    expect(confirm).toHaveTextContent('Sign back in with your number anytime.');
    const buttons = within(confirm).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Log out', 'Cancel']);
    expect(buttons[0]).toHaveClass('dialog-primary');
    expect(buttons[0]).not.toHaveClass('danger');
    expect(buttons[1]).toHaveClass('dialog-cancel');
    expect(buttons[1]).toHaveFocus();
    expect(signOutCreator).not.toHaveBeenCalled();
  });

  test('Cancel goes back to the sheet without signing out', async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<AccountMenu />);
      await user.click(icon());
      await user.click(within(sheet()).getByRole('button', { name: 'Log out' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      act(() => jest.runOnlyPendingTimers());
      expect(screen.queryByRole('dialog', { name: 'Log out?' })).toBeNull();
      expect(sheet()).toBeInTheDocument();
      expect(within(sheet()).getByRole('button', { name: 'Log out' })).toHaveFocus();
      expect(signOutCreator).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('Escape in the confirm only closes the confirm', async () => {
    render(<AccountMenu />);
    await openConfirm();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Log out?' })).toBeNull();
    expect(sheet()).toBeInTheDocument();
  });

  test('Log out closes everything and signs out, with no toast and no navigation', async () => {
    render(<AccountMenu />);
    const confirm = await openConfirm();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Log out' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(signOutCreator).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

test.each([
  ['+18165550123', '(816) 555-0123'],
  ['+12125550199', '(212) 555-0199'],
  ['+447911123456', '+447911123456'],
  ['+61412345678', '+61412345678'],
  ['+1816555012', '+1816555012'],
  ['', ''],
])('accountPhone(%s) is %s', (input, shown) => {
  expect(accountPhone(input)).toBe(shown);
});
