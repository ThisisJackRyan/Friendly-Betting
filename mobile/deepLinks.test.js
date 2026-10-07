import { appPathFromUrl } from './deepLinks';

test.each([
  ['https://www.friendly-bets.com/b/abc123', '/b/abc123'],
  ['https://www.friendly-bets.com/t/abc123', '/t/abc123'],
  ['https://www.friendly-bets.com/Friendly-Betting/Bet/Prop/abc', '/Bet/Prop/abc'],
  ['friendlybetting://b/abc123', '/b/abc123'],
  ['friendlybetting://new/over-under', '/new/over-under'],
  ['friendlybetting:///bets', '/bets'],
])('opens supported link %s inside the shared app', (url, path) => {
  expect(appPathFromUrl(url)).toBe(path);
});

test.each([
  'https://evil.example/b/abc123',
  'https://www.friendly-bets.com.evil.example/b/abc123',
  'http://www.friendly-bets.com/b/abc123',
  'https://someone@www.friendly-bets.com/b/abc123',
  'https://friendly-bets.com/b/abc123',
  'javascript:alert(1)',
  'friendlybetting://b/a%2fb',
  'friendlybetting://unknown',
  'not a url',
])('rejects unrelated or unsafe links: %s', (url) => {
  expect(appPathFromUrl(url)).toBeNull();
});
