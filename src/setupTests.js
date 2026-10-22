// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Pro reads go to Firestore. No test talks to Firestore, so every test gets
// a quiet stand-in: no entitlement. Tests that need one set it on these
// mocks.
jest.mock('./phone/entitlementApi', () => ({
  subscribeEntitlement: jest.fn(() => () => {}),
  fetchEntitlement: jest.fn(async () => null),
  requestMockPurchase: jest.fn(async () => ({ ok: true })),
}));

// jsdom has no canvas, so the winner card is never drawn here: the image is
// always still on its way. winnerCardImage.test.js tests the real one.
jest.mock('./phone/winnerCardImage', () => ({
  renderWinnerCard: jest.fn(() => new Promise(() => {})),
}));
