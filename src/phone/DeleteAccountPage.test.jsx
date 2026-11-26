import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteAccountPage from './DeleteAccountPage';
import { signOutCreator } from './creatorAuth';
import { PHONE_OFFLINE_ERROR } from './creatorSession';
import { clearLocalAccountData, deleteAccount, markDeleteAccountResume, RESUME_KEY } from './accountApi';
import { __resetAccountNavForTests, openDeleteAccountPage } from './accountNav';
import { useEntitlementState } from './useEntitlement';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');
const mockIdentity = { user: null };
jest.mock('./identity', () => ({ useIdentity: () => mockIdentity.user }));
jest.mock('./creatorAuth', () => ({ signOutCreator: jest.fn() }));
jest.mock('../Config/firebase-config', () => ({ auth: null, db: null }));
jest.mock('./accountApi', () => {
  const actual = jest.requireActual('./accountApi');
  return { ...actual, deleteAccount: jest.fn(), clearLocalAccountData: jest.fn(async () => {}) };
});
jest.mock('./useEntitlement', () => {
  const actual = jest.requireActual('./useEntitlement');
  return { ...actual, useEntitlementState: jest.fn(actual.useEntitlementState) };
});

const member = { uid: 'creator', phoneNumber: '+18165550123', providerData: [{ providerId: 'phone' }] };
const BULLETS = [
  'Bets you made disappear for everyone, votes and links too.',
  'Your picks on friends’ open bets are removed.',
  'Your name is cleared from settled bets.',
];

const pageButton = () => screen.getByRole('button', { name: 'Delete account' });
const openDialog = async () => {
  await userEvent.click(pageButton());
  return screen.getByRole('dialog', { name: 'Delete your account?' });
};

beforeEach(() => {
  mockIdentity.user = member;
  deleteAccount.mockReset();
  clearLocalAccountData.mockClear();
  signOutCreator.mockReset();
  signOutCreator.mockResolvedValue();
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.back.mockReset();
  sessionStorage.clear();
  __resetAccountNavForTests();
  useEntitlementState.mockImplementation(jest.requireActual('./useEntitlement').useEntitlementState);
});

describe('the page', () => {
  test('Back, the title, the #102 body and the red outline button, with Never mind under it', () => {
    render(<DeleteAccountPage />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Delete account' })).toBeInTheDocument();
    expect(screen.getByText('This can’t be undone.')).toHaveClass('delete-account-lead');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(BULLETS);
    const button = pageButton();
    expect(button).toHaveClass('delete-account-button');
    expect(button).not.toHaveClass('danger');
    // In the content, right under the bullets, not pinned in a bar.
    expect(button.previousElementSibling).toHaveClass('delete-account-list');
    expect(button.closest('.cta-bar')).toBeNull();
    expect(button.nextElementSibling).toBe(screen.getByRole('button', { name: 'Never mind' }));
    expect(document.title).toBe('Delete account · Friendly');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test.each([
    ['stripe', 'Pro ends right away, with no refund.'],
    ['apple', 'Pro is billed by Apple. Cancel it in your phone’s settings so it doesn’t renew.'],
    ['google', 'Pro is billed by Google. Cancel it in Google Play so it doesn’t renew.'],
  ])('Pro from %s adds its line on the page and in the confirm', async (source, line) => {
    useEntitlementState.mockReturnValue({ uid: 'creator', entitlement: { plan: 'pro', source, expiresAt: null }, isPro: true, loading: false });
    render(<DeleteAccountPage />);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([...BULLETS, line]);
    const dialog = await openDialog();
    expect(within(dialog).getAllByRole('listitem').at(-1)).toHaveTextContent(line);
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(4);
  });

  test.each([
    ['a mock test purchase', { plan: 'pro', source: 'mock', expiresAt: null }],
    ['a legacy founder grant', { plan: 'founder', source: 'mock', founderNumber: 3, expiresAt: null }],
    ['no plan', null],
  ])('%s gets no Pro line', async (_name, entitlement) => {
    useEntitlementState.mockReturnValue({ uid: 'creator', entitlement, isPro: Boolean(entitlement), loading: false });
    render(<DeleteAccountPage />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    const dialog = await openDialog();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
    expect(dialog).not.toHaveTextContent(/Pro /);
  });

  test('another user’s loaded plan never adds a Pro line', async () => {
    useEntitlementState.mockReturnValue({ uid: 'someone-else', entitlement: { plan: 'pro', source: 'stripe' }, isPro: true, loading: false });
    render(<DeleteAccountPage />);
    const dialog = await openDialog();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('going back', () => {
  test.each(['Back', 'Never mind'])('%s pops back to My bets when the page was pushed from it', async (name) => {
    // My bets, then the page pushed on top of it.
    window.history.pushState({}, '', '/account/delete');
    openDeleteAccountPage({ push: jest.fn() });
    render(<DeleteAccountPage />);
    await userEvent.click(screen.getByRole('button', { name }));
    expect(navigation.back).toHaveBeenCalledTimes(1);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  test.each(['Back', 'Never mind'])('%s from a deep link or a reload puts My bets in its place', async (name) => {
    render(<DeleteAccountPage />);
    await userEvent.click(screen.getByRole('button', { name }));
    expect(navigation.replace).toHaveBeenCalledWith('/bets');
    expect(navigation.back).not.toHaveBeenCalled();
  });
});

describe('who can open it', () => {
  test.each([
    ['an anonymous user', { uid: 'anon', isAnonymous: true, providerData: [] }],
    ['a device-only user', { uid: 'local', isLocal: true, providerData: [{ providerId: 'phone' }] }],
  ])('%s is sent to My bets and sees nothing', (_name, who) => {
    mockIdentity.user = who;
    render(<DeleteAccountPage />);
    expect(navigation.replace).toHaveBeenCalledWith('/bets');
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
    expect(screen.queryByText('This can’t be undone.')).toBeNull();
  });

  test('while identity is still connecting it waits, showing nothing', () => {
    mockIdentity.user = null;
    render(<DeleteAccountPage />);
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
  });

  test('signed out on the page (Sign in again) goes to My bets', () => {
    const view = render(<DeleteAccountPage />);
    expect(navigation.replace).not.toHaveBeenCalled();
    mockIdentity.user = { uid: 'anon-after', isAnonymous: true, providerData: [] };
    view.rerender(<DeleteAccountPage />);
    expect(navigation.replace).toHaveBeenCalledWith('/bets');
  });
});

// The #102 confirm, now opened from the page. Its copy and behaviour are
// unchanged (DeleteAccountDialog.test.jsx covers the dialog alone).
describe('the Delete your account? confirm', () => {
  test('the red button opens it with the unchanged copy; Keep it has focus, closes it and returns focus', async () => {
    render(<DeleteAccountPage />);
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent('This can’t be undone.');
    expect(within(dialog).getAllByRole('listitem').map((item) => item.textContent)).toEqual(BULLETS);
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' });
    expect(confirm).toHaveClass('danger');
    const keep = within(dialog).getByRole('button', { name: 'Keep it' });
    expect(keep).toHaveFocus();
    expect(deleteAccount).not.toHaveBeenCalled();
    await userEvent.click(keep);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pageButton()).toHaveFocus();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  test('busy, then on success clears local data, signs out and goes home, not to My bets', async () => {
    let finish;
    let signedOut;
    deleteAccount.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    signOutCreator.mockImplementation(() => new Promise((resolve) => { signedOut = resolve; }));
    const view = render(<DeleteAccountPage />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(within(dialog).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeDisabled();
    await act(async () => finish());
    expect(clearLocalAccountData).toHaveBeenCalledWith('creator');
    expect(signOutCreator).toHaveBeenCalledTimes(1);
    expect(clearLocalAccountData.mock.invocationCallOrder[0]).toBeLessThan(signOutCreator.mock.invocationCallOrder[0]);
    // Auth goes signed out before the trip home: the page must not send them to My bets.
    mockIdentity.user = { uid: 'anon-after', isAnonymous: true, providerData: [] };
    view.rerender(<DeleteAccountPage />);
    expect(navigation.replace).not.toHaveBeenCalled();
    await act(async () => signedOut());
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith('/');
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.back).not.toHaveBeenCalled();
  });

  test('a server error shows the error copy and keeps them signed in', async () => {
    deleteAccount.mockRejectedValue(Object.assign(new Error('x'), { code: 'server' }));
    render(<DeleteAccountPage />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Couldn’t delete your account. Try again.');
    expect(signOutCreator).not.toHaveBeenCalled();
    expect(clearLocalAccountData).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Delete account' })).toBeEnabled();
  });

  test('offline shows the shared offline line', async () => {
    deleteAccount.mockRejectedValue(Object.assign(new Error('x'), { code: 'offline' }));
    render(<DeleteAccountPage />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(PHONE_OFFLINE_ERROR);
  });

  test('a browser that reports offline shows the offline line', async () => {
    const spy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    deleteAccount.mockRejectedValue(new Error('x'));
    render(<DeleteAccountPage />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(PHONE_OFFLINE_ERROR);
    spy.mockRestore();
  });

  test('a stale sign-in shows the re-auth line; Sign in again notes the resume and signs out', async () => {
    deleteAccount.mockRejectedValue(Object.assign(new Error('x'), { code: 'requires-recent-login' }));
    render(<DeleteAccountPage />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    const again = await within(dialog).findByRole('button', { name: 'Sign in again' });
    expect(dialog).toHaveTextContent('Sign in again to delete your account. It’s a quick security check.');
    expect(again).toHaveClass('dialog-primary');
    expect(again).not.toHaveClass('danger');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await userEvent.click(again);
    expect(JSON.parse(sessionStorage.getItem(RESUME_KEY)).uid).toBe('creator');
    expect(signOutCreator).toHaveBeenCalledTimes(1);
    expect(clearLocalAccountData).not.toHaveBeenCalled();
    // Opened by a deep link: My bets takes this entry's place.
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith('/bets');
  });

  test('Sign in again that fails to sign out keeps them on the page with the error', async () => {
    deleteAccount.mockRejectedValue(Object.assign(new Error('x'), { code: 'requires-recent-login' }));
    signOutCreator.mockRejectedValue(new Error('x'));
    render(<DeleteAccountPage />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Sign in again' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Couldn’t delete your account. Try again.');
    expect(sessionStorage.getItem(RESUME_KEY)).toBeNull();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.back).not.toHaveBeenCalled();
  });

  test('Sign in again from My bets leaves My bets in history once', async () => {
    // A web-style history: push adds, replace swaps the top, back pops.
    const stack = ['/', '/bets'];
    navigation.push.mockImplementation((path) => stack.push(path));
    navigation.replace.mockImplementation((path) => { stack[stack.length - 1] = path; });
    navigation.back.mockImplementation(() => stack.pop());
    window.history.pushState({}, '', '/account/delete');
    openDeleteAccountPage(navigation);
    expect(stack).toEqual(['/', '/bets', '/account/delete']);

    deleteAccount.mockRejectedValue(Object.assign(new Error('x'), { code: 'requires-recent-login' }));
    let signedOut;
    signOutCreator.mockImplementation(() => new Promise((resolve) => { signedOut = resolve; }));
    const view = render(<DeleteAccountPage />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Sign in again' }));
    // Auth goes signed out before the sign out call returns.
    mockIdentity.user = { uid: 'anon-after', isAnonymous: true, providerData: [] };
    view.rerender(<DeleteAccountPage />);
    await act(async () => signedOut());
    expect(navigation.back).toHaveBeenCalledTimes(1);
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(stack).toEqual(['/', '/bets']);

    // Signed back in, My bets sends them on to the page (MyBets.jsx).
    openDeleteAccountPage(navigation);
    expect(stack).toEqual(['/', '/bets', '/account/delete']);
    expect(stack.filter((path) => path === '/bets')).toHaveLength(1);
  });

  test('back from sign-in, the confirm opens again, once', () => {
    markDeleteAccountResume('creator');
    const { unmount } = render(<DeleteAccountPage />);
    expect(screen.getByRole('dialog', { name: 'Delete your account?' })).toBeInTheDocument();
    unmount();
    render(<DeleteAccountPage />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('a resume note left by another member does not open the confirm, and is dropped', () => {
    markDeleteAccountResume('someone-else');
    render(<DeleteAccountPage />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sessionStorage.getItem(RESUME_KEY)).toBeNull();
  });
});
