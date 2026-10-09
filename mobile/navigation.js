import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isTabRoot } from '../src/platform/tabRoots';

export { useParams } from 'react-router-dom';
export function usePathname() {
  return useLocation().pathname;
}

const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
let unwinding = null;

// A tab is a root: walk back to the first app entry (React Router's idx 0, the
// first item in the WebView's back list), then put the tab in its place. So a
// tab never has an app entry behind it, and the iOS swipe has nothing to reach.
export function goToRoot(navigate, to) {
  if (unwinding) {
    unwinding.to = to;
    return;
  }
  const behind = window.history.state?.idx || 0;
  const arrive = (target) => {
    if (target !== here()) navigate(target, { replace: true });
  };
  if (behind <= 0) {
    arrive(to);
    return;
  }
  unwinding = { to };
  const finish = () => {
    window.removeEventListener('popstate', onPop);
    window.clearTimeout(fallback);
    const target = unwinding.to;
    unwinding = null;
    arrive(target);
  };
  // After the router has handled the same popstate.
  const onPop = () => {
    window.removeEventListener('popstate', onPop);
    window.clearTimeout(fallback);
    window.setTimeout(finish, 0);
  };
  // If the walk back never lands (a stale idx), still reach the tab, by replace.
  const fallback = window.setTimeout(finish, 1000);
  window.addEventListener('popstate', onPop);
  navigate(-behind);
}

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(() => {
    const go = (path, replace) => {
      if (isTabRoot(path)) goToRoot(navigate, path);
      else navigate(path, { replace });
    };
    return {
      push: (path) => go(path, false),
      replace: (path) => go(path, true),
      back: () => window.history.state?.idx > 0 ? navigate(-1) : goToRoot(navigate, '/bets'),
    };
  }, [navigate]);
}
