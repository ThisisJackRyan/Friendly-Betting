import { isNativeApp } from '../platform/runtime';

export function smsHref(text, userAgent = '') {
  const body = encodeURIComponent(text);
  if (/iPhone|iPad|iPod/i.test(userAgent)) return `sms:&body=${body}`;
  return `sms:?body=${body}`;
}

export function isMobileUa(userAgent = '') {
  return /Android|iPhone|iPad|iPod/i.test(userAgent);
}

// True when a share sheet can open: the native one in the app, or the
// browser's navigator.share.
export function hasShareSheet() {
  if (isNativeApp()) return true;
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

// 'shared', 'aborted', 'manual' (native sheet failed), or null when no sheet
// opened (none here, or the browser refused it).
async function shareSheet(text) {
  if (isNativeApp()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'FRIENDLY', text, dialogTitle: 'Text the crew' });
      return 'shared';
    } catch (err) {
      if (/cancel|dismiss|abort/i.test(`${err?.code || ''} ${err?.message || ''}`)) return 'aborted';
      // Do not launch a second composer after a native share failure.
      return 'manual';
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'aborted';
    }
  }
  return null;
}

// The share sheet alone, for a share nobody tapped: never Messages, the
// clipboard, or the manual copy. '' when no sheet opened.
export async function openShareSheet(text) {
  const result = await shareSheet(text);
  return result === 'shared' || result === 'aborted' ? result : '';
}

export async function shareMessage(text) {
  const sheet = await shareSheet(text);
  if (sheet) return sheet;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (typeof window !== 'undefined' && isMobileUa(ua)) {
    window.location.href = smsHref(text, ua);
    return 'sms';
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch (err) {
      return 'manual';
    }
  }
  return 'manual';
}
