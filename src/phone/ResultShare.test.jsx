import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultShare from './ResultShare';
import { shareMessage } from './share';
import { shareImage } from './imageShare';
import { renderWinnerCard } from './winnerCardImage';
import { buildSettlement } from './settlement';
import { isNativeApp } from '../platform/runtime';
import { Share } from '@capacitor/share';
import { Filesystem } from '@capacitor/filesystem';

// openShareSheet stays real: shareImage's text fallback uses it.
jest.mock('./share', () => ({ ...jest.requireActual('./share'), shareMessage: jest.fn(async () => 'shared') }));
// canShareImageFiles stays real; the native tests run shareImage for real too.
jest.mock('./imageShare', () => ({ ...jest.requireActual('./imageShare'), shareImage: jest.fn(async () => 'shared') }));
jest.mock('../platform/runtime', () => ({ ...jest.requireActual('../platform/runtime'), isNativeApp: jest.fn(() => false) }));
jest.mock('@capacitor/share', () => ({ Share: { share: jest.fn() } }));
jest.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: { writeFile: jest.fn() } }));
const realShareImage = jest.requireActual('./imageShare').shareImage;

const OPTIONS = [{ id: 'a', label: 'Chiefs -3' }, { id: 'b', label: 'Bills +3' }];
const open = {
  id: 'abc123', code: 'abc123', schemaVersion: 2, question: 'Chiefs cover -3?', stake: '$20',
  createdByID: 'jack', status: 'open', options: OPTIONS,
  votes: [{ voterId: 'maya', name: 'Maya', optionId: 'a' }, { voterId: 'zed', name: 'Zed', optionId: 'b' }],
};
const settledBet = { ...open, status: 'closed', winnerId: 'a', settledAt: 1, settlement: buildSettlement(open, 'a') };
const png = new Blob(['png'], { type: 'image/png' });
const withText = { text: expect.stringMatching(/^FRIENDLY · Closed · Maya won\n/) };

beforeEach(() => {
  shareMessage.mockClear();
  shareImage.mockReset();
  shareImage.mockResolvedValue('shared');
  renderWinnerCard.mockReset();
  renderWinnerCard.mockResolvedValue(png);
  isNativeApp.mockReturnValue(false);
});
afterEach(() => {
  delete navigator.share;
  delete navigator.canShare;
  delete window.requestIdleCallback;
  delete window.cancelIdleCallback;
  jest.useRealTimers();
});

const imageButton = () => screen.getByRole('button', { name: 'Share as image' });

test('a settled bet offers Share as image under Share the result, and draws the card once idle', async () => {
  let idle;
  window.requestIdleCallback = jest.fn((work) => { idle = work; return 7; });
  window.cancelIdleCallback = jest.fn();
  const { unmount } = render(<ResultShare bet={settledBet} code="abc123" />);
  expect(screen.getByRole('button', { name: 'Share the result' }).nextElementSibling).toBe(imageButton());
  expect(renderWinnerCard).not.toHaveBeenCalled();
  await act(async () => idle());
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
  expect(renderWinnerCard).toHaveBeenCalledWith(settledBet, null);
  unmount();
  expect(window.cancelIdleCallback).toHaveBeenCalledWith(7);
});

test('the card is drawn for the viewer, and one drawn for another viewer is never shared', async () => {
  let idle;
  window.requestIdleCallback = jest.fn((work) => { idle = work; return 7; });
  window.cancelIdleCallback = jest.fn();
  const forMaya = new Blob(['maya'], { type: 'image/png' });
  const forZed = new Blob(['zed'], { type: 'image/png' });
  renderWinnerCard.mockImplementation(async (_bet, viewerId) => (viewerId === 'maya' ? forMaya : forZed));
  const { rerender } = render(<ResultShare bet={settledBet} code="abc123" voterId="maya" />);
  await act(async () => idle());
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
  expect(renderWinnerCard).toHaveBeenLastCalledWith(settledBet, 'maya');
  // Same card text for both (neither is the creator), but a fresh card.
  rerender(<ResultShare bet={settledBet} code="abc123" voterId="zed" />);
  await userEvent.click(imageButton());
  expect(renderWinnerCard).toHaveBeenCalledTimes(2);
  expect(renderWinnerCard).toHaveBeenLastCalledWith(settledBet, 'zed');
  expect(shareImage).toHaveBeenCalledWith(forZed, withText);
  rerender(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(renderWinnerCard).toHaveBeenLastCalledWith(settledBet, null);
});

test('without requestIdleCallback the card is drawn shortly after, and tapping shares that one', async () => {
  jest.useFakeTimers();
  render(<ResultShare bet={settledBet} code="abc123" />);
  expect(renderWinnerCard).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(200));
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
  await userEvent.click(imageButton());
  expect(shareImage).toHaveBeenCalledWith(png, withText);
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
});

test('a tap before the card is drawn draws it then, and only once', async () => {
  window.requestIdleCallback = jest.fn(() => 1);
  window.cancelIdleCallback = jest.fn();
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
  expect(shareImage).toHaveBeenCalledWith(png, withText);
  const [[idle]] = window.requestIdleCallback.mock.calls;
  idle();
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
});

test.each([
  ['open', open],
  ['called off', { ...settledBet, calledOff: true }],
  ['called off by status', { ...settledBet, status: 'called-off' }],
])('%s: no Share as image, and no card drawn', (_label, bet) => {
  render(<ResultShare bet={bet} code="abc123" />);
  expect(screen.getByRole('button', { name: 'Share the result' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Share as image' })).not.toBeInTheDocument();
  expect(renderWinnerCard).not.toHaveBeenCalled();
});

test('tapping it shares the drawn PNG', async () => {
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(shareImage).toHaveBeenCalledWith(png, withText);
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('The group chat gets the final word.');
  expect(shareMessage).not.toHaveBeenCalled();
});

test.each([
  ['aborted', 'All good. The result’s here when you’re ready.'],
  ['downloaded', 'Image saved. Drop it in the group chat.'],
  ['failed', 'Couldn’t make the image. Share the result instead.'],
])('%s shows its note', async (outcome, note) => {
  shareImage.mockResolvedValue(outcome);
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(screen.getByRole('status')).toHaveTextContent(note);
});

test('a card that could not be drawn hands nothing on, and ends in the failed note', async () => {
  renderWinnerCard.mockRejectedValue(new Error('no canvas'));
  shareImage.mockImplementation(async (blob) => (blob ? 'shared' : 'failed'));
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(shareImage).toHaveBeenCalledWith(null, withText);
  expect(screen.getByRole('status')).toHaveTextContent('Couldn’t make the image. Share the result instead.');
  expect(imageButton()).toBeEnabled();
});

test('a share that throws never reaches the screen as an error', async () => {
  shareImage.mockRejectedValue(new Error('boom'));
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(screen.getByRole('status')).toHaveTextContent('Couldn’t make the image. Share the result instead.');
  expect(imageButton()).toBeEnabled();
});

test('while the image is on its way both buttons wait', async () => {
  let finish;
  shareImage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(screen.getByRole('button', { name: 'Getting it ready…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Share the result' })).toBeDisabled();
  await act(async () => finish('shared'));
  expect(imageButton()).toBeEnabled();
});

test('Share the result still sends the text', async () => {
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(screen.getByRole('button', { name: 'Share the result' }));
  expect(shareMessage).toHaveBeenCalledWith(expect.stringMatching(/^FRIENDLY · Closed · Maya won\n/));
  expect(shareImage).not.toHaveBeenCalled();
});

describe('in the app', () => {
  const CACHE_URI = 'file:///data/user/0/com.friendlybetting.app/cache/friendly-result.png';
  beforeEach(() => {
    isNativeApp.mockReturnValue(true);
    shareImage.mockImplementation(realShareImage);
    Share.share.mockReset();
    Share.share.mockResolvedValue({});
    Filesystem.writeFile.mockReset();
    Filesystem.writeFile.mockResolvedValue({ uri: CACHE_URI });
  });

  test.each([
    ['takes a PNG file', () => { navigator.canShare = jest.fn(() => true); navigator.share = jest.fn(async () => {}); }],
    ['refuses a PNG file', () => { navigator.canShare = jest.fn(() => false); navigator.share = jest.fn(); }],
    ['has no share sheet at all (the Android web view)', () => {}],
    ['throws from canShare', () => { navigator.canShare = jest.fn(() => { throw new TypeError('bad'); }); navigator.share = jest.fn(); }],
  ])('a web view that %s: Share as image shares the PNG from the cache folder through the native sheet', async (_label, setUp) => {
    setUp();
    render(<ResultShare bet={settledBet} code="abc123" />);
    await userEvent.click(imageButton());
    await screen.findByRole('status');
    expect(Filesystem.writeFile).toHaveBeenCalledWith({ path: 'friendly-result.png', data: btoa('png'), directory: 'CACHE' });
    expect(Share.share).toHaveBeenCalledWith({ title: 'FRIENDLY', files: [CACHE_URI], dialogTitle: 'Share as image' });
    expect(navigator.share || jest.fn()).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('The group chat gets the final word.');
  });

  test('the native sheet closed is aborted', async () => {
    Share.share.mockRejectedValue(new Error('Share canceled'));
    render(<ResultShare bet={settledBet} code="abc123" />);
    await userEvent.click(imageButton());
    await screen.findByRole('status');
    expect(Share.share).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('All good. The result’s here when you’re ready.');
  });

  test('a native image share that fails sends the result text instead', async () => {
    Share.share.mockRejectedValueOnce(new Error('No Activity found'));
    render(<ResultShare bet={settledBet} code="abc123" />);
    await userEvent.click(imageButton());
    await screen.findByRole('status');
    expect(Share.share).toHaveBeenCalledTimes(2);
    expect(Share.share.mock.calls[1][0]).toEqual({
      title: 'FRIENDLY', text: expect.stringMatching(/^FRIENDLY · Closed · Maya won\n/), dialogTitle: 'Text the crew',
    });
    expect(shareMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('The group chat gets the final word.');
  });

  test('only when the text share fails too does it say so', async () => {
    Share.share.mockRejectedValue(new Error('No Activity found'));
    render(<ResultShare bet={settledBet} code="abc123" />);
    await userEvent.click(imageButton());
    expect(await screen.findByRole('status')).toHaveTextContent('Couldn’t make the image. Share the result instead.');
    expect(imageButton()).toBeEnabled();
  });
});

describe('on the web, unchanged', () => {
  beforeEach(() => {
    shareImage.mockImplementation(realShareImage);
    URL.createObjectURL = jest.fn(() => 'blob:card');
    URL.revokeObjectURL = jest.fn();
  });

  test('shares the PNG file where the browser can', async () => {
    navigator.canShare = jest.fn(() => true);
    navigator.share = jest.fn(async () => {});
    render(<ResultShare bet={settledBet} code="abc123" />);
    await userEvent.click(imageButton());
    expect(navigator.share.mock.calls[0][0].files[0].name).toBe('friendly-result.png');
    expect(screen.getByRole('status')).toHaveTextContent('The group chat gets the final word.');
  });

  test('downloads the PNG where it cannot share files, or has no canShare at all', async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      navigator.canShare = jest.fn(() => false);
      navigator.share = jest.fn();
      render(<ResultShare bet={settledBet} code="abc123" />);
      await userEvent.click(imageButton());
      expect(navigator.share).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent('Image saved. Drop it in the group chat.');
      delete navigator.canShare;
      await userEvent.click(imageButton());
      expect(click).toHaveBeenCalledTimes(2);
      expect(URL.createObjectURL).toHaveBeenCalledWith(png);
    } finally {
      click.mockRestore();
    }
  });
});
