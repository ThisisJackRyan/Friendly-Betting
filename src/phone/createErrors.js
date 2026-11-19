import { friendlyError } from './model';

// What Create and Run it back show when a new bet doesn't save (docs/PRO.md,
// "Create errors"). One place, so the two can't drift.
export const CREATE_ERROR_COPY = {
  // 403 pro-required: the server refused a Pro feature (Run it back, or an
  // early-access type) because the caller has no live Pro.
  proRequired: 'Your Pro ended, so Run it back is locked.',
  goPro: 'Go Pro',
  // 503 not-configured: the server couldn't check Pro.
  notConfigured: 'Couldn’t check Pro right now. Try again in a bit.',
  tryAgain: 'Try again',
  // Anything else without its own message.
  failed: 'Couldn’t save this bet. Try again.',
};

// 'go-pro': a Go Pro button opens the Pro sheet on the Run it back row.
// 'retry': a Try again button saves again.
export const CREATE_ERROR_ACTION = { goPro: 'go-pro', retry: 'retry' };

// A save that never got an answer: the browser is offline, the network
// dropped or hung (createBet's 'timeout'), or Firestore / Auth couldn't reach
// their servers. These show the fallback line, never the raw message
// (Firestore's "Connection failed.", say), and the main button saves again.
export const CREATE_NETWORK_CODES = [
  'offline',
  'timeout',
  'unavailable',
  'deadline-exceeded',
  'firestore/unavailable',
  'firestore/deadline-exceeded',
  'auth/network-request-failed',
];

export function isCreateNetworkError(err) {
  return CREATE_NETWORK_CODES.includes(err?.code);
}

// The line to show for a failed create, and the button that goes with it
// (action is null when there is none).
export function createSaveError(err) {
  if (isCreateNetworkError(err)) {
    return { message: CREATE_ERROR_COPY.failed, action: null };
  }
  if (err?.code === 'pro-required') {
    return { message: CREATE_ERROR_COPY.proRequired, action: CREATE_ERROR_ACTION.goPro };
  }
  if (err?.code === 'not-configured') {
    return { message: CREATE_ERROR_COPY.notConfigured, action: CREATE_ERROR_ACTION.retry };
  }
  return { message: friendlyError(err, CREATE_ERROR_COPY.failed), action: null };
}
