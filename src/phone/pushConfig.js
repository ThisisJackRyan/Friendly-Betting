// Push notifications (docs/PUSH.md). Shared by the app and the API routes, so
// nothing here imports Capacitor, Firebase or the Admin SDK.

// Off unless the build sets NEXT_PUBLIC_PUSH_ENABLED=1. The mobile vite build
// defines the same variable (mobile/vite.config.mjs), so one flag covers both,
// and the server send path checks it too: turning the Vercel env off stops
// delivery without an app update.
export function pushEnabled() {
  return process.env.NEXT_PUBLIC_PUSH_ENABLED === '1';
}

// The Android notification channel every bet push lands in. Not user-facing;
// its name and description are PUSH_CHANNEL_COPY in pushCopy.js. Never
// rename it: Android keeps a channel's settings under its id.
export const PUSH_CHANNEL_ID = 'bet_updates';
export const PUSH_PLATFORMS = ['ios', 'android'];

// Devices kept per uid; registering one more evicts the oldest updatedAt.
export const MAX_PUSH_DEVICES = 10;

// A per-install id from Preferences (a UUID today), never the raw token.
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function validDeviceId(deviceId) {
  return typeof deviceId === 'string' && DEVICE_ID_PATTERN.test(deviceId);
}

// FCM registration tokens are opaque. Bound the size and refuse whitespace
// and control characters; never echo or log one.
export function validPushToken(token) {
  return typeof token === 'string' && token.length > 0 && token.length <= 4096 && /^[\x21-\x7e]+$/.test(token);
}

export function validPushPlatform(platform) {
  return PUSH_PLATFORMS.includes(platform);
}
