// A tiny Stripe REST client for account deletion only: read, cancel and list
// subscriptions, and delete a customer. The stripe npm package is not a
// dependency on main, so this calls https://api.stripe.com/v1 with fetch
// (Bearer key, form-encoded). Server only.
//
// Every call resolves to the parsed object, or null when Stripe says the
// object is gone (404 resource_missing), so a retry after a partial run is
// a no-op. Any other failure throws with code 'stripe-failed' and never
// carries an id, the key, or Stripe's message (which can name the customer).

const API = 'https://api.stripe.com/v1';

// Statuses Stripe may still bill (or resume) from. Canceled and
// incomplete_expired are done.
export const OPEN_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']);

function stripeFailed(status) {
  const err = new Error('Stripe request failed.');
  err.code = 'stripe-failed';
  err.status = status;
  return err;
}

export function stripeConfigured(env = process.env) {
  return Boolean(String(env.STRIPE_SECRET_KEY || '').trim());
}

// null when STRIPE_SECRET_KEY is not set: the deploy has no Stripe.
export function createStripeClient({ key = process.env.STRIPE_SECRET_KEY, fetchImpl = globalThis.fetch } = {}) {
  const secret = String(key || '').trim();
  if (!secret) return null;

  async function call(method, path, params) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    let res;
    try {
      res = await fetchImpl(`${API}${path}${query}`, {
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    } catch (cause) {
      throw stripeFailed(0);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw stripeFailed(res.status);
    try {
      return await res.json();
    } catch (cause) {
      throw stripeFailed(res.status);
    }
  }

  const id = (value) => encodeURIComponent(value);

  return {
    retrieveSubscription: (subscriptionId) => call('GET', `/subscriptions/${id(subscriptionId)}`),
    // Cancels now, not at period end.
    cancelSubscription: (subscriptionId) => call('DELETE', `/subscriptions/${id(subscriptionId)}`),
    // Up to 100 subscriptions of any status. A deleted customer lists as none.
    listSubscriptions: async (customerId) => {
      const page = await call('GET', '/subscriptions', { customer: customerId, status: 'all', limit: '100' });
      return Array.isArray(page?.data) ? page.data : [];
    },
    deleteCustomer: (customerId) => call('DELETE', `/customers/${id(customerId)}`),
  };
}
