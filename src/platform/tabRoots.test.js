import { isTabRoot } from './tabRoots';

test('Home and My bets are the tab roots, with or without a hash, query or trailing slash', () => {
  ['/', '/bets', '/bets/', '/#how-it-works', '/bets?x=1'].forEach((href) => expect(isTabRoot(href)).toBe(true));
  ['/new', '/new#step-2', '/t/abc', '/b/abc', '/Bet/bets/1', '/betsy', undefined, { pathname: '/' }]
    .forEach((href) => expect(isTabRoot(href)).toBe(false));
});
