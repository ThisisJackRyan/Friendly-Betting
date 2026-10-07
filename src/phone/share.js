import { isNativeApp } from '../platform/runtime';

export function smsHref(text, userAgent = '') {
  const body = encodeURIComponent(text);
  if (/iPhone|iPad|iPod/i.test(userAgent)) return `sms:&body=${body}`;
  return `sms:?body=${body}`;
}

export function isMobileUa(userAgent = '') {
  return /Android|iPhone|iPad|iPod/i.test(userAgent);
}

export async function shareMessage(text) {
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
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'aborted';
    }
  }
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
