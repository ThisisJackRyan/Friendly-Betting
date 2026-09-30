import { betShareText, buildSmsHref } from './ShareBet';

const url = 'http://localhost/b';

test('stake copy is one line and names the stake', () => {
  const body = betShareText({
    question: 'Who is late?',
    optionA: 'Sam',
    optionB: 'Alex',
    stake: 'Coffee',
    url,
  });
  expect(body).toBe('Jack: Who is late? Sam/Alex — Coffee. Vote: http://localhost/b');
  expect(body.split('\n').length).toBeLessThanOrEqual(2);
});

test('an empty stake drops the stake clause', () => {
  const body = betShareText({
    question: 'Who is late',
    optionA: 'Yes',
    optionB: 'No',
    stake: '   ',
    url,
  });
  expect(body).toBe('Jack: Who is late? Yes/No. Vote: http://localhost/b');
  expect(body.includes('—')).toBe(false);
  expect(body.split('\n').length).toBeLessThanOrEqual(2);
});

test('a passed creator name replaces Jack', () => {
  expect(betShareText({
    creatorName: 'Sam',
    question: 'Ready',
    optionA: 'Yes',
    optionB: 'No',
    url,
  })).toBe('Sam: Ready? Yes/No. Vote: http://localhost/b');
});

test('iMessage uses an sms body link', () => {
  const href = buildSmsHref('Jack: Who is late? Yes/No. Vote: http://localhost/b', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
  expect(href.startsWith('sms:&body=')).toBe(true);
  expect(decodeURIComponent(href.slice(href.indexOf('body=') + 5))).toBe('Jack: Who is late? Yes/No. Vote: http://localhost/b');
});

test('other phones use the sms query body', () => {
  const href = buildSmsHref('Bet', 'Mozilla/5.0 (Linux; Android 14)');
  expect(href.startsWith('sms:?body=')).toBe(true);
});
