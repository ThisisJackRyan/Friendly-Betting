import { PHONE_INVALID_ERROR, PHONE_OFFLINE_ERROR } from './creatorSession';

// Every user-visible string for the optional "text me who won" card. The
// SMS it sends uses the settled and called-off templates in closedCopy.js.
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
};
