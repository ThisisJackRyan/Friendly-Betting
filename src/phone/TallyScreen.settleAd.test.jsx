import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { runTransaction } from 'firebase/firestore';
import TallyScreen from './TallyScreen';
import { shareMessage } from './share';
import { requestResultTexts } from './resultTexts';
import { canShowInterstitial, showInterstitial } from '../ads/adService';
import { AD_THANKS_LINE } from '../ads/AdThanks';
import { navigation } from 'next/navigation';

// The ad between Settle & notify and the reveal. settleBet is the real one
// (src/phone/api.js) on a mocked Firestore transaction, so the result-text
// request it makes is the real call; the ad service is mocked
// (src/ads/settleGate.test.js runs the gate on the real one).
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

const creator = { uid: 'creator-1', phoneNumber: '+15551234567', providerData: [{ providerId: 'phone' }] };
const shownResult = { shown: true, skipped: false, reason: 'shown' };
const skippedResult = (reason) => ({ shown: false, skipped: true, reason });
const thanks = () => screen.queryByRole('dialog', { name: AD_THANKS_LINE });
const revealRegion = () => screen.queryByRole('region', { name: 'Settled result' });
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
  canShowInterstitial.mockReset().mockReturnValue(true);
  showInterstitial.mockReset().mockImplementation(async () => {
    mockLog.push('ad');
    return shownResult;
  });
});

afterEach(async () => {
  await act(async () => {});
  jest.useRealTimers();
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

// Close & settle, pick No, then Settle & notify.
async function settleOnNo() {
  await tap(screen.getByRole('button', { name: 'Close & settle' }));
  await tap(screen.getByRole('button', { name: 'No' }));
  await tap(screen.getByRole('button', { name: 'Settle & notify' }));
}

// What Firestore's listener does once the write lands.
const pushSettled = () => act(async () => { mockSnapshot.push?.({ ...stored }); });

test('the save and its result-text request come first; the ad starts only after the save resolves', async () => {
  let saved;
  runTransaction.mockImplementation((_db, run) => new Promise((resolve) => { saved = () => resolve(run({
    get: async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(stored)) }),
    update: (_ref, patch) => { stored = { ...stored, ...patch }; mockLog.push('saved'); },
  })); }));
  await renderTally();
  jest.useFakeTimers();
  await settleOnNo();
  expect(runTransaction).toHaveBeenCalledTimes(1);
  // Still saving: no ad yet.
  expect(showInterstitial).not.toHaveBeenCalled();
  expect(requestResultTexts).not.toHaveBeenCalled();
  await act(async () => { saved(); });
  expect(mockLog).toEqual(['saved', 'texts:abc123', 'ad']);
  expect(showInterstitial).toHaveBeenCalledWith({ placement: 'settle' });
  expect(stored).toMatchObject({ status: 'closed', winnerId: 'b' });
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(revealRegion()).toHaveTextContent('No won');
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

test('an ad shown: the reveal is held behind the ad and thank-you, then shows once after 1.5 s', async () => {
  let close;
  showInterstitial.mockImplementation(() => new Promise((resolve) => { close = resolve; }));
  await renderTally();
  jest.useFakeTimers();
  await settleOnNo();
  // The live snapshot flips to settled while the ad is up.
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
  stored = JSON.parse(JSON.stringify(openBet));
  canShowInterstitial.mockImplementation(() => { throw new Error('boom'); });
  await renderTally();
  await settleOnNo();
  await settle();
  expect(revealRegion()).toHaveTextContent('No won');
});

test('the result texts are requested once per settle, the same with or without an ad', async () => {
  await renderTally();
  await settleOnNo();
  await settle();
  expect(requestResultTexts).toHaveBeenCalledTimes(1);
  expect(requestResultTexts).toHaveBeenCalledWith('abc123');

  cleanup();
  requestResultTexts.mockClear();
  stored = JSON.parse(JSON.stringify(openBet));
  canShowInterstitial.mockReturnValue(false);
  await renderTally();
  await settleOnNo();
  await settle();
  expect(requestResultTexts).toHaveBeenCalledTimes(1);
  expect(requestResultTexts).toHaveBeenCalledWith('abc123');
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

test('leaving while the save is in flight: the save still lands, and no ad starts', async () => {
  let saved;
  runTransaction.mockImplementation((_db, run) => new Promise((resolve) => { saved = () => resolve(run({
    get: async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(stored)) }),
    update: (_ref, patch) => { stored = { ...stored, ...patch }; },
  })); }));
  await renderTally();
  await settleOnNo();
  cleanup();
  await act(async () => { saved(); });
  expect(stored).toMatchObject({ status: 'closed', winnerId: 'b' });
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
  stored = JSON.parse(JSON.stringify(mockSnapshot.first));
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
