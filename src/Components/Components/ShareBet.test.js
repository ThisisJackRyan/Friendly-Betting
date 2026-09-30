import { betShareText, buildSmsHref } from './ShareBet';

test('share text names both options and an optional stake', () => {
  expect(betShareText({
    question: 'Who is late?',
    optionA: 'Sam',
    optionB: 'Alex',
    stake: 'Coffee',
  })).toBe('Who is late?\nSam or Alex\nStake: Coffee');
});

test('iMessage uses an sms body link', () => {
  const href = buildSmsHref('Who is late?\nhttp://localhost/b', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
  expect(href.startsWith('sms:&body=')).toBe(true);
  expect(decodeURIComponent(href.slice(href.indexOf('body=') + 5))).toContain('http://localhost/b');
});

test('other phones use the sms query body', () => {
  const href = buildSmsHref('Bet', 'Mozilla/5.0 (Linux; Android 14)');
  expect(href.startsWith('sms:?body=')).toBe(true);
});
