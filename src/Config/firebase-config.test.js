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

let info;
let warn;
beforeEach(() => {
  jest.clearAllMocks();
  info = jest.spyOn(console, 'info').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  info.mockRestore();
  warn.mockRestore();
});

const IOS_INFO = 'Firestore: iOS, force long polling';
const DEFAULT_INFO = 'Firestore: default transport';
const IOS_WARN = 'Firestore: iOS settings not applied, using the existing instance';

// Every log is exactly one fixed string: nothing else (no ids, no errors).
function expectOnlyLogs(spy, lines) {
  expect(spy.mock.calls).toEqual(lines.map((line) => [line]));
}

test('iOS native forces long polling', () => {
  const { db, firestore } = load('ios');
  expect(firestore.initializeFirestore).toHaveBeenCalledTimes(1);
  expect(firestore.initializeFirestore).toHaveBeenCalledWith(APP, { experimentalForceLongPolling: true });
  const settings = firestore.initializeFirestore.mock.calls[0][1];
  expect(settings).not.toHaveProperty('useFetchStreams');
  expect(settings).not.toHaveProperty('experimentalAutoDetectLongPolling');
  expect(firestore.getFirestore).not.toHaveBeenCalled();
  expect(db).toBe(IOS_DB);
  expectOnlyLogs(info, [IOS_INFO]);
  expectOnlyLogs(warn, []);
});

test('Android native keeps the default Firestore', () => {
  const { db, firestore } = load('android');
  expect(firestore.getFirestore).toHaveBeenCalledTimes(1);
  expect(firestore.getFirestore).toHaveBeenCalledWith(APP);
  expect(firestore.initializeFirestore).not.toHaveBeenCalled();
  expect(db).toBe(DEFAULT_DB);
  expectOnlyLogs(info, [DEFAULT_INFO]);
  expectOnlyLogs(warn, []);
});

test('web keeps the default Firestore', () => {
  const { db, firestore } = load('web');
  expect(firestore.getFirestore).toHaveBeenCalledTimes(1);
  expect(firestore.getFirestore).toHaveBeenCalledWith(APP);
  expect(firestore.initializeFirestore).not.toHaveBeenCalled();
  expect(db).toBe(DEFAULT_DB);
  expectOnlyLogs(info, [DEFAULT_INFO]);
  expectOnlyLogs(warn, []);
});

test('iOS falls back to the existing Firestore when already initialized, and warns in dev', () => {
  expect(process.env.NODE_ENV).not.toBe('production');
  const { db, firestore } = load('ios', { initThrows: true });
  expect(firestore.initializeFirestore).toHaveBeenCalledTimes(1);
  expect(firestore.getFirestore).toHaveBeenCalledWith(APP);
  expect(db).toBe(DEFAULT_DB);
  expectOnlyLogs(warn, [IOS_WARN]);
  expectOnlyLogs(info, []);
});

describe('in production', () => {
  const env = process.env.NODE_ENV;
  beforeEach(() => { process.env.NODE_ENV = 'production'; });
  afterEach(() => { process.env.NODE_ENV = env; });

  test('nothing is logged, on iOS, its fallback, or web', () => {
    load('ios');
    load('ios', { initThrows: true });
    load('web');
    expectOnlyLogs(info, []);
    expectOnlyLogs(warn, []);
  });
});
