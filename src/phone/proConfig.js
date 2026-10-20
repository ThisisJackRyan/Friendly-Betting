// Pro pricing, flags and copy (docs/PRO.md). Shared by the paywall and the
// mock purchase route, so nothing here loads Firebase.

// Creators make this many bets free, then Pro. Bettors (voters) never pay.
export const FREE_BETS = 3;
export const PRO_MONTHLY_USD = 3;
// A mock Pro month. Real renewals will come from the store (docs/PRO.md).
export const PRO_PERIOD_DAYS = 30;

// Founder lifetime spots, numbered from 1: #1 to #100 at $40, #101 to #600
// at $80, then sold out.
export const FOUNDER_TIERS = [
  { through: 100, price: 40 },
  { through: 600, price: 80 },
];
export const FOUNDER_LIMIT = FOUNDER_TIERS[FOUNDER_TIERS.length - 1].through;

// The offer for the next founder, given how many spots are taken.
export function founderOffer(count) {
  const taken = Math.max(0, Math.floor(Number(count) || 0));
  let from = 0;
  for (let index = 0; index < FOUNDER_TIERS.length; index += 1) {
    const tier = FOUNDER_TIERS[index];
    if (taken < tier.through) {
      return { soldOut: false, first: index === 0, price: tier.price, spots: tier.through - from, next: taken + 1 };
    }
    from = tier.through;
  }
  return { soldOut: true };
}

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

// Every on-screen string for Pro.
export const PRO_COPY = {
  title: 'Go Pro',
  free: `Start ${FREE_BETS} bets free, then $${PRO_MONTHLY_USD}/mo.`,
  noAds: 'No ads.',
  bettors: 'Picking a side is always free.',
  founder: (offer) => `Founder: $${offer.price} once, Pro for life. ${offer.first ? 'First' : 'Next'} ${offer.spots} only.`,
  founderSoldOut: `Founder spots are gone. Pro is still $${PRO_MONTHLY_USD}/mo.`,
  getPro: 'Get Pro',
  getFounder: 'Get Founder',
  notNow: 'Not now',
  comingSoon: 'Coming soon',
  owned: 'You’re Pro. No more ads.',
  ownedFounder: (number) => `You’re Founder #${number}. No more ads.`,
  error: 'Couldn’t finish that. Try again.',
  link: 'Go Pro',
  pro: 'Pro',
  founderBadge: 'Founder',
  founderNumber: (number) => `Founder #${number}`,
};
