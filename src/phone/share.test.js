import { hasShareSheet, isMobileUa, openShareSheet, smsHref, shareMessage } from './share';
import { isNativeApp } from '../platform/runtime';
import { Share } from '@capacitor/share';

jest.mock('../platform/runtime', () => ({ isNativeApp: jest.fn(() => false) }));
jest.mock('@capacitor/share', () => ({ Share: { share: jest.fn() } }));

test('builds an iMessage body link on iPhone and a standard sms link elsewhere', () => {
  const text = 'Maya: Late? Yes / No. Vote: https://example.com/b/abc';
  expect(smsHref(text, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(
    `sms:&body=${encodeURIComponent(text)}`,
  );
  expect(smsHref(text, 'Mozilla/5.0 (Linux; Android 14)')).toBe(
    `sms:?body=${encodeURIComponent(text)}`,
  );
  expect(isMobileUa('Mozilla/5.0 (iPhone)')).toBe(true);
  expect(isMobileUa('Mozilla/5.0 (Macintosh)')).toBe(false);
});

test('native share uses the platform sheet and keeps winner/stake copy intact', async () => {
  isNativeApp.mockReturnValue(true);
  Share.share.mockResolvedValue({});
  const text = 'FRIENDLY · Closed · Jack won the $20 pot';
  await expect(shareMessage(text)).resolves.toBe('shared');
  expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ text, title: 'FRIENDLY' }));
});

test('dismissing native sharing does not open an SMS composer', async () => {
  isNativeApp.mockReturnValue(true);
  Share.share.mockRejectedValue(new Error('Share canceled'));
  await expect(shareMessage('result')).resolves.toBe('aborted');
});

test('a failed native sheet offers manual copying', async () => {
  isNativeApp.mockReturnValue(true);
  Share.share.mockRejectedValue(new Error('Unavailable'));
  await expect(shareMessage('result')).resolves.toBe('manual');
});

describe('the share sheet alone', () => {
  afterEach(() => {
    isNativeApp.mockReturnValue(false);
    delete navigator.share;
  });

  test('is there in the app and with navigator.share, and nowhere else', () => {
    isNativeApp.mockReturnValue(false);
    expect(hasShareSheet()).toBe(false);
    navigator.share = jest.fn();
    expect(hasShareSheet()).toBe(true);
    delete navigator.share;
    isNativeApp.mockReturnValue(true);
    expect(hasShareSheet()).toBe(true);
  });

  test('a refused or failed sheet falls back to nothing, not Messages or the clipboard', async () => {
    isNativeApp.mockReturnValue(false);
    const writeText = jest.fn();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    navigator.share = jest.fn(async () => {
      throw Object.assign(new Error('No gesture'), { name: 'NotAllowedError' });
    });
    await expect(openShareSheet('invite')).resolves.toBe('');
    expect(writeText).not.toHaveBeenCalled();
    delete navigator.share;
    await expect(openShareSheet('invite')).resolves.toBe('');
    isNativeApp.mockReturnValue(true);
    Share.share.mockRejectedValue(new Error('Unavailable'));
    await expect(openShareSheet('invite')).resolves.toBe('');
    delete navigator.clipboard;
  });

  test('a sheet that opens reports shared or dismissed', async () => {
    isNativeApp.mockReturnValue(false);
    navigator.share = jest.fn(async () => {});
    await expect(openShareSheet('invite')).resolves.toBe('shared');
    expect(navigator.share).toHaveBeenCalledWith({ text: 'invite' });
    navigator.share = jest.fn(async () => {
      throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    });
    await expect(openShareSheet('invite')).resolves.toBe('aborted');
  });
});

describe('with no share sheet, or one the browser refuses', () => {
  const ua = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');
  const setUa = (value) => Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value });
  let assigned;
  const location = window.location;

  beforeEach(() => {
    isNativeApp.mockReturnValue(false);
    assigned = '';
    delete window.location;
    window.location = { set href(value) { assigned = value; }, get href() { return assigned; } };
  });

  afterEach(() => {
    window.location = location;
    if (ua) Object.defineProperty(window.navigator, 'userAgent', ua);
    else delete window.navigator.userAgent;
    delete navigator.share;
    delete navigator.clipboard;
  });

  test('a phone browser opens Messages with the whole invite', async () => {
    setUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    navigator.share = jest.fn(async () => {
      throw Object.assign(new Error('No gesture'), { name: 'NotAllowedError' });
    });
    await expect(shareMessage('invite text')).resolves.toBe('sms');
    expect(assigned).toBe(`sms:&body=${encodeURIComponent('invite text')}`);
  });

  test('a desktop browser copies the whole invite', async () => {
    setUa('Mozilla/5.0 (Macintosh)');
    const writeText = jest.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await expect(shareMessage('invite text')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('invite text');
    expect(assigned).toBe('');
  });

  test('a refused or missing clipboard falls back to manual copying', async () => {
    setUa('Mozilla/5.0 (Macintosh)');
    const writeText = jest.fn(async () => {
      throw new Error('Denied');
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await expect(shareMessage('invite text')).resolves.toBe('manual');
    delete navigator.clipboard;
    await expect(shareMessage('invite text')).resolves.toBe('manual');
    expect(assigned).toBe('');
  });
});
