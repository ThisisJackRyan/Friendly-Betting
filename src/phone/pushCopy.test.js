import { PUSH_COPY } from './pushCopy';

// UX final copy, Nov 16 2026. Written with explicit code points so an
// editor's "smart" or "straight" quotes cannot sneak a drift past this test.
test('every opt-in string is the UX copy, verbatim', () => {
  expect(PUSH_COPY).toEqual({
    sheetTitle: 'Want to know when friends pick?',
    sheetBody: 'We’ll ping you when picks come in and when it’s settled.',
    turnOn: 'Turn on notifications',
    notNow: 'Not now',
    rowLabel: 'Notifications',
    rowHelper: 'Picks, results, and closing reminders.',
    rowHelperOff: 'Turned off in your phone’s settings.',
    openSettings: 'Open Settings',
  });
});

test('curly apostrophes only, no em dashes, no emoji, no money language', () => {
  const all = Object.values(PUSH_COPY).join('\n');
  expect(all).not.toMatch(/'/);
  expect(all).not.toMatch(/\u2014|\u2013/);
  expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(all).not.toMatch(/\$|money|pay|cash|wager|odds/i);
  expect(PUSH_COPY.sheetBody.match(/’/g)).toHaveLength(2);
  expect(PUSH_COPY.rowHelperOff.match(/’/g)).toHaveLength(1);
});

test('the copy is frozen', () => {
  expect(Object.isFrozen(PUSH_COPY)).toBe(true);
});
