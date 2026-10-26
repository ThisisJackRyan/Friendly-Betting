import { act, renderHook } from '@testing-library/react';
import { canShowInterstitial, showInterstitial } from './adService';
import { useInviteShare } from './useInviteShare';

jest.mock('./adService', () => ({
  canShowInterstitial: jest.fn(() => true),
  showInterstitial: jest.fn(),
}));

beforeEach(() => {
  canShowInterstitial.mockReset().mockReturnValue(true);
  showInterstitial.mockReset();
});

test.each(['timeout', 'not-loaded'])('a %s skip that lands after unmount never opens the share', async (reason) => {
  let resolveAd;
  showInterstitial.mockImplementation(() => new Promise((resolve) => { resolveAd = resolve; }));
  const open = jest.fn(() => 'shared');
  const { result, unmount } = renderHook(() => useInviteShare());
  let done;
  act(() => { done = result.current.share(open); });
  unmount();
  await act(async () => { resolveAd({ shown: false, skipped: true, reason }); });
  await expect(done).resolves.toBeNull();
  expect(open).not.toHaveBeenCalled();
});

test('a throwing ad service after unmount never opens the share', async () => {
  let rejectAd;
  showInterstitial.mockImplementation(() => new Promise((_resolve, reject) => { rejectAd = reject; }));
  const open = jest.fn(() => 'shared');
  const { result, unmount } = renderHook(() => useInviteShare());
  let done;
  act(() => { done = result.current.share(open); });
  unmount();
  await act(async () => { rejectAd(new Error('boom')); });
  await expect(done).resolves.toBeNull();
  expect(open).not.toHaveBeenCalled();
});

test('while mounted, a skip still opens the share', async () => {
  showInterstitial.mockResolvedValue({ shown: false, skipped: true, reason: 'timeout' });
  const open = jest.fn(() => 'shared');
  const { result } = renderHook(() => useInviteShare());
  let done;
  act(() => { done = result.current.share(open); });
  await act(async () => {});
  await expect(done).resolves.toBe('shared');
  expect(open).toHaveBeenCalledTimes(1);
});

test('a continue from a stale thank-you after unmount never opens the share', async () => {
  showInterstitial.mockResolvedValue({ shown: true, skipped: false, reason: 'shown' });
  const open = jest.fn(() => 'shared');
  const { result, unmount } = renderHook(() => useInviteShare());
  let done;
  act(() => { done = result.current.share(open); });
  await act(async () => {});
  const { onContinue } = result.current.thanks.props;
  unmount();
  onContinue();
  await expect(done).resolves.toBeNull();
  expect(open).not.toHaveBeenCalled();
});
