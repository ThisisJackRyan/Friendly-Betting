import { isNativeApp, PROD_ORIGIN } from '../platform/runtime';

export function voteUrl(code) {
  const origin = isNativeApp() ? PROD_ORIGIN : typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/b/${encodeURIComponent(code)}`;
}
