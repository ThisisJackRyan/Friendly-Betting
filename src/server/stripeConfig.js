import Stripe from 'stripe';

// Web Pro billing with Stripe (docs/STRIPE-WEB-PRO.md). Server only. Every
// Stripe route answers 404 unless stripeWebProConfig() returns a config, so
// with the flag off nothing here is reachable. Nothing here logs a secret.

function failure(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

const trimmed = (value) => String(value || '').trim();

// 'test', 'live' or '' for anything that is not a Stripe secret or
// restricted key.
export function stripeKeyMode(key) {
  const value = trimmed(key);
  if (/^(sk|rk)_test_./.test(value)) return 'test';
  if (/^(sk|rk)_live_./.test(value)) return 'live';
  return '';
}

// Test mode only. A live key needs STRIPE_ALLOW_LIVE=1 (out of scope today).
// A test key is refused on a Vercel production deploy: anyone could buy Pro
// there with a test card.
export function stripeKeyAllowed(env = process.env) {
  const mode = stripeKeyMode(env.STRIPE_SECRET_KEY);
  if (mode === 'live') return env.STRIPE_ALLOW_LIVE === '1';
  if (mode === 'test') return env.VERCEL_ENV !== 'production';
  return false;
}

// Where Checkout and the portal send the member back: an absolute https
// origin (http only for localhost), no path. Never taken from the request.
export function stripeBaseUrl(env = process.env) {
  const raw = trimmed(env.STRIPE_WEB_PRO_BASE_URL);
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return '';
  if (url.username || url.password || url.search || url.hash) return '';
  if (url.pathname !== '/' && url.pathname !== '') return '';
  return url.origin;
}

// The whole config, or null (every Stripe route a 404) unless
// STRIPE_WEB_PRO=1, the key is allowed, and every required value is set.
export function stripeWebProConfig(env = process.env) {
  if (env.STRIPE_WEB_PRO !== '1') return null;
  if (!stripeKeyAllowed(env)) return null;
  const config = {
    secretKey: trimmed(env.STRIPE_SECRET_KEY),
    webhookSecret: trimmed(env.STRIPE_WEBHOOK_SECRET),
    priceId: trimmed(env.STRIPE_PRICE_ID),
    portalConfigurationId: trimmed(env.STRIPE_PORTAL_CONFIGURATION_ID),
    baseUrl: stripeBaseUrl(env),
    allowLive: env.STRIPE_ALLOW_LIVE === '1',
  };
  if (!config.webhookSecret || !config.priceId || !config.baseUrl) return null;
  return config;
}

let client = null;
let clientKey = '';

// One Stripe client per key, made on first use inside a request, so
// `next build` never needs a key. A live key without allowLive is refused
// here too, whatever built the config.
export function stripeClient(config) {
  const mode = stripeKeyMode(config?.secretKey);
  if (mode !== 'test' && !(mode === 'live' && config.allowLive)) throw failure('stripe-key-refused');
  if (!client || clientKey !== config.secretKey) {
    client = new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 15000 });
    clientKey = config.secretKey;
  }
  return client;
}

// Tests only.
export function __resetStripeClientForTests() {
  client = null;
  clientKey = '';
}
