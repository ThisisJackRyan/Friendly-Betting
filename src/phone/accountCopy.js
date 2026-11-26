// Every on-screen string for the Account sheet, its Log out confirm and the
// Delete account page (Friendly UX, final). The delete confirm itself keeps
// its own copy in deleteAccountCopy.js.
export const ACCOUNT_COPY = {
  icon: 'Account',
  title: 'Account',
  signedInAs: (phone) => `Signed in as ${phone}`,
  logOut: 'Log out',
  deleteRow: 'Delete account',
  logOutTitle: 'Log out?',
  logOutBody: 'Sign back in with your number anytime.',
  logOutConfirm: 'Log out',
  logOutCancel: 'Cancel',
  logOutError: 'Couldn’t log out. Try again.',
  back: 'Back',
  pageTitle: 'Delete account',
  pageButton: 'Delete account',
  neverMind: 'Never mind',
};

// The member's number for "Signed in as": +1 numbers read (816) 555-0123;
// any other country shows E.164 as stored (no phone library in the app).
export function accountPhone(e164) {
  const raw = String(e164 || '').trim();
  const us = raw.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (us) return `(${us[1]}) ${us[2]}-${us[3]}`;
  return raw;
}
