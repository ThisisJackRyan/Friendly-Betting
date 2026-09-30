import { isMobileUa, smsHref } from './share';

test('builds an iMessage body link on iPhone and a standard sms link elsewhere', () => {
  const text = 'Maya: Late? Yes / No. Vote: https://example.com/b/abc';
  expect(smsHref(text, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(
    `sms:&body=${encodeURIComponent(text)}`,
  );
  expect(smsHref(text, 'Mozilla/5.0 (Linux; Android 14)')).toBe(
    `sms:?body=${encodeURIComponent(text)}`,
  );
  expect(isMobileUa('Mozilla/5.0 (iPhone)')).toBe(true);
  expect(isMobileUa('Mozilla/5.0 (Macintosh)')).toBe(false);
});
