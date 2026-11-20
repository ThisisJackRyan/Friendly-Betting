import { PHONE_OFFLINE_ERROR } from './creatorSession';
import { isProEntitlement } from './entitlement';

// Every on-screen string for Delete account (My bets). UX approved.
export const DELETE_ACCOUNT_COPY = {
  row: 'Delete account',
  title: 'Delete your account?',
  lead: 'This can’t be undone.',
  bullets: [
    'Bets you made disappear for everyone, votes and links too.',
    'Your picks on friends’ open bets are removed.',
    'Your name is cleared from settled bets.',
  ],
  // Keyed by entitlements/{uid}.source. Only Stripe is billed today; Apple
  // and Google are here for when store billing ships. Any other source
  // (a mock test purchase, a legacy founder grant) bills nothing: no bullet.
  proBullets: {
    stripe: 'Pro ends right away, with no refund.',
    apple: 'Pro is billed by Apple. Cancel it in your phone’s settings so it doesn’t renew.',
    google: 'Pro is billed by Google. Cancel it in Google Play so it doesn’t renew.',
  },
  confirm: 'Delete account',
  busy: 'Deleting…',
  error: 'Couldn’t delete your account. Try again.',
  offline: PHONE_OFFLINE_ERROR,
  reauth: 'Sign in again to delete your account. It’s a quick security check.',
  reauthButton: 'Sign in again',
};

// The Pro line for the member's current plan, or '' for none.
export function proBulletFor(entitlement, now = Date.now()) {
  if (!isProEntitlement(entitlement, now)) return '';
  const { source } = entitlement;
  return Object.prototype.hasOwnProperty.call(DELETE_ACCOUNT_COPY.proBullets, source)
    ? DELETE_ACCOUNT_COPY.proBullets[source]
    : '';
}
