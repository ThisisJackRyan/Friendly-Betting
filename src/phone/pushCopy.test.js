import { PUSH_CHANNEL_COPY, PUSH_COPY, PUSH_NOTIFICATION_COPY } from './pushCopy';

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

test('settle and call-off bodies are the UX copy, verbatim', () => {
  expect(PUSH_NOTIFICATION_COPY.settled('Over')).toBe('Over won. See who called it.');
  expect(PUSH_NOTIFICATION_COPY.settled('Jack’s team')).toBe('Jack’s team won. See who called it.');
  expect(PUSH_NOTIFICATION_COPY.calledOff).toBe('This bet was called off. Nobody won this one.');
});

test('first-pick bodies are the UX copy, verbatim', () => {
  expect(PUSH_NOTIFICATION_COPY.firstPickNamed('Sam', 'Over')).toBe('Sam picked Over.');
  expect(PUSH_NOTIFICATION_COPY.firstPickNamed('Jack\u2019s mom', 'Over 7.5')).toBe('Jack\u2019s mom picked Over 7.5.');
  expect(PUSH_NOTIFICATION_COPY.firstPickUnnamed('Under')).toBe('A friend picked Under.');
  expect(PUSH_NOTIFICATION_COPY.firstPickUnnamed('Jack\u2019s team')).toBe('A friend picked Jack\u2019s team.');
});

test('the Android channel name and description are the UX copy, verbatim', () => {
  expect(PUSH_CHANNEL_COPY).toEqual({
    name: 'Bet updates',
    description: 'Picks, results, and closing reminders on your bets.',
  });
});

test('notification and channel copy: no em dashes, emoji, placeholders or money language', () => {
  const all = [
    PUSH_NOTIFICATION_COPY.settled('Over'),
    PUSH_NOTIFICATION_COPY.calledOff,
    PUSH_NOTIFICATION_COPY.firstPickNamed('Sam', 'Over'),
    PUSH_NOTIFICATION_COPY.firstPickUnnamed('Over'),
    ...Object.values(PUSH_CHANNEL_COPY),
  ].join('\n');
  expect(all).not.toMatch(/'/);
  expect(all).not.toMatch(/\u2014|\u2013/);
  expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(all).not.toMatch(/\$|money|pay|cash|wager|odds/i);
  expect(all).not.toMatch(/TODO|\{|\}/);
  expect(Object.isFrozen(PUSH_NOTIFICATION_COPY)).toBe(true);
  expect(Object.isFrozen(PUSH_CHANNEL_COPY)).toBe(true);
});
