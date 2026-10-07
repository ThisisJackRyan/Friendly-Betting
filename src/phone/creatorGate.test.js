import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyBets from './MyBets';
import TallyScreen from './TallyScreen';
import { settleBet, subscribeBet, subscribeMyBets } from './api';
import { sendPhoneCode, signOutCreator, verifyPhoneCode } from './creatorAuth';
import { AUTH_COPY, PERSON_CHECK_CANCELLED } from './creatorSession';
import { useIdentity } from './identity';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');

const openBet = {
  id: 'abc123',
  code: 'abc123',
  schemaVersion: 2,
  type: 'money-line',
  typeLabel: 'Money Line',
  question: 'Who is late',
  createdByName: 'Maya',
  createdByID: 'anon-1',
  status: 'open',
  options: [
    { id: 'a', label: 'Yes' },
    { id: 'b', label: 'No' },
  ],
  votes: [],
};

const mockIdentity = {
  user: {
    uid: 'anon-1',
    isAnonymous: true,
    providerData: [{ providerId: 'anonymous' }],
  },
};

jest.mock('./api', () => ({
  subscribeMyBets: jest.fn((_uid, onChange) => {
    onChange([]);
    return () => {};
  }),
  subscribeBet: jest.fn((_code, onChange) => {
    onChange(openBet);
    return () => {};
  }),
  hydrateBet: async (bet) => bet,
  settleBet: jest.fn(async () => {}),
}));

jest.mock('./creatorAuth', () => ({
  sendPhoneCode: jest.fn(),
  verifyPhoneCode: jest.fn(),
  signOutCreator: jest.fn(),
  mountPhoneCheck: jest.fn(() => Promise.resolve()),
  releasePhoneCheck: jest.fn(),
}));

jest.mock('./identity', () => ({
  useIdentity: jest.fn(() => mockIdentity.user),
  creatorName: () => 'Maya',
  rememberName: () => {},
  savedName: () => '',
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'copied'),
}));

beforeEach(() => {
  mockIdentity.user = {
    uid: 'anon-1',
    isAnonymous: true,
    providerData: [{ providerId: 'anonymous' }],
  };
  useIdentity.mockImplementation(() => mockIdentity.user);
  navigation.pathname = '/bets';
  navigation.params = {};
  sendPhoneCode.mockReset();
  verifyPhoneCode.mockReset();
  signOutCreator.mockReset();
  settleBet.mockClear();
  subscribeMyBets.mockClear();
  subscribeBet.mockImplementation((_code, onChange) => {
    onChange(openBet);
    return () => {};
  });
});

test('my bets skips the phone gate when a creator session exists', () => {
  jest.useFakeTimers();
  try {
    mockIdentity.user = {
      uid: 'creator-1',
      phoneNumber: '+15551234567',
      providerData: [{ providerId: 'phone' }],
    };
    render(
      <div className="phone">
        <MyBets />
      </div>,
    );
    expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send code' })).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(450);
    });
    expect(screen.getByRole('heading', { name: 'My bets' })).toBeInTheDocument();
    const logout = screen.getByRole('button', { name: 'Log out' });
    expect(logout).toHaveClass('logout-link');
    expect(logout).not.toHaveClass('cta');
    expect(subscribeMyBets).toHaveBeenCalledWith('creator-1', expect.any(Function));
  } finally {
    jest.useRealTimers();
  }
});

test('my bets without a creator session uses the phone slide, not the loader', async () => {
  sendPhoneCode.mockResolvedValue('vid-1');
  verifyPhoneCode.mockResolvedValue({
    uid: 'anon-1',
    phoneNumber: '+15551234567',
    providerData: [{ providerId: 'phone' }],
  });
  render(
    <div className="phone">
      <MyBets />
    </div>,
  );
  expect(screen.getByRole('heading', { name: 'Phone' })).toBeInTheDocument();
  expect(screen.getByText(AUTH_COPY.textLine)).toBeInTheDocument();
  expect(screen.getByText(AUTH_COPY.bettorLine)).toBeInTheDocument();
  expect(screen.getByLabelText(/phone/i)).toHaveAttribute('placeholder', '(555) 555-0100');
  const slot = document.querySelector('[data-step="phone"] .person-check .recaptcha-slot');
  expect(slot).not.toBeNull();
  expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'My bets' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  expect(subscribeMyBets).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '5551234567' } });
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  expect(await screen.findByRole('heading', { name: 'Code' })).toBeInTheDocument();
  expect(document.querySelector('.create-pane.is-entering')).toHaveClass('slide-forward');
  expect(document.querySelector('[data-step="code"]')).toBeInTheDocument();
  expect(document.querySelector('.create-pane:not(.is-leaving)[data-step="code"] .person-check')).toBeNull();
  expect(slot.isConnected).toBe(true);
  expect(slot.closest('[hidden]')).toBeNull();

  await userEvent.click(screen.getByRole('button', { name: 'Resend' }));
  expect(sendPhoneCode).toHaveBeenCalledTimes(2);
  expect(sendPhoneCode.mock.calls[1][1]).toBe(slot);
  expect(sendPhoneCode.mock.calls[1][1]).toBe(sendPhoneCode.mock.calls[0][1]);
  expect(screen.getByRole('heading', { name: 'Code' })).toBeInTheDocument();

  '123456'.split('').forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Digit ${index + 1}`), {
      target: { value: digit },
    });
  });
  expect(await screen.findByRole('heading', { name: 'My bets' })).toBeInTheDocument();
  expect(document.querySelector('.create-pane.is-entering')).toHaveAttribute('data-step', 'done');
  expect(subscribeMyBets).toHaveBeenCalledWith('anon-1', expect.any(Function));
});

test('an unmapped send on the phone gate shows the human line and raw code', async () => {
  const err = new Error(
    'Firebase: The given sign-in provider is disabled for this Firebase project. (auth/operation-not-allowed).',
  );
  err.code = 'auth/operation-not-allowed';
  sendPhoneCode.mockRejectedValue(err);
  render(
    <div className="phone">
      <MyBets />
    </div>,
  );
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '5551234567' } });
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Couldn\u2019t send a code. Try again.');
  expect(alert).not.toHaveTextContent('Firebase');
  expect(alert).not.toHaveTextContent('auth/operation-not-allowed');
  const code = screen.getByText('auth/operation-not-allowed');
  expect(code).toHaveClass('muted');
  expect(code.textContent).toBe('auth/operation-not-allowed');
  expect(screen.getByRole('heading', { name: 'Phone' })).toBeInTheDocument();
});

test('a closed person check on the phone gate quietly puts the send button back', async () => {
  const err = new Error('The person check was closed.');
  err.code = PERSON_CHECK_CANCELLED;
  sendPhoneCode.mockRejectedValue(err);
  render(
    <div className="phone">
      <MyBets />
    </div>,
  );
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '5551234567' } });
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));

  const button = await screen.findByRole('button', { name: 'Send code' });
  expect(button).toBeEnabled();
  expect(button).not.toHaveAttribute('aria-disabled');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(document.querySelector('.phone-error-code')).not.toBeInTheDocument();
  expect(screen.queryByText(PERSON_CHECK_CANCELLED)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Phone' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Code' })).not.toBeInTheDocument();

  await userEvent.click(button);
  await screen.findByRole('button', { name: 'Send code' });
  expect(sendPhoneCode).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('log out drops the creator session and the phone gate returns', async () => {
  mockIdentity.user = {
    uid: 'creator-1',
    phoneNumber: '+15551234567',
    providerData: [{ providerId: 'phone' }],
  };
  const view = render(
    <div className="phone">
      <MyBets />
    </div>,
  );
  const logout = await screen.findByRole('button', { name: 'Log out' });
  expect(logout).toHaveClass('logout-link');
  expect(logout).not.toHaveClass('cta');
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();

  await userEvent.click(logout);
  expect(signOutCreator).toHaveBeenCalledTimes(1);

  mockIdentity.user = {
    uid: 'anon-after',
    isAnonymous: true,
    providerData: [{ providerId: 'anonymous' }],
  };
  view.rerender(
    <div className="phone">
      <MyBets />
    </div>,
  );

  expect(screen.getByRole('heading', { name: 'Phone' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'My bets' })).not.toBeInTheDocument();

  const css = fs.readFileSync(path.join(__dirname, 'phone.css'), 'utf8');
  const rule = css.slice(css.indexOf('.logout-link'), css.indexOf('.logout-link') + 280);
  expect(rule).toContain('color: var(--muted)');
  expect(rule).not.toContain('#007a45');
});

function renderTally() {
  jest.useFakeTimers();
  try {
    navigation.pathname = '/t/abc123';
    navigation.params = { code: 'abc123' };
    const view = render(
      <div className="phone">
        <TallyScreen />
      </div>,
    );
    act(() => {
      jest.advanceTimersByTime(450);
    });
    return view;
  } finally {
    jest.useRealTimers();
  }
}

function expectNoSoftClose() {
  expect(screen.getByText('Who is late')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /close & settle/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Settle' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Send code' })).not.toBeInTheDocument();
  expect(screen.queryByText(AUTH_COPY.bettorLine)).not.toBeInTheDocument();
  expect(screen.queryByText('Who won?')).not.toBeInTheDocument();
  expect(screen.queryByText(/only the creator can settle/i)).not.toBeInTheDocument();
  expect(document.querySelector('.create-pane')).toBeNull();
  expect(sendPhoneCode).not.toHaveBeenCalled();
  expect(settleBet).not.toHaveBeenCalled();
}

test('the tally no longer opens the phone slides for someone who is not the creator', () => {
  // anon-1 is the bet's createdByID but has no phone session (the #39 case).
  renderTally();
  expectNoSoftClose();
});

test('after the creator logs out the tally shows no close and settle', () => {
  mockIdentity.user = {
    uid: 'anon-after-logout',
    isAnonymous: true,
    providerData: [{ providerId: 'anonymous' }],
  };
  renderTally();
  expectNoSoftClose();
});

test('a phone that does not own the bet sees no close and settle', () => {
  mockIdentity.user = {
    uid: 'creator-9',
    phoneNumber: '+15550000000',
    providerData: [{ providerId: 'phone' }],
  };
  renderTally();
  expectNoSoftClose();
});

test('the owning phone goes straight to the picker', async () => {
  mockIdentity.user = {
    uid: 'anon-1',
    phoneNumber: '+15551234567',
    providerData: [{ providerId: 'phone' }],
  };
  renderTally();
  await userEvent.click(screen.getByRole('button', { name: /close & settle/i }));
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
  expect(screen.getByText('Who won?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'No' }));
  expect(settleBet).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Settle & notify' }));
  expect(settleBet).toHaveBeenCalledWith('abc123', 'b');
});

test('a closed bet does not offer close and settle', () => {
  jest.useFakeTimers();
  try {
    subscribeBet.mockImplementation((_code, onChange) => {
      onChange({ ...openBet, status: 'closed', winnerId: 'a' });
      return () => {};
    });
    navigation.pathname = '/t/abc123';
    navigation.params = { code: 'abc123' };
    render(
      <div className="phone">
        <TallyScreen />
      </div>,
    );
    act(() => {
      jest.advanceTimersByTime(450);
    });
    expect(screen.getByText('Who is late')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close & settle/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});
