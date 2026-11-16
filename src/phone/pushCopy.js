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
// only the body changes.
export const PUSH_NOTIFICATION_COPY = Object.freeze({
  // To the creator, once per bet, when under an hour is left before closesAt.
  closingCreator: 'Under an hour left. Nudge anyone who hasn’t picked.',
  // Approved copy for friends in the bet who have not picked, same window.
  // v1 is creator-only and no join tracking is planned, so this body is
  // unused (docs/PUSH.md).
  closingPending: 'Under an hour left to pick a side.',
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
