import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyBets from './MyBets';
import TallyScreen from './TallyScreen';
import { settleBet, subscribeBet, subscribeMyBets } from './api';
import { sendPhoneCode, signOutCreator, verifyPhoneCode } from './creatorAuth';
import { AUTH_COPY } from './creatorSession';
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
  expect(document.querySelector('[data-step="phone"] .person-check .recaptcha-slot')).not.toBeNull();
  expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'My bets' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  expect(subscribeMyBets).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '5551234567' } });
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  expect(await screen.findByRole('heading', { name: 'Code' })).toBeInTheDocument();
  expect(document.querySelector('.create-pane.is-entering')).toHaveClass('slide-forward');
  expect(document.querySelector('[data-step="code"]')).toBeInTheDocument();

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

test('settle stays closed until the owning phone verifies', async () => {
  jest.useFakeTimers();
  let view;
  try {
    navigation.pathname = '/t/abc123';
    navigation.params = { code: 'abc123' };
    view = render(
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

  expect(screen.getByText('Who is late')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
  expect(settleBet).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: /close & settle/i }));
  expect(screen.getByRole('heading', { name: 'Phone' })).toBeInTheDocument();
  expect(screen.getByText(AUTH_COPY.bettorLine)).toBeInTheDocument();
  expect(settleBet).not.toHaveBeenCalled();

  sendPhoneCode.mockResolvedValue('vid-9');
  verifyPhoneCode.mockResolvedValue({
    uid: 'other-phone',
    phoneNumber: '+15557654321',
    providerData: [{ providerId: 'phone' }],
  });
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '5557654321' } });
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  expect(await screen.findByRole('heading', { name: 'Code' })).toBeInTheDocument();
  '654321'.split('').forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Digit ${index + 1}`), {
      target: { value: digit },
    });
  });
  expect(await screen.findByText(/only the creator can settle/i)).toBeInTheDocument();
  expect(settleBet).not.toHaveBeenCalled();

  view.unmount();
});

test('the owning phone can settle after the code slide', async () => {
  jest.useFakeTimers();
  try {
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
  } finally {
    jest.useRealTimers();
  }

  sendPhoneCode.mockResolvedValue('vid-1');
  verifyPhoneCode.mockResolvedValue({
    uid: 'anon-1',
    phoneNumber: '+15551234567',
    providerData: [{ providerId: 'phone' }],
  });

  await userEvent.click(screen.getByRole('button', { name: /close & settle/i }));
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '5551234567' } });
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  expect(await screen.findByRole('heading', { name: 'Code' })).toBeInTheDocument();
  '123456'.split('').forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Digit ${index + 1}`), {
      target: { value: digit },
    });
  });
  expect(await screen.findByRole('heading', { name: 'Settle' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  expect(document.querySelector('.create-pane.is-entering')).toHaveClass('slide-forward');
  await userEvent.click(screen.getByRole('button', { name: 'No' }));
  expect(settleBet).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Settle & notify' }));
  expect(settleBet).toHaveBeenCalledWith('abc123', 'b');
});

test('close and settle stays on an open bet after the creator logs out', async () => {
  jest.useFakeTimers();
  try {
    mockIdentity.user = {
      uid: 'anon-after-logout',
      isAnonymous: true,
      providerData: [{ providerId: 'anonymous' }],
    };
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
  } finally {
    jest.useRealTimers();
  }

  const close = screen.getByRole('button', { name: /close & settle/i });
  expect(close).toHaveClass('danger', 'press');
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
  expect(screen.queryByText('Who won?')).not.toBeInTheDocument();
  expect(settleBet).not.toHaveBeenCalled();

  sendPhoneCode.mockResolvedValue('vid-logout');
  verifyPhoneCode.mockResolvedValue({
    uid: 'anon-1',
    phoneNumber: '+15551234567',
    providerData: [{ providerId: 'phone' }],
  });

  await userEvent.click(close);
  expect(screen.getByRole('heading', { name: 'Phone' })).toBeInTheDocument();
  expect(screen.getByText(AUTH_COPY.textLine)).toBeInTheDocument();
  expect(screen.getByText(AUTH_COPY.bettorLine)).toBeInTheDocument();
  expect(screen.queryByText('Who won?')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '5551234567' } });
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  expect(await screen.findByRole('heading', { name: 'Code' })).toBeInTheDocument();
  expect(document.querySelector('.create-pane.is-entering')).toHaveClass('slide-forward');
  '123456'.split('').forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Digit ${index + 1}`), {
      target: { value: digit },
    });
  });
  expect(await screen.findByRole('heading', { name: 'Settle' })).toBeInTheDocument();
  expect(screen.getByText('Who won?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'No' }));
  expect(settleBet).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Settle & notify' }));
  expect(settleBet).toHaveBeenCalledWith('abc123', 'b');
});

test('a phone that does not own the bet cannot settle', async () => {
  jest.useFakeTimers();
  try {
    mockIdentity.user = {
      uid: 'creator-9',
      phoneNumber: '+15550000000',
      providerData: [{ providerId: 'phone' }],
    };
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
  } finally {
    jest.useRealTimers();
  }

  const close = screen.getByRole('button', { name: /close & settle/i });
  expect(close).toHaveClass('danger', 'press');
  expect(screen.queryByText('Who won?')).not.toBeInTheDocument();
  expect(settleBet).not.toHaveBeenCalled();

  sendPhoneCode.mockResolvedValue('vid-other');
  verifyPhoneCode.mockResolvedValue({
    uid: 'creator-9',
    phoneNumber: '+15550000000',
    providerData: [{ providerId: 'phone' }],
  });

  await userEvent.click(close);
  expect(screen.getByRole('heading', { name: 'Phone' })).toBeInTheDocument();
  expect(screen.queryByText('Who won?')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '5550000000' } });
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  expect(await screen.findByRole('heading', { name: 'Code' })).toBeInTheDocument();
  '000000'.split('').forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Digit ${index + 1}`), {
      target: { value: digit },
    });
  });
  expect(await screen.findByText(/only the creator can settle/i)).toBeInTheDocument();
  expect(settleBet).not.toHaveBeenCalled();
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
