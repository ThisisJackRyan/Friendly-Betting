import { useEffect } from 'react';

// The page behind an overlay: the mobile app's #root, or the Next app's
// frame. Null when the overlay sits inside it (nothing to make inert then).
export function appRoot(dialog) {
  if (typeof document === 'undefined') return null;
  const root = document.getElementById('root')
    || document.getElementById('__next')
    || document.querySelector('.app-frame');
  return root && dialog && !root.contains(dialog) ? root : null;
}

// Overlays holding the root inert. Only inert this module set is removed,
// and only once the last overlay lets go.
let holders = 0;
let ownedRoot = null;

// While an overlay is up the page behind it is inert; the returned release
// clears that and puts focus back where it was, unless something else has
// taken it (focus on the body, or still inside the overlay, counts as free).
export function holdBackground(dialog) {
  const previous = document.activeElement;
  const root = appRoot(dialog);
  if (root) {
    if (holders === 0 && !root.hasAttribute('inert')) {
      root.setAttribute('inert', '');
      ownedRoot = root;
    }
    holders += 1;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (root) {
      holders -= 1;
      if (holders === 0 && ownedRoot) {
        ownedRoot.removeAttribute('inert');
        ownedRoot = null;
      }
    }
    try {
      const active = document.activeElement;
      const free = !active || active === document.body || !active.isConnected || Boolean(dialog?.contains(active));
      if (free && previous && previous !== document.body && previous.isConnected) previous.focus?.({ preventScroll: true });
    } catch {
      // Nowhere to go back to.
    }
  };
}

// holdBackground for as long as `active` is true. Call it before any effect
// that moves focus into the overlay, so the opener is what gets saved.
export function useModalBackground(ref, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    return holdBackground(ref.current);
  }, [ref, active]);
}
