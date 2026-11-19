import { Capacitor, registerPlugin } from '@capacitor/core';
import { auth } from '../Config/firebase-config';
import {
  REQUIRES_RECENT_LOGIN,
  RESUME_KEY,
  clearDeleteAccountResume,
  clearLocalAccountData,
  deleteAccount,
  markDeleteAccountResume,
  takeDeleteAccountResume,
} from './accountApi';

jest.mock('../Config/firebase-config', () => ({ auth: { currentUser: null } }));
jest.mock('./resultTexts', () => ({ apiUrl: (path) => `https://www.friendly-bets.com${path}` }));
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => false), isPluginAvailable: jest.fn(() => false), Plugins: {} },
  registerPlugin: jest.fn(),
}));

const getIdToken = jest.fn();
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let online;

beforeEach(() => {
  getIdToken.mockReset();
  getIdToken.mockResolvedValue('id-token');
  auth.currentUser = { uid: 'me', getIdToken };
  global.fetch = jest.fn(async () => response(200, { deleted: true }));
  online = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
  localStorage.clear();
  sessionStorage.clear();
  Capacitor.isNativePlatform.mockReturnValue(false);
  Capacitor.Plugins = {};
});

afterEach(() => online.mockRestore());

describe('deleteAccount', () => {
  test('sends a freshly minted ID token to DELETE /api/account', async () => {
    await expect(deleteAccount()).resolves.toBeUndefined();
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(fetch).toHaveBeenCalledWith('https://www.friendly-bets.com/api/account', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer id-token' },
    });
  });

  test('a stale sign-in maps to requires-recent-login', async () => {
    fetch.mockResolvedValue(response(401, { error: 'requires-recent-login' }));
    await expect(deleteAccount()).rejects.toMatchObject({ code: REQUIRES_RECENT_LOGIN });
  });

  test('a dropped network, a failed token refresh offline, or an offline browser is offline', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(deleteAccount()).rejects.toMatchObject({ code: 'offline' });
    getIdToken.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/network-request-failed' }));
    await expect(deleteAccount()).rejects.toMatchObject({ code: 'offline' });
    getIdToken.mockResolvedValue('id-token');
    fetch.mockResolvedValue(response(500, { error: 'server' }));
    online.mockReturnValue(false);
    await expect(deleteAccount()).rejects.toMatchObject({ code: 'offline' });
  });

  test('other failures carry the server code', async () => {
    fetch.mockResolvedValue(response(503, { error: 'billing-unavailable' }));
    await expect(deleteAccount()).rejects.toMatchObject({ code: 'billing-unavailable' });
    fetch.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('html'); } });
    await expect(deleteAccount()).rejects.toMatchObject({ code: 'delete-failed' });
  });

  test('an Auth user that is already gone is success: an earlier attempt deleted it', async () => {
    getIdToken.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/user-not-found' }));
    await expect(deleteAccount()).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('an expired or revoked session token stays an error', async () => {
    getIdToken.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/user-token-expired' }));
    await expect(deleteAccount()).rejects.toMatchObject({ code: 'auth/user-token-expired' });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('nobody signed in never calls the server', async () => {
    auth.currentUser = null;
    await expect(deleteAccount()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('the resume note', () => {
  test('is taken once', () => {
    markDeleteAccountResume('me', 1000);
    expect(takeDeleteAccountResume('me', 2000)).toBe(true);
    expect(takeDeleteAccountResume('me', 2000)).toBe(false);
  });

  test('expires after 10 minutes and can be cleared', () => {
    markDeleteAccountResume('me', 0);
    expect(takeDeleteAccountResume('me', 10 * 60 * 1000 + 1)).toBe(false);
    markDeleteAccountResume('me', 0);
    clearDeleteAccountResume();
    expect(takeDeleteAccountResume('me', 1)).toBe(false);
  });

  test('only resumes for the member who left it, and is removed either way', () => {
    markDeleteAccountResume('me', 1000);
    expect(takeDeleteAccountResume('someone-else', 2000)).toBe(false);
    expect(sessionStorage.getItem(RESUME_KEY)).toBeNull();
    expect(takeDeleteAccountResume('me', 2000)).toBe(false);
  });

  test('without a uid nothing is stored or taken', () => {
    markDeleteAccountResume('', 1000);
    expect(sessionStorage.getItem(RESUME_KEY)).toBeNull();
    markDeleteAccountResume('me', 1000);
    expect(takeDeleteAccountResume('', 2000)).toBe(false);
    expect(takeDeleteAccountResume('me', 2000)).toBe(true);
  });

  test('an old or garbled note is ignored', () => {
    sessionStorage.setItem(RESUME_KEY, '1000');
    expect(takeDeleteAccountResume('me', 2000)).toBe(false);
    sessionStorage.setItem(RESUME_KEY, '{not json');
    expect(takeDeleteAccountResume('me', 2000)).toBe(false);
    expect(sessionStorage.getItem(RESUME_KEY)).toBeNull();
  });
});

describe('clearLocalAccountData', () => {
  test('removes this member’s keys and leaves others', async () => {
    const keep = { 'fb.results.someone-else': '{}', 'other.key': '1' };
    const gone = {
      'fb.displayName': 'Jack',
      'fb.localId': 'local',
      'fb.ads.caps.v1': '{}',
      'fb.results.me': '{}',
      'fb.resultText.abc123': 'saved',
      'fb.resultText.xyz789': 'skipped',
    };
    Object.entries({ ...keep, ...gone }).forEach(([key, value]) => localStorage.setItem(key, value));
    ['friendly.freshBet', 'friendly.freshBetFirst', RESUME_KEY, 'friendly.other'].forEach((key) => sessionStorage.setItem(key, 'x'));
    await clearLocalAccountData('me');
    Object.keys(gone).forEach((key) => expect(localStorage.getItem(key)).toBeNull());
    Object.keys(keep).forEach((key) => expect(localStorage.getItem(key)).not.toBeNull());
    ['friendly.freshBet', 'friendly.freshBetFirst', RESUME_KEY].forEach((key) => expect(sessionStorage.getItem(key)).toBeNull());
    expect(sessionStorage.getItem('friendly.other')).toBe('x');
    expect(registerPlugin).not.toHaveBeenCalled();
  });

  test('on a native build with the Preferences plugin, removes the push keys too', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    const remove = jest.fn(async () => {});
    Capacitor.Plugins = { Preferences: { remove } };
    await clearLocalAccountData('me');
    expect(remove.mock.calls.map(([arg]) => arg.key).sort()).toEqual(['fb.pushAsked.me', 'fb.pushDeviceId', 'fb.pushPref.me']);
  });

  test('a native build without the plugin, or a failing plugin, still resolves', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    await expect(clearLocalAccountData('me')).resolves.toBeUndefined();
    Capacitor.Plugins = { Preferences: { remove: jest.fn(() => { throw new Error('UNIMPLEMENTED'); }) } };
    await expect(clearLocalAccountData('me')).resolves.toBeUndefined();
  });
});
