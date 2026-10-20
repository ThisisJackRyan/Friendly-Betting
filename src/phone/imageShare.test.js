import { canShareImageFiles, downloadImage, shareImage } from './imageShare';
import { isNativeApp } from '../platform/runtime';

jest.mock('../platform/runtime', () => ({ isNativeApp: jest.fn(() => false) }));

const png = () => new Blob(['png'], { type: 'image/png' });
const realShare = navigator.share;
const realCanShare = navigator.canShare;

let clicked;
beforeEach(() => {
  isNativeApp.mockReturnValue(false);
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
  await expect(shareImage(png())).resolves.toBe('aborted');
  expect(clicked).toEqual([]);
});

test('a refused share sheet falls back to the download', async () => {
  shareSheet({ share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } });
  await expect(shareImage(png())).resolves.toBe('downloaded');
  expect(clicked).toEqual([{ href: 'blob:card', download: 'friendly-result.png', attached: true }]);
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

test('in the app, the file share sheet is used where the web view has one', async () => {
  isNativeApp.mockReturnValue(true);
  shareSheet();
  await expect(shareImage(png())).resolves.toBe('shared');
});

test('in the app without a file share sheet, it fails: there is no download to fall back on', async () => {
  isNativeApp.mockReturnValue(true);
  shareSheet({ canShare: false });
  await expect(shareImage(png())).resolves.toBe('failed');
  delete navigator.share;
  delete navigator.canShare;
  await expect(shareImage(png())).resolves.toBe('failed');
  expect(clicked).toEqual([]);
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

test('no image, or no way to download it, fails quietly', async () => {
  shareSheet({ canShare: false });
  await expect(shareImage(null)).resolves.toBe('failed');
  URL.createObjectURL = jest.fn(() => { throw new Error('no'); });
  await expect(shareImage(png())).resolves.toBe('failed');
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
