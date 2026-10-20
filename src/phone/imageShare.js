import { isNativeApp } from '../platform/runtime';
import { CARD_FILENAME } from './winnerCard';

// Shares a PNG Blob: 'shared', 'aborted', 'downloaded', 'preview' or
// 'failed'. Never throws.
//
// 1. The share sheet with the file, where the browser can share files
//    (navigator.canShare({ files })): mobile Safari and Chrome, the iOS app's
//    web view.
// 2. In the app without that: 'preview', so the screen shows the image to
//    press and hold. @capacitor/share only takes file:// paths, and writing
//    one would need @capacitor/filesystem.
// 3. On the web: a download of the PNG.
export async function shareImage(blob, { filename = CARD_FILENAME, title = 'FRIENDLY' } = {}) {
  if (!blob) return 'failed';
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title });
        return 'shared';
      }
    } catch (err) {
      if (err?.name === 'AbortError') return 'aborted';
      // Refused (no user gesture left, say): fall through to the next way.
    }
  }
  if (isNativeApp()) return 'preview';
  return downloadImage(blob, filename) ? 'downloaded' : 'failed';
}

// Saves the Blob through an <a download>. False when the page can't.
export function downloadImage(blob, filename = CARD_FILENAME) {
  try {
    if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return false;
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the download a moment to start before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(href), 10000);
    return true;
  } catch {
    return false;
  }
}
