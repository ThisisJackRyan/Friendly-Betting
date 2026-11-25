const APP = { name: 'test-app' };
const DEFAULT_DB = { kind: 'default-db' };
const IOS_DB = { kind: 'ios-db' };

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => APP),
  getApps: jest.fn(() => []),
  getApp: jest.fn(() => APP),
}));
jest.mock('firebase/analytics', () => ({
  getAnalytics: jest.fn(),
  isSupported: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  initializeAuth: jest.fn(() => ({})),
  indexedDBLocalPersistence: {},
}));
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  initializeFirestore: jest.fn(),
}));
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(), getPlatform: jest.fn() },
}));

function load(platform, { initThrows = false } = {}) {
  let result;
  jest.isolateModules(() => {
    const { Capacitor } = require('@capacitor/core');
    Capacitor.isNativePlatform.mockReturnValue(platform !== 'web');
    Capacitor.getPlatform.mockReturnValue(platform);
    const firestore = require('firebase/firestore');
    firestore.getFirestore.mockReturnValue(DEFAULT_DB);
    firestore.initializeFirestore.mockImplementation(() => {
      if (initThrows) throw new Error('initializeFirestore() has already been called');
      return IOS_DB;
    });
    const { db } = require('./firebase-config');
    result = { db, firestore };
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('iOS native turns off fetch streams', () => {
  const { db, firestore } = load('ios');
  expect(firestore.initializeFirestore).toHaveBeenCalledTimes(1);
  expect(firestore.initializeFirestore).toHaveBeenCalledWith(APP, { useFetchStreams: false });
  expect(firestore.getFirestore).not.toHaveBeenCalled();
  expect(db).toBe(IOS_DB);
});

test('Android native keeps the default Firestore', () => {
  const { db, firestore } = load('android');
  expect(firestore.getFirestore).toHaveBeenCalledWith(APP);
  expect(firestore.initializeFirestore).not.toHaveBeenCalled();
  expect(db).toBe(DEFAULT_DB);
});

test('web keeps the default Firestore', () => {
  const { db, firestore } = load('web');
  expect(firestore.getFirestore).toHaveBeenCalledWith(APP);
  expect(firestore.initializeFirestore).not.toHaveBeenCalled();
  expect(db).toBe(DEFAULT_DB);
});

test('iOS falls back to the existing Firestore when already initialized', () => {
  const { db, firestore } = load('ios', { initThrows: true });
  expect(firestore.initializeFirestore).toHaveBeenCalledTimes(1);
  expect(firestore.getFirestore).toHaveBeenCalledWith(APP);
  expect(db).toBe(DEFAULT_DB);
});
