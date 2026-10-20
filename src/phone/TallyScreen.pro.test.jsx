import { act, fireEvent, render, screen } from '@testing-library/react';
import { AdMob } from '@capacitor-community/admob';
import TallyScreen from './TallyScreen';
import EntitlementSync from './EntitlementSync';
import { shareMessage } from './share';
import { subscribeEntitlement } from './entitlementApi';
import { __resetEntitlementForTests } from './useEntitlement';
import { __resetAdsForTests } from '../ads/adService';
import { showHouseAd } from '../ads/HouseAd';
import { navigation } from 'next/navigation';

// A Pro creator on the tally with ads on, through the real entitlement store,
// pro.js and ad service, on the native app: no ad call reaches the plugin,
// the settle goes straight to the reveal and the invite straight to the share.
jest.mock('next/navigation');
jest.mock('next/link');

const mockAuth = { currentUser: null, listeners: new Set() };

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, onChange) => {
    mockAuth.listeners.add(onChange);
    return () => mockAuth.listeners.delete(onChange);
  }),
  signInAnonymously: jest.fn(async () => ({ user: mockAuth.currentUser })),
}));

jest.mock('../Config/firebase-config', () => ({
  get auth() {
    return mockAuth;
  },
  db: {},
}));

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));

jest.mock('@capacitor-community/admob', () => ({
  AdMob: {
    initialize: jest.fn(),
    trackingAuthorizationStatus: jest.fn(),
    requestTrackingAuthorization: jest.fn(),
    prepareInterstitial: jest.fn(),
    showInterstitial: jest.fn(),
    addListener: jest.fn(),
  },
}));

jest.mock('../ads/HouseAd', () => ({ showHouseAd: jest.fn() }));

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

jest.mock('./api', () => {
  const { buildSettlement } = jest.requireActual('./settlement');
  return {
    subscribeBet: jest.fn((_code, onChange) => {
      onChange(openBet);
      return () => {};
    }),
    hydrateBet: async (bet) => bet,
    settleBet: jest.fn(async (_code, winnerId) => ({
      ...openBet, status: 'closed', winnerId, settledAt: 1, settlement: buildSettlement(openBet, winnerId),
    })),
  };
});

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'copied'),
  hasShareSheet: jest.fn(() => false),
  openShareSheet: jest.fn(async () => 'aborted'),
}));

const creator = { uid: 'creator-1', phoneNumber: '+15551234567', providerData: [{ providerId: 'phone' }] };
const flag = process.env.NEXT_PUBLIC_ADS_ENABLED;
const adCalls = () => Object.values(AdMob).reduce((sum, fn) => sum + fn.mock.calls.length, 0);
const tap = (element) => act(async () => { fireEvent.click(element); });

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADS_ENABLED = '1';
  mockAuth.currentUser = creator;
  mockAuth.listeners.clear();
  navigation.pathname = '/t/abc123';
  navigation.params = { code: 'abc123' };
  window.sessionStorage.clear();
  localStorage.clear();
  __resetEntitlementForTests();
  __resetAdsForTests();
  Object.values(AdMob).forEach((fn) => fn.mockReset());
  showHouseAd.mockReset();
  shareMessage.mockClear();
  subscribeEntitlement.mockReset().mockImplementation((uid, onChange) => {
    onChange(uid === creator.uid ? { plan: 'pro', source: 'mock', expiresAt: null } : null);
    return () => {};
  });
});

afterEach(() => {
  if (flag === undefined) delete process.env.NEXT_PUBLIC_ADS_ENABLED;
  else process.env.NEXT_PUBLIC_ADS_ENABLED = flag;
});

async function renderTally() {
  jest.useFakeTimers();
  try {
    render(<div className="phone"><EntitlementSync /><TallyScreen /></div>);
    act(() => {
      jest.advanceTimersByTime(450);
    });
  } finally {
    jest.useRealTimers();
  }
  await act(async () => {
    mockAuth.listeners.forEach((listener) => listener(creator));
  });
}

test('Pro: Settle & notify goes straight to the reveal, no ad and no plugin call', async () => {
  await renderTally();
  await tap(screen.getByRole('button', { name: 'Close & settle' }));
  await tap(screen.getByRole('button', { name: 'No' }));
  await tap(screen.getByRole('button', { name: 'Settle & notify' }));
  await act(async () => {});
  expect(screen.getByRole('region', { name: 'Settled result' })).toHaveTextContent('No won');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(adCalls()).toBe(0);
  expect(showHouseAd).not.toHaveBeenCalled();
});

test('Pro: Text the crew shares with no ad and no plugin call', async () => {
  await renderTally();
  await tap(screen.getByRole('button', { name: 'Text the crew' }));
  await act(async () => {});
  expect(shareMessage).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(adCalls()).toBe(0);
  expect(showHouseAd).not.toHaveBeenCalled();
});
