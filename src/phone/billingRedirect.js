// Leaves the app for a Stripe-hosted page (Checkout or the customer portal).
// Its own module so tests can stand in for a real navigation. Only https
// URLs: the URL comes from our server, but never follow anything else.
export function leaveForBilling(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return false;
  window.location.assign(url);
  return true;
}
