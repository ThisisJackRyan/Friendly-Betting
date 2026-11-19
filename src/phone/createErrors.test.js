import { CREATE_ERROR_COPY, createSaveError } from './createErrors';
import { RUN_IT_BACK_COPY } from './RunItBack';

const EXACT = {
  proRequired: 'Your Pro ended, so Run it back is locked.',
  goPro: 'Go Pro',
  notConfigured: 'Couldn’t check Pro right now. Try again in a bit.',
  tryAgain: 'Try again',
  failed: 'Couldn’t save this bet. Try again.',
};

test('the copy is exactly the final strings: curly apostrophes, no em dashes, no "Could not"', () => {
  expect(CREATE_ERROR_COPY).toEqual(EXACT);
  Object.values(CREATE_ERROR_COPY).forEach((line) => {
    expect(line).not.toMatch(/[—']/);
    expect(line).not.toMatch(/Could not/);
  });
});

test('Run it back shares Create’s fallback', () => {
  expect(RUN_IT_BACK_COPY.failed).toBe(EXACT.failed);
});

test.each([
  ['pro-required', EXACT.proRequired, 'go-pro'],
  ['not-configured', EXACT.notConfigured, 'retry'],
])('%s has its own line and button', (code, message, action) => {
  // The line wins over the error's own message.
  expect(createSaveError({ code, message: EXACT.failed })).toEqual({ message, action });
});

test('anything else: its own message, else the fallback; permission-denied as before', () => {
  expect(createSaveError({})).toEqual({ message: EXACT.failed, action: null });
  expect(createSaveError(undefined)).toEqual({ message: EXACT.failed, action: null });
  expect(createSaveError({ code: 'server', message: EXACT.failed })).toEqual({ message: EXACT.failed, action: null });
  expect(createSaveError(new Error('You’re offline.'))).toEqual({ message: 'You’re offline.', action: null });
  expect(createSaveError({ code: 'permission-denied' }).message).toBe('Saving was blocked. Try again in a moment.');
});

test.each([
  ['offline', 'You are offline.'],
  ['timeout', EXACT.failed],
  ['unavailable', 'Connection failed.'],
  ['deadline-exceeded', 'Request time out'],
  ['firestore/unavailable', 'Connection failed.'],
  ['auth/network-request-failed', 'Firebase: Error (auth/network-request-failed).'],
])('a network failure (%s) shows the fallback, never its own message', (code, message) => {
  expect(createSaveError(Object.assign(new Error(message), { code }))).toEqual({ message: EXACT.failed, action: null });
});
