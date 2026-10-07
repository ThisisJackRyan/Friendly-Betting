import { PROD_ORIGIN } from '../src/platform/runtime';

export function appPathFromUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return null;
    let path;
    if (url.protocol === 'friendlybetting:') {
      if (url.port) return null;
      path = `${url.host ? `/${url.host}` : ''}${url.pathname}` || '/';
    } else if (url.origin === PROD_ORIGIN) {
      path = url.pathname;
    } else return null;
    path = path.replace(/^\/Friendly-Betting(?=\/|$)/, '') || '/';
    if (!/^(?:\/|\/bets\/?|\/new(?:\/(?:money-line|over-under|prop))?\/?|\/(?:b|t)\/[A-Za-z0-9_-]+\/?|\/Bet\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?)$/.test(path)) return null;
    return path;
  } catch {
    return null;
  }
}
