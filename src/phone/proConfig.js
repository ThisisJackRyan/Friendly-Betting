// Pro pricing, flags and copy (docs/PRO.md). Shared by the paywall and the
// mock purchase route, so nothing here loads Firebase.

// Creators make this many bets free, then Pro. Bettors (voters) never pay.
export const FREE_BETS = 3;
export const PRO_MONTHLY_USD = 3;
// A mock Pro month. Real renewals will come from the store (docs/PRO.md).
export const PRO_PERIOD_DAYS = 30;

// Early-access bet types for Pro members. Empty: no real new types yet. Each
// entry is { id, label, hint, example? } and shows in the type picker only
// with NEXT_PUBLIC_PRO_EARLY_TYPES=1 for a Pro member.
export const EARLY_ACCESS_TYPES = [];

// All off unless the build sets them to 1. The mobile vite build defines the
// same variables (mobile/vite.config.mjs).
export function proPaywallEnabled() {
  return process.env.NEXT_PUBLIC_PRO_PAYWALL === '1';
}

export function proEarlyTypesEnabled() {
  return process.env.NEXT_PUBLIC_PRO_EARLY_TYPES === '1';
}

// Preview builds only: the paywall buttons call the mock purchase route.
export function proMockPurchaseEnabled() {
  return process.env.NEXT_PUBLIC_PRO_MOCK_PURCHASE === '1';
}

// Web Pro billing with Stripe Checkout (docs/STRIPE-WEB-PRO.md). Web only:
// the mobile build always defines it off, and the sheet also checks
// isNativeApp(). With it on, Get Pro starts Checkout and the mock purchase
// is never called.
export function stripeWebProEnabled() {
  return process.env.NEXT_PUBLIC_STRIPE_WEB_PRO === '1';
}

// Terms and Privacy links on the Pro sheet. Each shows only when its URL is
// set, so the sheet never links to a page that isn't there.
export function proTermsUrl() {
  return (process.env.NEXT_PUBLIC_TERMS_URL || '').trim();
}

export function proPrivacyUrl() {
  return (process.env.NEXT_PUBLIC_PRIVACY_URL || '').trim();
}

// The Pro sheet's benefit rows, in order. A locked feature opens the sheet
// with its row highlighted (PRO_ROW).
export const PRO_ROW = { noAds: 1, badge: 2, runItBack: 3, headToHead: 4, early: 5 };

// Every on-screen string for Pro (UX, Oct 20).
export const PRO_COPY = {
  title: 'Go Pro',
  // A no-break space keeps "ads." off a line of its own where text-wrap:
  // balance is not supported.
  headline: 'All the bets. None of the\u00A0ads.',
  line: 'Friends always play free.',
  benefits: [
    'No ads, ever',
    'A Pro badge on your bets',
    'Run it back in one tap',
    'Head-to-head stats with friends',
    'Early access to new stuff',
  ],
  proPrice: `$${PRO_MONTHLY_USD}/mo`,
  proNote: 'Billed monthly. Cancel anytime.',
  getPro: 'Get Pro',
  buying: 'Getting you set…',
  comingSoon: 'Coming soon',
  later: 'Maybe later',
  finePrint: `Pro renews at $${PRO_MONTHLY_USD}/mo until you cancel in Settings.`,
  restore: 'Restore purchase',
  restoring: 'Restoring…',
  restored: 'Restored. You’re Pro.',
  nothingToRestore: 'Nothing to restore on this account.',
  terms: 'Terms',
  privacy: 'Privacy',
  owned: 'You’re Pro. No more ads.',
  backToBets: 'Back to my bets',
  error: 'Couldn’t finish that. Try again.',
  link: 'Go Pro',
  pro: 'Pro',
};

// New on-screen strings for Stripe web billing, shown only with
// NEXT_PUBLIC_STRIPE_WEB_PRO=1 on the web (UX approved them Oct 22).
// Everything else the Stripe flow shows reuses PRO_COPY (Get Pro, Getting
// you set…, the error line).
export const STRIPE_COPY = {
  // A muted text link under Back to my bets on the success screen; opens the
  // Stripe customer portal.
  manage: 'Manage subscription',
  // Replaces PRO_COPY.finePrint: cancelling is in the Stripe portal, not Settings.
  finePrint: `Pro renews at $${PRO_MONTHLY_USD}/mo until you cancel.`,
};
