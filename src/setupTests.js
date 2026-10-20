// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Pro reads go to Firestore. No test talks to Firestore, so every test gets
// a quiet stand-in: no entitlement and no founder count. Tests that need one
// set it on these mocks.
jest.mock('./phone/entitlementApi', () => ({
  subscribeEntitlement: jest.fn(() => () => {}),
  fetchFounderCount: jest.fn(() => new Promise(() => {})),
  requestMockPurchase: jest.fn(async () => ({ ok: true })),
}));
