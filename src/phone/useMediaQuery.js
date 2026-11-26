import { useCallback, useSyncExternalStore } from 'react';

const query = (media) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(media)
    : null;

// True while the CSS media query matches. False where there is no
// matchMedia (the server, some test setups), so callers get their wide layout.
export default function useMediaQuery(media) {
  const subscribe = useCallback(
    (onChange) => {
      const list = query(media);
      if (!list) return () => {};
      list.addEventListener?.('change', onChange);
      return () => list.removeEventListener?.('change', onChange);
    },
    [media],
  );
  return useSyncExternalStore(
    subscribe,
    () => Boolean(query(media)?.matches),
    () => false,
  );
}
