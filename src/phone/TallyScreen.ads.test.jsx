import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import TallyScreen from './TallyScreen';
import { hasShareSheet, openShareSheet, shareMessage } from './share';
import { markFreshBet } from './freshBet';
import { formatInvite } from './inviteCopy';
import { isNativeApp, PROD_ORIGIN } from '../platform/runtime';
import { canShowInterstitial, showInterstitial } from '../ads/adService';
import { AD_THANKS_LINE } from '../ads/AdThanks';
import { navigation } from 'next/navigation';

// The ad gate in front of every invite share on the tally. The ad service is
// mocked here (src/ads/inviteGate.test.js runs the gate on the real one).
jest.mock('next/navigation');
jest.mock('next/link');

const mockAuth = { currentUser: null, listener: null };

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, onChange) => {
    mockAuth.listener = onChange;
    return () => {
      mockAuth.listener = null;
    };
  }),
  signInAnonymously: jest.fn(async () => ({ user: mockAuth.currentUser })),
}));

jest.mock('../Config/firebase-config', () => ({
  get auth() {
    return mockAuth;
  },
  db: {},
}));

const openBet = {
  id: 'abc123',
  code: 'abc123',
  schemaVersion: 2,
  type: 'money-line',
  typeLabel: 'Money Line',
  question: 'Who is late',
  stake: '$5',
  createdByName: 'Maya',
  createdByID: 'creator-1',
  status: 'open',
  winnerId: null,
  options: [
    { id: 'a', label: 'Yes' },
    { id: 'b', label: 'No' },
  ],
  votes: [],
};

jest.mock('./api', () => ({
  subscribeBet: jest.fn((_code, onChange) => {
    onChange(openBet);
    return () => {};
  }),
  hydrateBet: async (bet) => bet,
  settleBet: jest.fn(async () => {}),
}));

// Each share records whether it ran inside a click, the way navigator.share
// needs it to on the web.
const mockInClick = () => window.event?.type === 'click';
jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'copied'),
  hasShareSheet: jest.fn(() => true),
  openShareSheet: jest.fn(async () => 'aborted'),
}));

jest.mock('../platform/runtime', () => ({
  ...jest.requireActual('../platform/runtime'),
  isNativeApp: jest.fn(() => false),
}));

jest.mock('../ads/adService', () => ({
  canShowInterstitial: jest.fn(() => true),
  showInterstitial: jest.fn(),
}));

const creator = { uid: 'creator-1', phoneNumber: '+15551234567', providerData: [{ providerId: 'phone' }] };
const shownResult = { shown: true, skipped: false, reason: 'shown' };
const skippedResult = (reason) => ({ shown: false, skipped: true, reason });
const inviteFor = (origin) => formatInvite({ title: 'Who is late', stake: '$5', url: `${origin}/b/abc123` });
const invite = inviteFor('http://localhost');
const thanks = () => screen.queryByRole('dialog', { name: AD_THANKS_LINE });
// The tally's own button, not the one on the thank-you.
const inviteButton = () => within(document.querySelector('.tally-share')).getByRole('button', { name: 'Text the crew' });
const shareCalls = [];

function setNavigatorShare(value) {
  Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value });
}

beforeEach(() => {
  mockAuth.currentUser = creator;
  navigation.pathname = '/t/abc123';
  navigation.params = { code: 'abc123' };
  window.sessionStorage.clear();
  shareCalls.length = 0;
  shareMessage.mockReset().mockImplementation(async (text) => {
    shareCalls.push({ kind: 'message', text, inClick: mockInClick() });
    return 'copied';
  });
  openShareSheet.mockReset().mockImplementation(async (text) => {
    shareCalls.push({ kind: 'sheet', text, inClick: mockInClick() });
    return 'aborted';
  });
  hasShareSheet.mockReset().mockReturnValue(true);
  isNativeApp.mockReset().mockReturnValue(false);
  canShowInterstitial.mockReset().mockReturnValue(true);
  showInterstitial.mockReset().mockResolvedValue(shownResult);
  setNavigatorShare(undefined);
});

afterEach(async () => {
  // Let the last share's result land inside act.
  await act(async () => {});
  jest.useRealTimers();
  setNavigatorShare(undefined);
});

async function renderTally() {
  jest.useFakeTimers();
  try {
    render(
      <div className="phone">
        <TallyScreen />
      </div>,
    );
    act(() => {
      jest.advanceTimersByTime(450);
    });
  } finally {
    jest.useRealTimers();
  }
  await act(async () => {
    mockAuth.listener?.(creator);
  });
}

// A click, with whatever it starts settled inside act.
const tap = (element) => act(async () => { fireEvent.click(element); });

// Lets the awaited ad resolve and React render what follows.
const settle = () => act(async () => {});

describe('Text the crew', () => {
  test('focus stays on the thank-you\'s button, then returns to Text the crew once the share is done', async () => {
    let finishShare;
    shareMessage.mockImplementation((text) => new Promise((resolve) => {
      shareCalls.push({ kind: 'message', text, inClick: mockInClick() });
      finishShare = () => resolve('copied');
    }));
    await renderTally();
    await tap(inviteButton());
    await settle();
    const thanksButton = within(thanks()).getByRole('button', { name: 'Text the crew' });
    expect(thanksButton).toHaveFocus();
    // Focus can't wander behind the layer while it is up.
    act(() => { inviteButton().focus(); });
    expect(thanksButton).toHaveFocus();
    await tap(thanksButton);
    expect(thanks()).not.toBeInTheDocument();
    // Sharing: the button is still disabled, so focus waits for it.
    expect(inviteButton()).toBeDisabled();
    await act(async () => { finishShare(); });
    expect(inviteButton()).toBeEnabled();
    expect(inviteButton()).toHaveFocus();
  });

  test('with the paywall on, the thank-you carries Go Pro and focus still returns to Text the crew', async () => {
    const flag = process.env.NEXT_PUBLIC_PRO_PAYWALL;
    process.env.NEXT_PUBLIC_PRO_PAYWALL = '1';
    try {
      let finishShare;
      shareMessage.mockImplementation((text) => new Promise((resolve) => {
        shareCalls.push({ kind: 'message', text, inClick: mockInClick() });
        finishShare = () => resolve('copied');
      }));
      await renderTally();
      // Not on the tally itself.
      expect(screen.queryByRole('link', { name: 'Go Pro' })).toBeNull();
      await tap(inviteButton());
      await settle();
      expect(within(thanks()).getByRole('link', { name: 'Go Pro' })).toHaveAttribute('href', '/pro');
      const thanksButton = within(thanks()).getByRole('button', { name: 'Text the crew' });
      expect(thanksButton).toHaveFocus();
      await tap(thanksButton);
      expect(thanks()).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Go Pro' })).toBeNull();
      await act(async () => { finishShare(); });
      expect(inviteButton()).toHaveFocus();
    } finally {
      if (flag === undefined) delete process.env.NEXT_PUBLIC_PRO_PAYWALL;
      else process.env.NEXT_PUBLIC_PRO_PAYWALL = flag;
    }
  });

  test('focus the user moved elsewhere while the share was open stays there, and the return does not scroll', async () => {
    let finishShare;
    shareMessage.mockImplementation(() => new Promise((resolve) => {
      finishShare = () => resolve('copied');
    }));
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    const focus = jest.spyOn(HTMLElement.prototype, 'focus');
    try {
      await renderTally();
      await tap(inviteButton());
      await settle();
      await tap(within(thanks()).getByRole('button', { name: 'Text the crew' }));
      expect(thanks()).not.toBeInTheDocument();
      act(() => { elsewhere.focus(); });
      focus.mockClear();
      await act(async () => { finishShare(); });
      expect(inviteButton()).toBeEnabled();
      expect(elsewhere).toHaveFocus();
      expect(focus.mock.contexts).not.toContain(inviteButton());
    } finally {
      focus.mockRestore();
      elsewhere.remove();
    }
  });

  test('the return to Text the crew does not scroll the screen', async () => {
    let finishShare;
    shareMessage.mockImplementation(() => new Promise((resolve) => {
      finishShare = () => resolve('copied');
    }));
    const focus = jest.spyOn(HTMLElement.prototype, 'focus');
    try {
      await renderTally();
      await tap(inviteButton());
      await settle();
      await tap(within(thanks()).getByRole('button', { name: 'Text the crew' }));
      focus.mockClear();
      await act(async () => { finishShare(); });
      expect(inviteButton()).toHaveFocus();
      const i = focus.mock.contexts.indexOf(inviteButton());
      expect(focus.mock.calls[i]).toEqual([{ preventScroll: true }]);
    } finally {
      focus.mockRestore();
    }
  });

  test('with no ad shown, Text the crew does not pull focus after the share', async () => {
    showInterstitial.mockResolvedValue({ shown: false, skipped: true, reason: 'capped' });
    await renderTally();
    await tap(inviteButton());
    await settle();
    expect(shareMessage).toHaveBeenCalledTimes(1);
    expect(inviteButton()).not.toHaveFocus();
  });

  test('an ad shown: the thank-you, then the share with the invite text (web, no share sheet: waits for a tap)', async () => {
    await renderTally();
    jest.useFakeTimers();
    await tap(inviteButton());
    expect(showInterstitial).toHaveBeenCalledWith({ placement: 'invite' });
    await settle();
    expect(thanks()).toBeInTheDocument();
    expect(screen.getByText('Thanks for watching. That keeps Friendly free.')).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(shareMessage).not.toHaveBeenCalled();
    expect(thanks()).toBeInTheDocument();
    await tap(within(thanks()).getByRole('button', { name: 'Text the crew' }));
    expect(shareCalls).toEqual([{ kind: 'message', text: invite, inClick: true }]);
    expect(thanks()).not.toBeInTheDocument();
    await settle();
    expect(screen.getByText('Copied. Paste it into a text.')).toBeInTheDocument();
    expect(inviteButton()).toBeEnabled();
  });

  test('web with navigator.share: the thank-you waits for a tap and shares inside that click', async () => {
    setNavigatorShare(jest.fn());
    await renderTally();
    jest.useFakeTimers();
    await tap(inviteButton());
    await settle();
    expect(thanks()).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(shareMessage).not.toHaveBeenCalled();
    expect(thanks()).toBeInTheDocument();
    // The thank-you's button reuses the existing label: no new copy.
    await tap(within(thanks()).getByRole('button', { name: 'Text the crew' }));
    expect(shareCalls).toEqual([{ kind: 'message', text: invite, inClick: true }]);
    expect(thanks()).not.toBeInTheDocument();
  });

  test('a tap anywhere on the thank-you continues', async () => {
    setNavigatorShare(jest.fn());
    await renderTally();
    await tap(inviteButton());
    await settle();
    await tap(screen.getByText(AD_THANKS_LINE));
    expect(shareCalls).toEqual([{ kind: 'message', text: invite, inClick: true }]);
  });

  test('native: the thank-you continues by itself after 1.5 s, then the share', async () => {
    isNativeApp.mockReturnValue(true);
    setNavigatorShare(jest.fn());
    await renderTally();
    jest.useFakeTimers();
    await tap(inviteButton());
    await settle();
    expect(thanks()).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(shareMessage).toHaveBeenCalledWith(inviteFor(PROD_ORIGIN));
    expect(thanks()).not.toBeInTheDocument();
  });

  test.each(['disabled', 'pro', 'capped', 'interval', 'busy', 'timeout', 'error', 'not-loaded'])(
    'an ad skipped as %s shares directly, with no thank-you',
    async (reason) => {
      showInterstitial.mockResolvedValue(skippedResult(reason));
      await renderTally();
      await tap(inviteButton());
      await settle();
      expect(thanks()).not.toBeInTheDocument();
      expect(shareMessage).toHaveBeenCalledTimes(1);
      expect(shareMessage).toHaveBeenCalledWith(invite);
    },
  );

  test('nothing to try (disabled, Pro, capped): no ad call, and the share runs inside the click', async () => {
    canShowInterstitial.mockReturnValue(false);
    await renderTally();
    await tap(inviteButton());
    expect(canShowInterstitial).toHaveBeenCalledWith('invite');
    expect(showInterstitial).not.toHaveBeenCalled();
    expect(shareCalls).toEqual([{ kind: 'message', text: invite, inClick: true }]);
    await settle();
    expect(thanks()).not.toBeInTheDocument();
  });

  test('a throwing ad service never blocks the invite', async () => {
    showInterstitial.mockRejectedValue(new Error('boom'));
    await renderTally();
    await tap(inviteButton());
    await settle();
    expect(shareMessage).toHaveBeenCalledWith(invite);

    cleanup();
    shareMessage.mockClear();
    canShowInterstitial.mockImplementation(() => { throw new Error('boom'); });
    await renderTally();
    await tap(inviteButton());
    expect(shareMessage).toHaveBeenCalledWith(invite);
  });

  test('the button stays disabled while the ad and thank-you are up', async () => {
    let close;
    showInterstitial.mockImplementation(() => new Promise((resolve) => { close = resolve; }));
    setNavigatorShare(jest.fn());
    await renderTally();
    await tap(inviteButton());
    expect(inviteButton()).toBeDisabled();
    await tap(inviteButton());
    expect(showInterstitial).toHaveBeenCalledTimes(1);
    await act(async () => { close(shownResult); });
    expect(inviteButton()).toBeDisabled();
    await tap(within(thanks()).getByRole('button', { name: 'Text the crew' }));
    await settle();
    expect(inviteButton()).toBeEnabled();
    expect(shareMessage).toHaveBeenCalledTimes(1);
  });

  test('leaving the tally during the ad never shares', async () => {
    let close;
    showInterstitial.mockImplementation(() => new Promise((resolve) => { close = resolve; }));
    await renderTally();
    await tap(inviteButton());
    cleanup();
    await act(async () => { close(shownResult); });
    expect(shareMessage).not.toHaveBeenCalled();
    expect(thanks()).not.toBeInTheDocument();
  });
});

describe('the auto-open right after Create', () => {
  test('goes through the gate: ad, thank-you, then only the share sheet', async () => {
    let close;
    showInterstitial.mockImplementation(() => new Promise((resolve) => { close = resolve; }));
    markFreshBet('abc123');
    await renderTally();
    expect(showInterstitial).toHaveBeenCalledWith({ placement: 'invite' });
    jest.useFakeTimers();
    await act(async () => { close(shownResult); });
    expect(thanks()).toBeInTheDocument();
    expect(openShareSheet).not.toHaveBeenCalled();
    // The web waits for a tap, with or without navigator.share.
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(openShareSheet).not.toHaveBeenCalled();
    await tap(within(thanks()).getByRole('button', { name: 'Text the crew' }));
    expect(openShareSheet).toHaveBeenCalledWith(invite);
    expect(shareMessage).not.toHaveBeenCalled();
    await settle();
    expect(screen.getByText('Saved. Text when you’re ready.')).toBeInTheDocument();
  });

  test('on the web with navigator.share, the sheet opens from the thank-you tap', async () => {
    setNavigatorShare(jest.fn());
    markFreshBet('abc123');
    await renderTally();
    await settle();
    await tap(within(thanks()).getByRole('button', { name: 'Text the crew' }));
    expect(shareCalls).toEqual([{ kind: 'sheet', text: invite, inClick: true }]);
  });

  test('a skipped ad opens the sheet directly, with no thank-you', async () => {
    showInterstitial.mockResolvedValue(skippedResult('timeout'));
    markFreshBet('abc123');
    await renderTally();
    await settle();
    expect(thanks()).not.toBeInTheDocument();
    expect(openShareSheet).toHaveBeenCalledWith(invite);
    expect(shareMessage).not.toHaveBeenCalled();
  });

  test('with no share sheet there is no ad either', async () => {
    hasShareSheet.mockReturnValue(false);
    markFreshBet('abc123');
    await renderTally();
    await settle();
    expect(showInterstitial).not.toHaveBeenCalled();
    expect(canShowInterstitial).not.toHaveBeenCalled();
    expect(openShareSheet).not.toHaveBeenCalled();
  });
});
