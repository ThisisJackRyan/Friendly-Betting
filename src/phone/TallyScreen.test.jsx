import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TallyScreen from './TallyScreen';
import { settleBet, subscribeBet } from './api';
import { buildSettlement } from './settlement';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');

// The real useIdentity runs on top of this fake auth, so the tally sees the
// same onAuthStateChanged updates it would in the browser.
const mockAuth = { currentUser: null, listener: null };
const mockSignInAnonymously = jest.fn();

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, onChange) => {
    mockAuth.listener = onChange;
    return () => {
      mockAuth.listener = null;
    };
  }),
  signInAnonymously: (...args) => mockSignInAnonymously(...args),
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

const mockBet = { current: openBet };

jest.mock('./api', () => ({
  subscribeBet: jest.fn((_code, onChange) => {
    onChange(mockBet.current);
    return () => {};
  }),
  hydrateBet: async (bet) => ({ ...bet, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], votes: [] }),
  settleBet: jest.fn(async () => {}),
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'copied'),
}));

const anon = { uid: 'anon-1', isAnonymous: true, providerData: [{ providerId: 'anonymous' }] };
const creator = { uid: 'creator-1', phoneNumber: '+15551234567', providerData: [{ providerId: 'phone' }] };
const otherPhone = { uid: 'creator-9', phoneNumber: '+15550000000', providerData: [{ providerId: 'phone' }] };

beforeEach(() => {
  mockBet.current = openBet;
  mockAuth.currentUser = null;
  mockSignInAnonymously.mockReset();
  mockSignInAnonymously.mockImplementation(async () => {
    mockAuth.currentUser = anon;
    return { user: anon };
  });
  settleBet.mockClear();
  subscribeBet.mockClear();
  navigation.pathname = '/t/abc123';
  navigation.params = { code: 'abc123' };
});

async function signIn(user) {
  mockAuth.currentUser = user;
  await act(async () => {
    mockAuth.listener(user);
  });
}

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
  // Let any hydrateBet promise settle.
  await act(async () => {});
}

const closeButton = () => screen.queryByRole('button', { name: /close & settle/i });

test('auth changes re-check the creator: logged out, then creator, then another phone', async () => {
  await renderTally();
  expect(screen.getByText('Who is late')).toBeInTheDocument();
  expect(closeButton()).not.toBeInTheDocument();

  // Signed out: identity falls back to a fresh anonymous session.
  await act(async () => {
    mockAuth.listener(null);
  });
  expect(mockSignInAnonymously).toHaveBeenCalled();
  expect(closeButton()).not.toBeInTheDocument();

  await signIn(creator);
  expect(closeButton()).toHaveClass('danger', 'press');

  await signIn(otherPhone);
  expect(closeButton()).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();

  await signIn(creator);
  await userEvent.click(closeButton());
  expect(screen.getByText('Who won?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'No' }));
  await userEvent.click(screen.getByRole('button', { name: 'Settle & notify' }));
  expect(settleBet).toHaveBeenCalledWith('abc123', 'b');
});

test('the picker closes if the creator session goes away mid-settle', async () => {
  await renderTally();
  await signIn(creator);
  await userEvent.click(closeButton());
  expect(screen.getByText('Who won?')).toBeInTheDocument();

  await signIn(anon);
  expect(screen.queryByText('Who won?')).not.toBeInTheDocument();
  expect(closeButton()).not.toBeInTheDocument();
  expect(settleBet).not.toHaveBeenCalled();
});

test('an anonymous voter sees no close and settle', async () => {
  await renderTally();
  await signIn(anon);
  expect(screen.getByRole('button', { name: 'Text the crew' })).toBeInTheDocument();
  expect(closeButton()).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
});

test('a legacy bet without a creator uid shows no close and settle and still renders', async () => {
  mockBet.current = { id: 'legacy1', betID: 'ml-1', type: 'Money Line', bet: 'Who wins' };
  navigation.params = { code: 'legacy1' };
  await renderTally();
  await signIn(creator);
  expect(screen.getByText('Who wins')).toBeInTheDocument();
  expect(closeButton()).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
});

test('an already settled bet shows the result and no close and settle, even to the creator', async () => {
  mockBet.current = {
    ...openBet,
    status: 'closed',
    winnerId: 'a',
    settledAt: 1,
    settlement: buildSettlement(openBet, 'a'),
  };
  await renderTally();
  await signIn(creator);
  expect(screen.getByRole('heading', { name: 'The final word' })).toBeInTheDocument();
  expect(closeButton()).not.toBeInTheDocument();
});

test('the creator can still settle a bet that closed without a winner', async () => {
  mockBet.current = { ...openBet, status: 'closed', winnerId: null };
  await renderTally();
  await signIn(creator);
  expect(closeButton()).toBeInTheDocument();
  await signIn(otherPhone);
  expect(closeButton()).not.toBeInTheDocument();
});
