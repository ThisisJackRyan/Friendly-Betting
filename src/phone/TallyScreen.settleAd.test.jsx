import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { runTransaction } from 'firebase/firestore';
import TallyScreen from './TallyScreen';
import { shareMessage } from './share';
import { requestResultTexts } from './resultTexts';
import { canShowInterstitial, showInterstitial } from '../ads/adService';
import { AD_THANKS_LINE } from '../ads/AdThanks';
import { showHouseAd } from '../ads/HouseAd';
import { capReason } from '../ads/caps';
import { buildSettlement } from './settlement';
import { navigation } from 'next/navigation';

// The settle ad on the tally. A fresh settle has Undo, so it goes straight
// to the reveal with no ad and no thank-you (docs/ADS.md). The gate is still
// there for a settle that comes back with no Undo: one already saved, past
// its window, that a stale screen settles again. settleBet is the real one
// (src/phone/api.js) on a mocked Firestore transaction, so the result-text
// request it makes is the real call; the ad service is mocked, and a few
// tests hand it to the real one (src/ads/settleGate.test.js covers the gate).
jest.mock('next/navigation');
jest.mock('next/link');

const mockAuth = { currentUser: null, listener: null };
const mockLog = [];

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

jest.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ collection, id }),
  // The bet's vote docs (bets/{code}/votes): none here, the picks are in the array.
  collection: (_db, ...path) => ({ path: path.join('/') }),
  getDocs: jest.fn(async () => ({ docs: [] })),
  runTransaction: jest.fn(),
  serverTimestamp: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }),
  deleteField: () => undefined,
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
  votes: [
    { voterId: 'creator-1', name: 'Maya', optionId: 'a' },
    { voterId: 'sam', name: 'Sam', optionId: 'b' },
  ],
};

const mockSnapshot = { push: null, first: null };
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  subscribeBet: jest.fn((_code, onChange) => {
    mockSnapshot.push = onChange;
    onChange(mockSnapshot.first || openBet);
    return () => {
      mockSnapshot.push = null;
    };
  }),
}));

jest.mock('./resultTexts', () => ({
  ...jest.requireActual('./resultTexts'),
  requestResultTexts: jest.fn((code) => { mockLog.push(`texts:${code}`); }),
}));

const mockInClick = () => window.event?.type === 'click';
const shareCalls = [];
jest.mock('./share', () => ({
  shareMessage: jest.fn(),
  hasShareSheet: jest.fn(() => false),
  openShareSheet: jest.fn(),
}));

jest.mock('../ads/adService', () => ({
  canShowInterstitial: jest.fn(() => true),
  showInterstitial: jest.fn(),
}));

jest.mock('../ads/HouseAd', () => ({ showHouseAd: jest.fn() }));

const creator = { uid: 'creator-1', phoneNumber: '+15551234567', providerData: [{ providerId: 'phone' }] };
const shownResult = { shown: true, skipped: false, reason: 'shown' };
const skippedResult = (reason) => ({ shown: false, skipped: true, reason });
const thanks = () => screen.queryByRole('dialog', { name: AD_THANKS_LINE });
const revealRegion = () => screen.queryByRole('region', { name: 'Settled result' });
const undoButton = () => screen.queryByRole('button', { name: 'Undo' });
const undoCount = () => document.querySelector('.undo-settle-count');
const CAPS_KEY = 'fb.ads.caps.v1';
const adsFlag = process.env.NEXT_PUBLIC_ADS_ENABLED;
let stored;

beforeEach(() => {
  mockAuth.currentUser = creator;
  navigation.pathname = '/t/abc123';
  navigation.params = { code: 'abc123' };
  window.sessionStorage.clear();
  mockLog.length = 0;
  shareCalls.length = 0;
  stored = JSON.parse(JSON.stringify(openBet));
  mockSnapshot.first = null;
  runTransaction.mockReset().mockImplementation(async (_db, run) => {
    const tx = {
      get: jest.fn(async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(stored)) })),
      update: jest.fn((_ref, patch) => { stored = { ...stored, ...patch }; }),
    };
    const out = await run(tx);
    mockLog.push('saved');
    return out;
  });
  requestResultTexts.mockClear();
  shareMessage.mockReset().mockImplementation(async (text) => {
    shareCalls.push({ text, inClick: mockInClick() });
    return 'copied';
  });
  window.localStorage.clear();
  showHouseAd.mockReset().mockResolvedValue(undefined);
  canShowInterstitial.mockReset().mockReturnValue(true);
  showInterstitial.mockReset().mockImplementation(async () => {
    mockLog.push('ad');
    return shownResult;
  });
});

afterEach(async () => {
  await act(async () => {});
  jest.useRealTimers();
  if (adsFlag === undefined) delete process.env.NEXT_PUBLIC_ADS_ENABLED;
  else process.env.NEXT_PUBLIC_ADS_ENABLED = adsFlag;
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

const tap = (element) => act(async () => { fireEvent.click(element); });
const settle = () => act(async () => {});
// A second at a time, so each countdown tick renders and schedules the next.
async function advance(ms) {
  for (let left = ms; left > 0; left -= 1000) {
    await act(async () => { jest.advanceTimersByTime(Math.min(1000, left)); });
  }
}

// Close & settle, pick No, then Settle & notify.
async function settleOnNo() {
  await tap(screen.getByRole('button', { name: 'Close & settle' }));
  await tap(screen.getByRole('button', { name: 'No' }));
  await tap(screen.getByRole('button', { name: 'Settle & notify' }));
}

// What Firestore's listener does once the write lands.
const pushSettled = () => act(async () => { mockSnapshot.push?.({ ...stored }); });

// The stale screen: the tally still shows the bet open, but it was settled
// on No already (another of the creator's tabs), so settleBet hands that
// settle back. By default it was two minutes ago, past the Undo window.
const longAgo = () => ({ seconds: Math.floor(Date.now() / 1000) - 120, nanoseconds: 0 });
function alreadySettled(settledAt = longAgo()) {
  stored = { ...JSON.parse(JSON.stringify(openBet)), status: 'closed', winnerId: 'b', settlement: buildSettlement(openBet, 'b'), settledAt };
}

// The real ad service and caps (flag on, web, house ad mocked) in place of the mock.
function useRealAdService() {
  process.env.NEXT_PUBLIC_ADS_ENABLED = '1';
  const real = jest.requireActual('../ads/adService');
  real.__resetAdsForTests();
  canShowInterstitial.mockImplementation(real.canShowInterstitial);
  showInterstitial.mockImplementation(real.showInterstitial);
}

describe('a fresh settle, with Undo', () => {
  test('no settle ad and no thank-you: the reveal right after the save, with the full 30s Undo', async () => {
    await renderTally();
    jest.useFakeTimers();
    await settleOnNo();
    await settle();
    expect(showInterstitial).not.toHaveBeenCalled();
    expect(thanks()).not.toBeInTheDocument();
    expect(mockLog).toEqual(['saved', 'texts:abc123']);
    expect(stored).toMatchObject({ status: 'closed', winnerId: 'b' });
    expect(revealRegion()).toHaveTextContent('No won');
    expect(undoButton()).toBeEnabled();
    expect(undoCount()).toHaveTextContent('30s');
    // Nothing comes later either: no ad while the window runs, or after it.
    await advance(10000);
    expect(undoCount()).toHaveTextContent('20s');
    await advance(25000);
    expect(undoButton()).not.toBeInTheDocument();
    expect(showInterstitial).not.toHaveBeenCalled();
    expect(thanks()).not.toBeInTheDocument();
    expect(revealRegion()).toHaveTextContent('No won');
  });

  test('the snapshot landing first is no hold: the reveal and Undo as soon as the save resolves', async () => {
    let saved;
    runTransaction.mockImplementation((_db, run) => new Promise((resolve) => { saved = () => resolve(run({
      get: async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(stored)) }),
      update: (_ref, patch) => { stored = { ...stored, ...patch }; },
    })); }));
    await renderTally();
    await settleOnNo();
    await act(async () => { saved(); });
    await pushSettled();
    expect(showInterstitial).not.toHaveBeenCalled();
    expect(thanks()).not.toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Settled result' })).toHaveLength(1);
    expect(undoCount()).toHaveTextContent('30s');
  });

  test('with the real ad service and the flag on: no ad, and the settle caps are not touched', async () => {
    useRealAdService();
    await renderTally();
    await settleOnNo();
    await settle();
    expect(showHouseAd).not.toHaveBeenCalled();
    expect(showInterstitial).not.toHaveBeenCalled();
    expect(thanks()).not.toBeInTheDocument();
    expect(undoCount()).toHaveTextContent('30s');
    expect(window.localStorage.getItem(CAPS_KEY)).toBeNull();
    expect(capReason('settle')).toBe('');

    // Undo and settle again: still no ad, still nothing counted.
    await tap(undoButton());
    expect(revealRegion()).not.toBeInTheDocument();
    await settleOnNo();
    await settle();
    expect(revealRegion()).toHaveTextContent('No won');
    expect(undoCount()).toHaveTextContent('30s');
    expect(showHouseAd).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CAPS_KEY)).toBeNull();
    expect(capReason('settle')).toBe('');
  });

  test('a settle already saved but still in its window has Undo too: no ad', async () => {
    alreadySettled({ seconds: Math.floor(Date.now() / 1000) - 10, nanoseconds: 0 });
    await renderTally();
    await settleOnNo();
    await settle();
    expect(showInterstitial).not.toHaveBeenCalled();
    expect(thanks()).not.toBeInTheDocument();
    expect(revealRegion()).toHaveTextContent('No won');
    expect(undoButton()).toBeEnabled();
  });
});

describe('a settle with no Undo (already saved, from a stale screen)', () => {
  beforeEach(() => {
    alreadySettled();
  });

  test('with the real ad service: the settle ad shows and is counted', async () => {
    useRealAdService();
    await renderTally();
    await settleOnNo();
    await settle();
    expect(showHouseAd).toHaveBeenCalledTimes(1);
    expect(thanks()).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CAPS_KEY)).counts).toEqual({ settle: 1 });
    expect(capReason('settle')).not.toBe('');
    await tap(screen.getByText(AD_THANKS_LINE));
    expect(revealRegion()).toHaveTextContent('No won');
    expect(undoButton()).not.toBeInTheDocument();
  });

  test('an older build’s number settledAt has no Undo either: the ad', async () => {
    alreadySettled(123);
    await renderTally();
    await settleOnNo();
    await settle();
    expect(showInterstitial).toHaveBeenCalledWith({ placement: 'settle' });
    expect(thanks()).toBeInTheDocument();
  });

  test('the save and its result-text request come first; the ad starts only after the save resolves', async () => {
    let saved;
    runTransaction.mockImplementation((_db, run) => new Promise((resolve) => { saved = async () => {
      const out = await run({ get: async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(stored)) }), update: () => {} });
      mockLog.push('saved');
      resolve(out);
    }; }));
    await renderTally();
    jest.useFakeTimers();
    await settleOnNo();
    expect(runTransaction).toHaveBeenCalledTimes(1);
    // Still saving: no ad yet.
    expect(showInterstitial).not.toHaveBeenCalled();
    expect(requestResultTexts).not.toHaveBeenCalled();
    await act(async () => { await saved(); });
    expect(mockLog).toEqual(['saved', 'texts:abc123', 'ad']);
    expect(showInterstitial).toHaveBeenCalledWith({ placement: 'settle' });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(revealRegion()).toHaveTextContent('No won');
  });

  test('an ad shown: the reveal is held behind the ad and thank-you, then shows once after 1.5 s', async () => {
    let close;
    showInterstitial.mockImplementation(() => new Promise((resolve) => { close = resolve; }));
    await renderTally();
    jest.useFakeTimers();
    await settleOnNo();
    // The live snapshot catches up to the settle while the ad is up.
    await pushSettled();
    expect(revealRegion()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settling…' })).toBeDisabled();
    expect(screen.getByText('Who won?')).toBeInTheDocument();
    await act(async () => { close(shownResult); });
    expect(thanks()).toBeInTheDocument();
    expect(screen.getByText(AD_THANKS_LINE)).toBeInTheDocument();
    // No new copy: the only control is named by the thank-you line.
    expect(within(thanks()).getByRole('button')).toHaveAccessibleName(AD_THANKS_LINE);
    expect(within(thanks()).getByRole('button')).toHaveTextContent('');
    expect(revealRegion()).not.toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(1499); });
    expect(thanks()).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(thanks()).not.toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Settled result' })).toHaveLength(1);
    expect(revealRegion()).toHaveTextContent('No won');
    expect(screen.queryByText('Who won?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close & settle' })).not.toBeInTheDocument();
  });

  test('the thank-you also continues on a tap', async () => {
    await renderTally();
    await settleOnNo();
    await settle();
    expect(thanks()).toBeInTheDocument();
    await tap(screen.getByText(AD_THANKS_LINE));
    expect(thanks()).not.toBeInTheDocument();
    expect(revealRegion()).toHaveTextContent('No won');
  });

  test('focus stays on the thank-you, then moves to the reveal headline when it closes', async () => {
    await renderTally();
    jest.useFakeTimers();
    await settleOnNo();
    await settle();
    const control = within(thanks()).getByRole('button');
    expect(control).toHaveFocus();
    act(() => { screen.getByRole('button', { name: 'Settling…' }).focus(); });
    expect(control).toHaveFocus();
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(thanks()).not.toBeInTheDocument();
    const headline = within(revealRegion()).getByRole('heading', { level: 2 });
    expect(headline).toHaveClass('reveal-headline');
    expect(headline).toHaveAttribute('tabindex', '-1');
    expect(headline).toHaveFocus();
  });

  test('a tap on the thank-you also puts focus on the reveal headline', async () => {
    await renderTally();
    await settleOnNo();
    await settle();
    await tap(screen.getByText(AD_THANKS_LINE));
    expect(document.querySelector('.reveal-headline')).toHaveFocus();
  });

  test('the headline takes focus without scrolling: the reveal scrolls itself into place', async () => {
    const focus = jest.spyOn(HTMLElement.prototype, 'focus');
    try {
      await renderTally();
      await settleOnNo();
      await settle();
      focus.mockClear();
      await tap(screen.getByText(AD_THANKS_LINE));
      const headline = document.querySelector('.reveal-headline');
      expect(headline).toHaveFocus();
      const onHeadline = focus.mock.contexts.map((element, i) => [element, focus.mock.calls[i]])
        .filter(([element]) => element === headline);
      expect(onHeadline).toEqual([[headline, [{ preventScroll: true }]]]);
    } finally {
      focus.mockRestore();
    }
  });

  test('focus the user has put somewhere else is left there as the thank-you closes', async () => {
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    await renderTally();
    await settleOnNo();
    await settle();
    expect(within(thanks()).getByRole('button')).toHaveFocus();
    // What the page sees as the layer goes: focus already on another control.
    const active = jest.spyOn(document, 'activeElement', 'get').mockReturnValue(elsewhere);
    try {
      await tap(screen.getByText(AD_THANKS_LINE));
      expect(thanks()).not.toBeInTheDocument();
      expect(revealRegion()).toHaveTextContent('No won');
      active.mockRestore();
      expect(document.querySelector('.reveal-headline')).not.toHaveFocus();
    } finally {
      active.mockRestore();
      elsewhere.remove();
    }
  });

  test.each(['disabled', 'pro', 'capped', 'interval', 'busy', 'timeout', 'error', 'not-loaded'])(
    'an ad skipped as %s reveals directly, with no thank-you',
    async (reason) => {
      showInterstitial.mockResolvedValue(skippedResult(reason));
      await renderTally();
      await settleOnNo();
      await settle();
      expect(showInterstitial).toHaveBeenCalledWith({ placement: 'settle' });
      expect(thanks()).not.toBeInTheDocument();
      expect(revealRegion()).toHaveTextContent('No won');
    },
  );

  test('timeout fails open: an ad that resolves timeout after 5 s reveals, with no thank-you', async () => {
    showInterstitial.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve(skippedResult('timeout')), 5000);
    }));
    await renderTally();
    jest.useFakeTimers();
    await settleOnNo();
    await pushSettled();
    await act(async () => { jest.advanceTimersByTime(4999); });
    expect(revealRegion()).not.toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(thanks()).not.toBeInTheDocument();
    expect(revealRegion()).toHaveTextContent('No won');
  });

  test('nothing to try (flag off, Pro, capped): no ad call, and the reveal is exactly as before', async () => {
    canShowInterstitial.mockReturnValue(false);
    await renderTally();
    await settleOnNo();
    await settle();
    expect(canShowInterstitial).toHaveBeenCalledWith('settle');
    expect(showInterstitial).not.toHaveBeenCalled();
    expect(thanks()).not.toBeInTheDocument();
    expect(revealRegion()).toHaveTextContent('No won');
    expect(mockLog).toEqual(['saved', 'texts:abc123']);
  });

  test('a throwing ad service never blocks the reveal', async () => {
    showInterstitial.mockRejectedValue(new Error('boom'));
    await renderTally();
    await settleOnNo();
    await settle();
    expect(revealRegion()).toHaveTextContent('No won');

    cleanup();
    canShowInterstitial.mockImplementation(() => { throw new Error('boom'); });
    await renderTally();
    await settleOnNo();
    await settle();
    expect(revealRegion()).toHaveTextContent('No won');
  });

  test('Share the result is never opened by the ad flow; it still takes its own tap', async () => {
    await renderTally();
    jest.useFakeTimers();
    await settleOnNo();
    await settle();
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(revealRegion()).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(shareMessage).not.toHaveBeenCalled();
    await tap(screen.getByRole('button', { name: 'Share the result' }));
    expect(shareCalls).toHaveLength(1);
    expect(shareCalls[0].inClick).toBe(true);
    expect(shareCalls[0].text).toContain('Winning pick: No');
  });

  test('leaving the tally during the ad: no thank-you, no reveal, nothing left behind', async () => {
    let close;
    showInterstitial.mockImplementation(() => new Promise((resolve) => { close = resolve; }));
    await renderTally();
    await settleOnNo();
    cleanup();
    await act(async () => { close(shownResult); });
    expect(thanks()).not.toBeInTheDocument();
    expect(document.body).toBeEmptyDOMElement();
    expect(requestResultTexts).toHaveBeenCalledTimes(1);
  });

  test('leaving the tally during the thank-you: it goes away with the screen and its timer is cleared', async () => {
    await renderTally();
    jest.useFakeTimers();
    await settleOnNo();
    await settle();
    expect(thanks()).toBeInTheDocument();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const clear = jest.spyOn(global, 'clearTimeout');
    cleanup();
    expect(thanks()).not.toBeInTheDocument();
    expect(clear).toHaveBeenCalled();
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(document.body).toBeEmptyDOMElement();
    expect(error).not.toHaveBeenCalled();
    clear.mockRestore();
    error.mockRestore();
  });

  test('leaving while the save is in flight: no ad starts', async () => {
    let saved;
    runTransaction.mockImplementation((_db, run) => new Promise((resolve) => { saved = () => resolve(run({
      get: async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(stored)) }),
      update: () => {},
    })); }));
    await renderTally();
    await settleOnNo();
    cleanup();
    await act(async () => { saved(); });
    expect(requestResultTexts).toHaveBeenCalledWith('abc123');
    expect(showInterstitial).not.toHaveBeenCalled();
  });

  test('while the ad is loading, Text the crew is disabled and shares nothing', async () => {
    showInterstitial.mockImplementation(() => new Promise(() => {}));
    await renderTally();
    await settleOnNo();
    await settle();
    expect(showInterstitial).toHaveBeenCalledWith({ placement: 'settle' });
    const invite = screen.getByRole('button', { name: 'Text the crew' });
    expect(invite).toBeDisabled();
    await tap(invite);
    // Even a tap the disabled attribute misses goes nowhere.
    await act(async () => { invite.disabled = false; fireEvent.click(invite); });
    expect(shareMessage).not.toHaveBeenCalled();
    expect(shareCalls).toHaveLength(0);
  });

  test('while the ad is loading, Wanna vote? stays in place but is inert', async () => {
    mockSnapshot.first = { ...openBet, votes: [{ voterId: 'sam', name: 'Sam', optionId: 'b' }] };
    stored = { ...stored, votes: mockSnapshot.first.votes };
    showInterstitial.mockImplementation(() => new Promise(() => {}));
    await renderTally();
    const link = () => screen.getByRole('link', { name: 'Wanna vote?' });
    expect(link()).not.toHaveAttribute('aria-disabled');
    await settleOnNo();
    await settle();
    expect(showInterstitial).toHaveBeenCalledWith({ placement: 'settle' });
    expect(link()).toHaveAttribute('aria-disabled', 'true');
    expect(link()).toHaveAttribute('tabindex', '-1');
    expect(link()).toHaveTextContent(/^Wanna vote\?$/);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => { link().dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
  });
});

test('a failed save keeps the error, and no ad', async () => {
  runTransaction.mockRejectedValue(new Error('Only the creator can settle this bet.'));
  await renderTally();
  await settleOnNo();
  await settle();
  expect(screen.getByRole('alert')).toHaveTextContent('Only the creator can settle this bet.');
  expect(showInterstitial).not.toHaveBeenCalled();
  expect(requestResultTexts).not.toHaveBeenCalled();
  expect(thanks()).not.toBeInTheDocument();
  expect(revealRegion()).not.toBeInTheDocument();
  // The picker is back to normal, ready for another try.
  expect(screen.getByRole('button', { name: 'Settle & notify' })).toBeEnabled();
});

test('the result texts are requested once per settle, with or without Undo', async () => {
  await renderTally();
  await settleOnNo();
  await settle();
  expect(requestResultTexts).toHaveBeenCalledTimes(1);
  expect(requestResultTexts).toHaveBeenCalledWith('abc123');

  cleanup();
  requestResultTexts.mockClear();
  alreadySettled();
  await renderTally();
  await settleOnNo();
  await settle();
  await tap(screen.getByText(AD_THANKS_LINE));
  expect(requestResultTexts).toHaveBeenCalledTimes(1);
  expect(requestResultTexts).toHaveBeenCalledWith('abc123');
});
