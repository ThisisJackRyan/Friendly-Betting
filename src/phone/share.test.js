import { isMobileUa, smsHref, shareMessage } from './share';
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
