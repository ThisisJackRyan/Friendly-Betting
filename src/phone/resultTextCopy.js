import { PHONE_INVALID_ERROR, PHONE_OFFLINE_ERROR } from './creatorSession';

// Every user-visible string for the optional "text me who won" card and SMS.
// SMS templates stay straight-quoted ASCII so they fit one GSM-7 segment.
export const RESULT_TEXT_COPY = {
  heading: 'Want to know who won?',
  placeholder: '(555) 555-0100',
  button: 'Text me',
  saving: 'Saving…',
  skip: 'No thanks',
  confirmed: 'You’re set. We’ll text you who won.',
  privacy: 'One text when it’s settled, then we delete your number.',
  invalid: PHONE_INVALID_ERROR,
  offline: PHONE_OFFLINE_ERROR,
  saveFailed: 'Couldn’t save that number. Try again.',
  sms: {
    won: 'Friendly Bets: "{title}" is settled. {side} won, and you called it. See the final tally: {link}',
    lost: 'Friendly Bets: "{title}" is settled. {side} won. Better luck on the next one. See the final tally: {link}',
    calledOff: 'Friendly Bets: "{title}" was called off, so nobody won this one. {link}',
  },
};
