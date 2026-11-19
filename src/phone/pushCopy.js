// Push copy (UX final, Nov 16 2026). Verbatim, curly apostrophes included;
// the tests assert every string. Shared by the app and the API routes, so
// nothing here imports Capacitor, Firebase or the Admin SDK.

// Opt-in sheet and the Notifications row.
export const PUSH_COPY = Object.freeze({
  sheetTitle: 'Want to know when friends pick?',
  sheetBody: 'We’ll ping you when picks come in and when it’s settled.',
  turnOn: 'Turn on notifications',
  notNow: 'Not now',
  rowLabel: 'Notifications',
  rowHelper: 'Picks, results, and closing reminders.',
  rowHelperOff: 'Turned off in your phone’s settings.',
  openSettings: 'Open Settings',
});

// Notification bodies. Every title is the bet question, so they group by bet;
// only the body changes. The closing-soon bodies land with their send PR.
export const PUSH_NOTIFICATION_COPY = Object.freeze({
  // To the creator, on a friend's first pick. {name} is the voter's cleaned
  // name, {side} the picked option's vote label.
  firstPickNamed: (name, side) => `${name} picked ${side}.`,
  // Same, when the voter left no name.
  firstPickUnnamed: (side) => `A friend picked ${side}.`,
  // To voters, after the undo window. {side} is the winning option's vote label.
  settled: (side) => `${side} won. See who called it.`,
  // To voters with a pick, right away.
  calledOff: 'This bet was called off. Nobody won this one.',
});

// The one Android notification channel (id PUSH_CHANNEL_ID in pushConfig.js).
export const PUSH_CHANNEL_COPY = Object.freeze({
  name: 'Bet updates',
  description: 'Picks, results, and closing reminders on your bets.',
});
