export function appBasename() {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname || '';
  if (path === '/Friendly-Betting' || path.startsWith('/Friendly-Betting/')) {
    return '/Friendly-Betting';
  }
  return '';
}

export function voteUrl(code) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${appBasename()}/b/${code}`;
}
