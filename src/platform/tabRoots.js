// The bottom-nav tabs are roots: nothing in the app sits behind them, so there
// is no back from a tab (iOS swipe off, Android back goes Home, then out).
// ios/App/App/SceneDelegate.swift keeps its own copy of these paths.
export const TAB_ROOTS = ['/', '/bets'];

export function isTabRoot(href) {
  if (typeof href !== 'string') return false;
  const path = href.split(/[?#]/)[0].replace(/(.)\/$/, '$1') || '/';
  return TAB_ROOTS.includes(path);
}
