import { isNativeApp } from '../platform/runtime';
import { CARD_FILENAME } from './winnerCard';

// A 1x1 PNG, for asking whether the share sheet takes a PNG file before the
// card itself is drawn.
const PROBE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const probeBlob = () => new Blob([Uint8Array.from(atob(PROBE_PNG), (char) => char.charCodeAt(0))], { type: 'image/png' });

const shareSheet = () => {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  return nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' ? nav : null;
};

// True when the share sheet takes a PNG file: `blob`, or a probe PNG while
// the card is not drawn yet. Never throws.
export function canShareImageFiles(blob, filename = CARD_FILENAME) {
  try {
    const nav = shareSheet();
    if (!nav || typeof File !== 'function') return false;
    return Boolean(nav.canShare({ files: [new File([blob || probeBlob()], filename, { type: 'image/png' })] }));
  } catch {
    return false;
  }
}

// Shares a PNG Blob: 'shared', 'aborted', 'downloaded' or 'failed'. Never
// throws.
//
// 1. The share sheet with the file, where the browser can share files
//    (navigator.canShare({ files })): mobile Safari and Chrome, the app's web
//    view where it can. The app only offers the image when it can
//    (canShareImageFiles).
// 2. On the web: a download of the PNG. The app has no download, so 'failed'.
export async function shareImage(blob, { filename = CARD_FILENAME, title = 'FRIENDLY' } = {}) {
  if (!blob) return 'failed';
  const nav = shareSheet();
  if (nav) {
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
  if (isNativeApp()) return 'failed';
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
