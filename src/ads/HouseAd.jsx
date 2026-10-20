import { useEffect, useRef } from 'react';

// The web stand-in for an interstitial: a fixed full-screen layer, so the page
// under it never moves. Closes on the button, Escape, or by itself.
const layer = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
  background: 'var(--page, #f6f7f2)',
  color: 'var(--ink, #203b2e)',
  fontFamily: 'inherit',
};

const label = {
  position: 'absolute',
  top: 'calc(env(safe-area-inset-top) + 12px)',
  left: 'calc(env(safe-area-inset-left) + 16px)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--muted, #5e6b60)',
};

const close = {
  position: 'absolute',
  top: 'calc(env(safe-area-inset-top) + 4px)',
  right: 'calc(env(safe-area-inset-right) + 4px)',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 0,
  borderRadius: 22,
  background: 'transparent',
  color: 'inherit',
  fontSize: 24,
  lineHeight: 1,
  cursor: 'pointer',
};

const panel = {
  width: 'min(320px, 80vw)',
  aspectRatio: '1 / 1',
  borderRadius: 'var(--radius-card, 18px)',
  background: 'var(--wash, #e8efe3)',
};

// The page behind the ad: the mobile app's #root, or the Next app's frame.
function appRoot(dialog) {
  if (typeof document === 'undefined') return null;
  const root = document.getElementById('root')
    || document.getElementById('__next')
    || document.querySelector('.app-frame');
  return root && dialog && !root.contains(dialog) ? root : null;
}

export default function HouseAd({ onClose, autoCloseMs = 0 }) {
  const dialog = useRef(null);
  const button = useRef(null);
  const done = useRef(false);
  const finish = useRef(onClose);
  finish.current = () => {
    if (done.current) return;
    done.current = true;
    onClose?.();
  };

  // While the ad is up the page behind it is inert; on close (or unmount)
  // focus goes back where it was.
  useEffect(() => {
    const previous = document.activeElement;
    const root = appRoot(dialog.current);
    const madeInert = Boolean(root && !root.hasAttribute('inert'));
    if (madeInert) root.setAttribute('inert', '');
    return () => {
      if (madeInert) root.removeAttribute('inert');
      try {
        if (previous && previous !== document.body && previous.isConnected) previous.focus?.();
      } catch {
        // Nowhere to go back to.
      }
    };
  }, []);

  useEffect(() => {
    button.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') finish.current();
    };
    window.addEventListener('keydown', onKey);
    const timer = autoCloseMs > 0 ? setTimeout(() => finish.current(), autoCloseMs) : null;
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer) clearTimeout(timer);
    };
  }, [autoCloseMs]);

  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Ad" style={layer} data-testid="house-ad">
      <span style={label}>Ad</span>
      <button ref={button} type="button" aria-label="Close ad" style={close} onClick={() => finish.current()}>
        <span aria-hidden="true">×</span>
      </button>
      <div style={panel} aria-hidden="true" />
    </div>
  );
}

// Mounts a HouseAd on its own root and resolves once it closes.
export async function showHouseAd({ autoCloseMs } = {}) {
  const { createRoot } = await import('react-dom/client');
  const host = document.createElement('div');
  host.setAttribute('data-house-ad-host', '');
  document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise((resolve) => {
    const onClose = () => {
      // Unmount after this event finishes so React is not mid-dispatch.
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
      resolve();
    };
    root.render(<HouseAd onClose={onClose} autoCloseMs={autoCloseMs} />);
  });
}
