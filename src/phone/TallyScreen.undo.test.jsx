import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { runTransaction } from 'firebase/firestore';
import TallyScreen from './TallyScreen';
import { requestResultTexts } from './resultTexts';
import { canShowInterstitial, showInterstitial } from '../ads/adService';
import { AD_THANKS_LINE } from '../ads/AdThanks';
import { buildSettlement } from './settlement';
import { renderWinnerCard } from './winnerCardImage';
import { REVEAL_COPY } from './reveal';
import { navigation } from 'next/navigation';

// Undo after a settle, and Call off on an open bet. The api is the real one
// (src/phone/api.js) on a mocked Firestore transaction; serverTimestamp()
// stands in for the server stamping the write with the (fake) clock.
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

jest.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ collection, id }),
  runTransaction: jest.fn(),
  serverTimestamp: () => 'SERVER_TIME',
  deleteField: () => 'DELETE_FIELD',
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
  requestResultTexts: jest.fn(),
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(),
  hasShareSheet: jest.fn(() => false),
  openShareSheet: jest.fn(),
}));

jest.mock('../ads/adService', () => ({
  canShowInterstitial: jest.fn(() => false),
  showInterstitial: jest.fn(),
}));

const creator = { uid: 'creator-1', providerData: [{ providerId: 'phone' }] };
const voter = { uid: 'sam', isAnonymous: true, providerData: [{ providerId: 'anonymous' }] };
const stamp = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 });
const revealRegion = () => screen.queryByRole('region', { name: 'Settled result' });
const undoButton = () => screen.queryByRole('button', { name: 'Undo' });
const callOffButton = () => screen.queryByRole('button', { name: 'Call off' });
const shareTextButton = () => screen.queryByRole('button', { name: 'Share the result' });
const shareImageButton = () => screen.queryByRole('button', { name: 'Share as image' });
const dialog = () => screen.queryByRole('dialog', { name: 'Call off this bet?' });
let stored;
let writes;
let failNext;

beforeEach(() => {
  mockAuth.currentUser = creator;
  navigation.pathname = '/t/abc123';
  navigation.params = { code: 'abc123' };
  window.sessionStorage.clear();
  stored = JSON.parse(JSON.stringify(openBet));
  writes = [];
  failNext = null;
  mockSnapshot.first = null;
  runTransaction.mockReset().mockImplementation(async (_db, run) => {
    if (failNext) {
      const err = failNext;
      failNext = null;
      throw err;
    }
    const tx = {
      get: jest.fn(async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(stored)) })),
      update: jest.fn((_ref, patch) => {
        writes.push(patch);
        const next = { ...stored };
        Object.entries(patch).forEach(([key, value]) => {
          if (value === 'DELETE_FIELD') delete next[key];
          else next[key] = value === 'SERVER_TIME' ? stamp(Date.now()) : value;
        });
        stored = next;
      }),
    };
    return run(tx);
  });
  requestResultTexts.mockClear();
  canShowInterstitial.mockReset().mockReturnValue(false);
  showInterstitial.mockReset();
  renderWinnerCard.mockClear();
});

afterEach(async () => {
  await act(async () => {});
  cleanup();
  jest.useRealTimers();
});

async function renderTally(user = creator) {
  mockAuth.currentUser = user;
  jest.useFakeTimers();
  render(
    <div className="phone">
      <TallyScreen />
    </div>,
  );
  act(() => {
    jest.advanceTimersByTime(450);
  });
  await act(async () => {
    mockAuth.listener?.(user);
  });
}

const tap = (element) => act(async () => { fireEvent.click(element); });
// A second at a time, so each countdown tick renders and schedules the next.
async function advance(ms) {
  for (let left = ms; left > 0; left -= 1000) {
    await act(async () => { jest.advanceTimersByTime(Math.min(1000, left)); });
  }
}
const pushStored = () => act(async () => { mockSnapshot.push?.(JSON.parse(JSON.stringify(stored))); });

async function settleOnNo() {
  await tap(screen.getByRole('button', { name: 'Close & settle' }));
  await tap(screen.getByRole('button', { name: 'No' }));
  await tap(screen.getByRole('button', { name: 'Settle & notify' }));
}

describe('Undo after a settle', () => {
  test('shows with a 30s countdown next to the reveal, and hides after 30s', async () => {
    await renderTally();
    await settleOnNo();
    expect(revealRegion()).toHaveTextContent('No won');
    expect(undoButton()).toBeInTheDocument();
    expect(screen.getByText('30s')).toBeInTheDocument();
    // The snapshot brings the server settledAt.
    await pushStored();
    expect(stored.settledAt).toEqual(expect.objectContaining({ seconds: expect.any(Number) }));
    await advance(10000);
    expect(screen.getByText('20s')).toBeInTheDocument();
    await advance(19000);
    expect(screen.getByText('1s')).toBeInTheDocument();
    await advance(1000);
    expect(undoButton()).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+s$/)).not.toBeInTheDocument();
    expect(revealRegion()).toHaveTextContent('No won');
  });

  test('sits right under Share the result and Share as image, above Run it back', async () => {
    await renderTally();
    // Maya picked Yes, so her reveal also offers to start a bet.
    await settleOnNo();
    const order = [
      shareTextButton(),
      shareImageButton(),
      undoButton(),
      screen.getByRole('link', { name: REVEAL_COPY.startBet }),
      screen.getByRole('button', { name: 'Run it back' }),
    ];
    order.forEach((node) => expect(node).toBeInTheDocument());
    order.slice(1).forEach((node, i) => {
      expect(order[i].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  test('Undo takes the share buttons with it, and no card is drawn after', async () => {
    await renderTally();
    await settleOnNo();
    await pushStored();
    await tap(undoButton());
    await pushStored();
    expect(shareTextButton()).not.toBeInTheDocument();
    expect(shareImageButton()).not.toBeInTheDocument();
    renderWinnerCard.mockClear();
    await advance(2000);
    expect(renderWinnerCard).not.toHaveBeenCalled();
  });

  test('Undo reopens the bet in one write, back to the open tally', async () => {
    await renderTally();
    await settleOnNo();
    await pushStored();
    await advance(5000);
    await tap(undoButton());
    expect(writes.at(-1)).toEqual({
      status: 'open', winnerId: null, settledAt: 'DELETE_FIELD', settlement: 'DELETE_FIELD', calledOff: 'DELETE_FIELD',
    });
    expect(stored).toMatchObject({ status: 'open', winnerId: null });
    expect(stored).not.toHaveProperty('settledAt');
    await pushStored();
    expect(revealRegion()).not.toBeInTheDocument();
    expect(undoButton()).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The picks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close & settle' })).toBeInTheDocument();
    expect(callOffButton()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text the crew' })).toBeEnabled();
  });

  test('after an undo the creator can settle again, with a fresh countdown', async () => {
    await renderTally();
    await settleOnNo();
    await pushStored();
    await advance(20000);
    await tap(undoButton());
    await pushStored();
    await tap(screen.getByRole('button', { name: 'Close & settle' }));
    await tap(screen.getByRole('button', { name: 'Yes' }));
    await tap(screen.getByRole('button', { name: 'Settle & notify' }));
    expect(revealRegion()).toHaveTextContent('Yes won');
    expect(screen.getByText('30s')).toBeInTheDocument();
    expect(requestResultTexts).toHaveBeenCalledTimes(2);
  });

  test('a failed undo says so and keeps the result', async () => {
    await renderTally();
    await settleOnNo();
    await pushStored();
    failNext = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    await tap(undoButton());
    expect(screen.getByRole('alert')).toHaveTextContent('Too late to undo.');
    expect(revealRegion()).toHaveTextContent('No won');
    failNext = new Error('');
    await tap(undoButton());
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t undo that. Try again.');
  });

  test('past the window the api refuses even if the button were tapped late', async () => {
    await renderTally();
    await settleOnNo();
    await pushStored();
    // The server stamp is older than this screen thinks (clock skew).
    stored = { ...stored, settledAt: stamp(Date.now() - 40000) };
    await tap(undoButton());
    expect(screen.getByRole('alert')).toHaveTextContent('Too late to undo.');
    expect(writes).toHaveLength(1);
  });

  test('with ads allowed, a settle still skips the ad and thank-you: Undo has the full 30s', async () => {
    canShowInterstitial.mockReturnValue(true);
    showInterstitial.mockResolvedValue({ shown: true, skipped: false, reason: 'shown' });
    await renderTally();
    await settleOnNo();
    await pushStored();
    expect(screen.queryByRole('dialog', { name: AD_THANKS_LINE })).not.toBeInTheDocument();
    expect(revealRegion()).toHaveTextContent('No won');
    expect(undoButton()).toBeInTheDocument();
    expect(screen.getByText('30s')).toBeInTheDocument();
    await advance(30000);
    expect(undoButton()).not.toBeInTheDocument();
    expect(showInterstitial).not.toHaveBeenCalled();
  });

  test('coming back within the window shows what is left of it, from the server time', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    mockSnapshot.first = { ...openBet, status: 'closed', winnerId: 'a', settlement: buildSettlement(openBet, 'a'), settledAt: stamp(now - 12000) };
    stored = JSON.parse(JSON.stringify(mockSnapshot.first));
    await renderTally();
    expect(undoButton()).toBeInTheDocument();
    expect(screen.getByText('18s')).toBeInTheDocument();
  });

  test.each([
    ['an old settle', (now) => stamp(now - 60000)],
    ['an older number settledAt', (now) => now - 5000],
  ])('no Undo on %s', async (_label, settledAt) => {
    jest.useFakeTimers();
    mockSnapshot.first = { ...openBet, status: 'closed', winnerId: 'a', settlement: buildSettlement(openBet, 'a'), settledAt: settledAt(Date.now()) };
    await renderTally();
    expect(revealRegion()).toBeInTheDocument();
    expect(undoButton()).not.toBeInTheDocument();
  });

  test('a voter never sees Undo on a fresh settle', async () => {
    jest.useFakeTimers();
    mockSnapshot.first = { ...openBet, status: 'closed', winnerId: 'a', settlement: buildSettlement(openBet, 'a'), settledAt: stamp(Date.now() - 1000) };
    await renderTally(voter);
    expect(revealRegion()).toBeInTheDocument();
    expect(undoButton()).not.toBeInTheDocument();
  });

  test('a fresh call-off has no Undo', async () => {
    jest.useFakeTimers();
    mockSnapshot.first = { ...openBet, status: 'closed', calledOff: true, settledAt: stamp(Date.now() - 1000) };
    await renderTally();
    expect(revealRegion()).toHaveTextContent('This bet was called off.');
    expect(undoButton()).not.toBeInTheDocument();
  });
});

describe('Call off', () => {
  test('only the creator sees it, and only on an open bet', async () => {
    await renderTally(voter);
    expect(callOffButton()).not.toBeInTheDocument();
    cleanup();
    jest.useRealTimers();
    await renderTally();
    expect(callOffButton()).toBeInTheDocument();
  });

  test.each([
    ['settled', { status: 'closed', winnerId: 'a', settlement: buildSettlement(openBet, 'a'), settledAt: 1 }],
    ['called off (flag)', { status: 'closed', calledOff: true, settledAt: 1 }],
    ['called off (status)', { status: 'called-off' }],
    ['closed without a winner', { status: 'closed' }],
  ])('not on a %s bet', async (_label, patch) => {
    mockSnapshot.first = { ...openBet, ...patch };
    await renderTally();
    expect(callOffButton()).not.toBeInTheDocument();
  });

  test('hidden while the settle picker is open', async () => {
    await renderTally();
    await tap(screen.getByRole('button', { name: 'Close & settle' }));
    expect(callOffButton()).not.toBeInTheDocument();
  });

  test('Keep it closes the dialog with nothing written', async () => {
    await renderTally();
    await tap(callOffButton());
    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getByText('Nobody wins this one.')).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Keep it' })).toHaveFocus();
    await tap(within(dialog()).getByRole('button', { name: 'Keep it' }));
    expect(dialog()).not.toBeInTheDocument();
    expect(runTransaction).not.toHaveBeenCalled();
    // Focus goes back to the button that opened it.
    expect(callOffButton()).toHaveFocus();
  });

  test('Escape and the backdrop also keep the bet and put focus back on Call off', async () => {
    await renderTally();
    await tap(callOffButton());
    await act(async () => { fireEvent.keyDown(dialog(), { key: 'Escape' }); });
    expect(dialog()).not.toBeInTheDocument();
    expect(callOffButton()).toHaveFocus();
    await tap(callOffButton());
    expect(within(dialog()).getByRole('button', { name: 'Keep it' })).toHaveFocus();
    await tap(document.querySelector('.dialog-backdrop'));
    expect(dialog()).not.toBeInTheDocument();
    expect(callOffButton()).toHaveFocus();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  test('confirming calls the bet off and shows the called-off result', async () => {
    await renderTally();
    await tap(callOffButton());
    await tap(within(dialog()).getByRole('button', { name: 'Call off bet' }));
    expect(writes).toEqual([{ status: 'closed', calledOff: true, settledAt: 'SERVER_TIME' }]);
    expect(requestResultTexts).toHaveBeenCalledWith('abc123');
    expect(dialog()).not.toBeInTheDocument();
    expect(revealRegion()).toHaveTextContent('This bet was called off.');
    expect(revealRegion()).toHaveTextContent('Nobody won this one.');
    await pushStored();
    expect(screen.queryByRole('button', { name: 'Close & settle' })).not.toBeInTheDocument();
    expect(callOffButton()).not.toBeInTheDocument();
    expect(undoButton()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Text the crew' })).not.toBeInTheDocument();
    // A called-off bet has nothing to share, as text or as an image.
    expect(shareTextButton()).not.toBeInTheDocument();
    expect(shareImageButton()).not.toBeInTheDocument();
    await advance(2000);
    expect(renderWinnerCard).not.toHaveBeenCalled();
  });

  test('a failed call-off keeps the dialog open with the error', async () => {
    await renderTally();
    await tap(callOffButton());
    failNext = new Error('');
    await tap(within(dialog()).getByRole('button', { name: 'Call off bet' }));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Couldn’t call off this bet. Try again.');
    expect(within(dialog()).getByRole('button', { name: 'Call off bet' })).toBeEnabled();
    expect(revealRegion()).not.toBeInTheDocument();
  });
});
