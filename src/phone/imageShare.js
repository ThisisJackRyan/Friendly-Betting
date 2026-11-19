import { isNativeApp } from '../platform/runtime';
import { CARD_FILENAME } from './winnerCard';
import { openShareSheet } from './share';

// A 1x1 PNG, for asking whether the share sheet takes a PNG file before the
// card itself is drawn.
const PROBE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const probeBlob = () => new Blob([Uint8Array.from(atob(PROBE_PNG), (char) => char.charCodeAt(0))], { type: 'image/png' });

const shareSheet = () => {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  return nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' ? nav : null;
};

// True when the share sheet takes a PNG file: `blob`, or a probe PNG while
// the card is not drawn yet. Never throws. A web probe only: the app shares
// files through @capacitor/share whatever its web view says.
export function canShareImageFiles(blob, filename = CARD_FILENAME) {
  try {
    const nav = shareSheet();
    if (!nav || typeof File !== 'function') return false;
    return Boolean(nav.canShare({ files: [new File([blob || probeBlob()], filename, { type: 'image/png' })] }));
  } catch {
    return false;
  }
}

// The PNG as base64, without the data: prefix, for Filesystem.writeFile.
function base64Of(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

const cancelled = (err) => /cancel|dismiss|abort/i.test(`${err?.code || ''} ${err?.message || ''} ${err?.name || ''}`);

// The app's own share sheet with the PNG as a file: written to the cache
// folder (which the Android FileProvider serves, res/xml/file_paths.xml), and
// its file:// URI handed to @capacitor/share. The Android web view has no
// navigator.share, so this is the only way the image reaches a share sheet
// there. 'shared', 'aborted' or null when it could not open.
async function shareNativeFile(blob, filename, title) {
  try {
    const [{ Share }, { Filesystem, Directory }] = await Promise.all([
      import('@capacitor/share'),
      import('@capacitor/filesystem'),
    ]);
    const { uri } = await Filesystem.writeFile({ path: filename, data: await base64Of(blob), directory: Directory.Cache });
    await Share.share({ title, files: [uri], dialogTitle: 'Share as image' });
    return 'shared';
  } catch (err) {
    return cancelled(err) ? 'aborted' : null;
  }
}

// Shares a PNG Blob: 'shared', 'aborted', 'downloaded' or 'failed'. Never
// throws. `text` is the result message, for a link-only share when the
// image cannot go.
//
// In the app: the native share sheet with the PNG file (shareNativeFile). If
// that fails, the result text through the share sheet; never a download.
//
// On the web:
// 1. The share sheet with the file, where the browser can share files
//    (navigator.canShare({ files })): mobile Safari and Android Chrome.
// 2. A download of the PNG: desktop, or a browser that refused the file.
// 3. The result text through the share sheet, when the download can't run.
export async function shareImage(blob, { filename = CARD_FILENAME, title = 'FRIENDLY', text = '' } = {}) {
  if (!blob) return 'failed';
  if (isNativeApp()) {
    const native = await shareNativeFile(blob, filename, title);
    if (native) return native;
    return shareLink(text);
  }
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
  if (downloadImage(blob, filename)) return 'downloaded';
  return shareLink(text);
}

// The result text through the share sheet alone: 'shared', 'aborted', or
// 'failed' when there is no text or no sheet opened.
async function shareLink(text) {
  if (!text) return 'failed';
  try {
    return (await openShareSheet(text)) || 'failed';
  } catch {
    return 'failed';
  }
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
