import { appPathFromUrl } from './deepLinks';

test.each([
  ['https://friendly-betting-teal.vercel.app/b/abc123', '/b/abc123'],
  ['https://friendly-betting-teal.vercel.app/t/abc123', '/t/abc123'],
  ['https://friendly-betting-teal.vercel.app/Friendly-Betting/Bet/Prop/abc', '/Bet/Prop/abc'],
  ['friendlybetting://b/abc123', '/b/abc123'],
  ['friendlybetting://new/over-under', '/new/over-under'],
  ['friendlybetting:///bets', '/bets'],
])('opens supported link %s inside the shared app', (url, path) => {
  expect(appPathFromUrl(url)).toBe(path);
});

test.each([
  'https://evil.example/b/abc123',
  'https://friendly-betting-teal.vercel.app.evil.example/b/abc123',
  'http://friendly-betting-teal.vercel.app/b/abc123',
  'https://someone@friendly-betting-teal.vercel.app/b/abc123',
  'javascript:alert(1)',
  'friendlybetting://b/a%2fb',
  'friendlybetting://unknown',
  'not a url',
])('rejects unrelated or unsafe links: %s', (url) => {
  expect(appPathFromUrl(url)).toBeNull();
});
