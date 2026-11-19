import { canShareImageFiles, downloadImage, shareImage } from './imageShare';
import { isNativeApp } from '../platform/runtime';
import { Share } from '@capacitor/share';
import { Filesystem } from '@capacitor/filesystem';

jest.mock('../platform/runtime', () => ({ isNativeApp: jest.fn(() => false) }));
jest.mock('@capacitor/share', () => ({ Share: { share: jest.fn() } }));
jest.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: { writeFile: jest.fn() } }));

const CACHE_URI = 'file:///data/user/0/com.friendlybetting.app/cache/friendly-result.png';

const png = () => new Blob(['png'], { type: 'image/png' });
const realShare = navigator.share;
const realCanShare = navigator.canShare;

let clicked;
beforeEach(() => {
  isNativeApp.mockReturnValue(false);
  Share.share.mockReset();
  Share.share.mockResolvedValue({});
  Filesystem.writeFile.mockReset();
  Filesystem.writeFile.mockResolvedValue({ uri: CACHE_URI });
  clicked = [];
  URL.createObjectURL = jest.fn(() => 'blob:card');
  URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    clicked.push({ href: this.href, download: this.download, attached: document.body.contains(this) });
  });
});
afterEach(() => {
  navigator.share = realShare;
  navigator.canShare = realCanShare;
  jest.restoreAllMocks();
});

function shareSheet({ canShare = true, share = async () => {} } = {}) {
  navigator.canShare = jest.fn(() => canShare);
  navigator.share = jest.fn(share);
}

test('shares the PNG as a file when the browser can share files', async () => {
  shareSheet();
  await expect(shareImage(png())).resolves.toBe('shared');
  const [{ files, title }] = navigator.share.mock.calls[0];
  expect(title).toBe('FRIENDLY');
  expect(files).toHaveLength(1);
  expect(files[0]).toBeInstanceOf(File);
  expect(files[0].name).toBe('friendly-result.png');
  expect(files[0].type).toBe('image/png');
  expect(navigator.canShare).toHaveBeenCalledWith({ files: [files[0]] });
  expect(clicked).toEqual([]);
});

test('a dismissed share sheet is aborted, with no download after it', async () => {
  shareSheet({ share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } });
  await expect(shareImage(png(), { text: 'Maya won' })).resolves.toBe('aborted');
  expect(clicked).toEqual([]);
  expect(navigator.share).toHaveBeenCalledTimes(1);
});

test('a refused share sheet falls back to the download', async () => {
  shareSheet({ share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } });
  await expect(shareImage(png(), { text: 'Maya won' })).resolves.toBe('downloaded');
  expect(clicked).toEqual([{ href: 'blob:card', download: 'friendly-result.png', attached: true }]);
  expect(navigator.share).toHaveBeenCalledTimes(1);
});

test('a browser that cannot share files downloads the PNG', async () => {
  shareSheet({ canShare: false });
  await expect(shareImage(png())).resolves.toBe('downloaded');
  expect(navigator.share).not.toHaveBeenCalled();
  expect(clicked).toHaveLength(1);
  expect(document.querySelector('a[download]')).toBeNull();
});

test('no share sheet at all downloads the PNG and frees the URL later', async () => {
  jest.useFakeTimers();
  try {
    delete navigator.share;
    delete navigator.canShare;
    await expect(shareImage(png())).resolves.toBe('downloaded');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:card');
  } finally {
    jest.useRealTimers();
  }
});

describe('in the app', () => {
  const MESSAGE = 'FRIENDLY · Closed · Maya won';
  beforeEach(() => isNativeApp.mockReturnValue(true));

  test('writes the PNG to the cache folder and shares its file:// URI through the native sheet', async () => {
    await expect(shareImage(new Blob(['png'], { type: 'image/png' }), { text: MESSAGE })).resolves.toBe('shared');
    expect(Filesystem.writeFile).toHaveBeenCalledWith({ path: 'friendly-result.png', data: btoa('png'), directory: 'CACHE' });
    expect(Share.share).toHaveBeenCalledTimes(1);
    expect(Share.share).toHaveBeenCalledWith({ title: 'FRIENDLY', files: [CACHE_URI], dialogTitle: 'Share as image' });
    expect(clicked).toEqual([]);
  });

  test('uses the native sheet even where the web view can share files itself', async () => {
    shareSheet();
    await expect(shareImage(png())).resolves.toBe('shared');
    expect(navigator.share).not.toHaveBeenCalled();
    expect(Share.share.mock.calls[0][0].files).toEqual([CACHE_URI]);
  });

  test.each(['Share canceled', 'User dismissed the sheet', 'aborted'])('%s is aborted, with nothing after it', async (message) => {
    Share.share.mockRejectedValue(new Error(message));
    await expect(shareImage(png(), { text: MESSAGE })).resolves.toBe('aborted');
    expect(Share.share).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([]);
  });

  test.each([
    ['the share fails', () => Share.share.mockRejectedValueOnce(new Error('Activity not found'))],
    ['the cache write fails', () => Filesystem.writeFile.mockRejectedValue(new Error('disk full'))],
  ])('when %s, the result text goes through the share sheet instead, never a download', async (_label, setUp) => {
    setUp();
    await expect(shareImage(png(), { text: MESSAGE })).resolves.toBe('shared');
    const textShare = Share.share.mock.calls.at(-1)[0];
    expect(textShare).toEqual({ title: 'FRIENDLY', text: MESSAGE, dialogTitle: 'Text the crew' });
    expect(textShare.files).toBeUndefined();
    expect(clicked).toEqual([]);
  });

  test('the text share cancelled after a failed image share is aborted', async () => {
    Share.share.mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new Error('Share canceled'));
    await expect(shareImage(png(), { text: MESSAGE })).resolves.toBe('aborted');
  });

  test('fails only once the text share has failed too, or there is no text', async () => {
    Share.share.mockRejectedValue(new Error('boom'));
    await expect(shareImage(png(), { text: MESSAGE })).resolves.toBe('failed');
    await expect(shareImage(png())).resolves.toBe('failed');
    await expect(shareImage(null, { text: MESSAGE })).resolves.toBe('failed');
    expect(clicked).toEqual([]);
  });
});

describe('canShareImageFiles', () => {
  const asked = () => navigator.canShare.mock.calls[0][0].files[0];

  test('asks with a probe PNG file when there is no card yet', () => {
    shareSheet();
    expect(canShareImageFiles()).toBe(true);
    expect(asked()).toBeInstanceOf(File);
    expect(asked().type).toBe('image/png');
    expect(asked().name).toBe('friendly-result.png');
    expect(asked().size).toBeGreaterThan(0);
  });

  test('asks with the card when there is one', () => {
    shareSheet({ canShare: false });
    expect(canShareImageFiles(png())).toBe(false);
    expect(asked().size).toBe(3);
  });

  test('false without canShare, share or File, and when canShare throws', () => {
    delete navigator.canShare;
    navigator.share = jest.fn();
    expect(canShareImageFiles()).toBe(false);
    shareSheet();
    delete navigator.share;
    expect(canShareImageFiles()).toBe(false);
    shareSheet();
    const RealFile = global.File;
    try {
      delete global.File;
      expect(canShareImageFiles()).toBe(false);
    } finally {
      global.File = RealFile;
    }
    navigator.canShare = jest.fn(() => { throw new TypeError('bad'); });
    expect(canShareImageFiles()).toBe(false);
  });
});

test('no image, or no way to download it and no text, fails quietly', async () => {
  shareSheet({ canShare: false });
  await expect(shareImage(null)).resolves.toBe('failed');
  URL.createObjectURL = jest.fn(() => { throw new Error('no'); });
  await expect(shareImage(png())).resolves.toBe('failed');
  expect(navigator.share).not.toHaveBeenCalled();
});

test('a refused file share with no download sends the result text through the share sheet', async () => {
  shareSheet({ share: async ({ files }) => { if (files) throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } });
  URL.createObjectURL = jest.fn(() => { throw new Error('no'); });
  await expect(shareImage(png(), { text: 'Maya won' })).resolves.toBe('shared');
  expect(navigator.share).toHaveBeenCalledTimes(2);
  expect(navigator.share).toHaveBeenLastCalledWith({ text: 'Maya won' });
  expect(Share.share).not.toHaveBeenCalled();
});

test('on the web, the text fallback dismissed is aborted, and with no sheet at all it fails', async () => {
  URL.createObjectURL = jest.fn(() => { throw new Error('no'); });
  shareSheet({ canShare: false, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } });
  await expect(shareImage(png(), { text: 'Maya won' })).resolves.toBe('aborted');
  delete navigator.share;
  delete navigator.canShare;
  await expect(shareImage(png(), { text: 'Maya won' })).resolves.toBe('failed');
});

test('canShare throwing is not fatal', async () => {
  navigator.canShare = jest.fn(() => { throw new TypeError('bad'); });
  navigator.share = jest.fn();
  await expect(shareImage(png())).resolves.toBe('downloaded');
});

test('downloadImage reports false without object URLs', () => {
  delete URL.createObjectURL;
  expect(downloadImage(png())).toBe(false);
});
