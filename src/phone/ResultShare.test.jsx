import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultShare from './ResultShare';
import { shareMessage } from './share';
import { shareImage } from './imageShare';
import { renderWinnerCard } from './winnerCardImage';
import { buildSettlement } from './settlement';
import { isNativeApp } from '../platform/runtime';

jest.mock('./share', () => ({ shareMessage: jest.fn(async () => 'shared') }));
// canShareImageFiles stays real; the native tests run shareImage for real too.
jest.mock('./imageShare', () => ({ ...jest.requireActual('./imageShare'), shareImage: jest.fn(async () => 'shared') }));
jest.mock('../platform/runtime', () => ({ ...jest.requireActual('../platform/runtime'), isNativeApp: jest.fn(() => false) }));
const realShareImage = jest.requireActual('./imageShare').shareImage;

const OPTIONS = [{ id: 'a', label: 'Chiefs -3' }, { id: 'b', label: 'Bills +3' }];
const open = {
  id: 'abc123', code: 'abc123', schemaVersion: 2, question: 'Chiefs cover -3?', stake: '$20',
  createdByID: 'jack', status: 'open', options: OPTIONS,
  votes: [{ voterId: 'maya', name: 'Maya', optionId: 'a' }, { voterId: 'zed', name: 'Zed', optionId: 'b' }],
};
const settledBet = { ...open, status: 'closed', winnerId: 'a', settledAt: 1, settlement: buildSettlement(open, 'a') };
const png = new Blob(['png'], { type: 'image/png' });

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
  expect(shareImage).toHaveBeenCalledWith(forZed);
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
  expect(shareImage).toHaveBeenCalledWith(png);
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
});

test('a tap before the card is drawn draws it then, and only once', async () => {
  window.requestIdleCallback = jest.fn(() => 1);
  window.cancelIdleCallback = jest.fn();
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
  expect(shareImage).toHaveBeenCalledWith(png);
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
  expect(shareImage).toHaveBeenCalledWith(png);
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
  expect(shareImage).toHaveBeenCalledWith(null);
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
  beforeEach(() => {
    isNativeApp.mockReturnValue(true);
    shareImage.mockImplementation(realShareImage);
  });

  test('with a share sheet that takes a PNG file: Share as image, and a tap shares the file', async () => {
    navigator.canShare = jest.fn(() => true);
    navigator.share = jest.fn(async () => {});
    render(<ResultShare bet={settledBet} code="abc123" />);
    // Asked once, on mount, with a probe PNG since the card is not drawn yet.
    expect(navigator.canShare).toHaveBeenCalledTimes(1);
    expect(navigator.canShare.mock.calls[0][0].files[0].type).toBe('image/png');
    await userEvent.click(imageButton());
    const [{ files }] = navigator.share.mock.calls[0];
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0].name).toBe('friendly-result.png');
    expect(files[0].type).toBe('image/png');
    expect(files[0].size).toBe(png.size);
    expect(screen.getByRole('status')).toHaveTextContent('The group chat gets the final word.');
  });

  test.each([
    ['refuses a PNG file', () => { navigator.canShare = jest.fn(() => false); navigator.share = jest.fn(); }],
    ['has no canShare', () => { navigator.share = jest.fn(); }],
    ['throws from canShare', () => { navigator.canShare = jest.fn(() => { throw new TypeError('bad'); }); navigator.share = jest.fn(); }],
  ])('a share sheet that %s: no Share as image, and no card drawn', async (_label, setUp) => {
    jest.useFakeTimers();
    setUp();
    render(<ResultShare bet={settledBet} code="abc123" />);
    await act(async () => jest.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: 'Share the result' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share as image' })).not.toBeInTheDocument();
    expect(renderWinnerCard).not.toHaveBeenCalled();
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
