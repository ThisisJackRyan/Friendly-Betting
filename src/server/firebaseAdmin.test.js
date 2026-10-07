/** @jest-environment node */
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './firebaseAdmin';

const apps = [];
jest.mock('firebase-admin/app', () => ({
  cert: jest.fn((account) => ({ account })),
  getApps: () => apps,
  getApp: (name) => apps.find((app) => app.name === name),
  initializeApp: jest.fn((options, name) => {
    const app = { name, options };
    apps.push(app);
    return app;
  }),
}));
jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn((app) => ({ auth: app.name })) }));
jest.mock('firebase-admin/firestore', () => ({ getFirestore: jest.fn((app) => ({ db: app.name })) }));

const saved = process.env.FIREBASE_SERVICE_ACCOUNT;
const account = { project_id: 'friendly', client_email: 'a@b.c', private_key: 'k' };

beforeEach(() => {
  apps.length = 0;
  initializeApp.mockClear();
});

afterAll(() => {
  if (saved === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
  else process.env.FIREBASE_SERVICE_ACCOUNT = saved;
});

test('importing does nothing; a missing service account fails clearly on first use', () => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  expect(initializeApp).not.toHaveBeenCalled();
  expect(() => adminDb()).toThrow(expect.objectContaining({ code: 'admin-not-configured' }));
  process.env.FIREBASE_SERVICE_ACCOUNT = 'not json';
  expect(() => adminAuth()).toThrow(expect.objectContaining({ code: 'admin-not-configured' }));
});

test.each([
  ['JSON', JSON.stringify(account)],
  ['base64 JSON', Buffer.from(JSON.stringify(account)).toString('base64')],
])('accepts the service account as %s and initialises once', (_kind, value) => {
  process.env.FIREBASE_SERVICE_ACCOUNT = value;
  expect(adminDb()).toEqual({ db: 'friendly-admin' });
  expect(adminAuth()).toEqual({ auth: 'friendly-admin' });
  expect(initializeApp).toHaveBeenCalledTimes(1);
  expect(cert).toHaveBeenLastCalledWith(account);
  expect(getFirestore).toHaveBeenCalled();
  expect(getAuth).toHaveBeenCalled();
});
