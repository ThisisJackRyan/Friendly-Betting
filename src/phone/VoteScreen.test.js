import fs from 'fs';
import path from 'path';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoteScreen from './VoteScreen';
import TallyScreen from './TallyScreen';
import { castVote, settleBet, subscribeBet } from './api';
import { useIdentity } from './identity';
import { shareMessage } from './share';
import { navigation } from 'next/navigation';
import { buildSettlement } from './settlement';
import { saveResultText } from './resultTexts';
import { RESULT_TEXT_COPY } from './resultTextCopy';
import { PHONE_INVALID_ERROR, PHONE_OFFLINE_ERROR, phoneError } from './creatorSession';

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
  createdByID: 'user-1',
  status: 'open',
  stake: 'a coffee',
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
  castVote: jest.fn(async () => {}),
  settleBet: jest.fn(async () => {}),
}));

jest.mock('./creatorAuth', () => ({
  sendPhoneCode: jest.fn(),
  verifyPhoneCode: jest.fn(),
  mountPhoneCheck: jest.fn(() => Promise.resolve()),
  releasePhoneCheck: jest.fn(),
}));

const phoneCreator = {
  uid: 'user-1',
  phoneNumber: '+15551234567',
  providerData: [{ providerId: 'phone' }],
};

jest.mock('./identity', () => ({
  useIdentity: jest.fn(() => ({
    uid: 'user-1',
    phoneNumber: '+15551234567',
    providerData: [{ providerId: 'phone' }],
  })),
  rememberName: jest.fn(),
  savedName: () => 'Sam',
  creatorName: () => 'Sam',
}));

jest.mock('./resultTexts', () => ({
  ...jest.requireActual('./resultTexts'),
  saveResultText: jest.fn(async () => {}),
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'copied'),
}));

// The header Results inbox keeps its own bet listeners (ResultsMenu.test.jsx);
// stub it so these tests only see the screen's own subscription.
jest.mock('./ResultsMenu', () => () => <span data-testid="results-menu" />);

beforeEach(() => {
  useIdentity.mockReturnValue(phoneCreator);
  subscribeBet.mockImplementation((_code, onChange) => {
    onChange(openBet);
    return () => {};
  });
  shareMessage.mockReset();
  shareMessage.mockResolvedValue('copied');
  castVote.mockClear();
  settleBet.mockReset();
  settleBet.mockResolvedValue(undefined);
});

function renderAt(path, element) {
  navigation.pathname = path;
  navigation.params = { code: path.split('/').pop() };
  return render(element);
}

test('a shared link opens the vote screen and records a one-tap choice', async () => {
  renderAt('/b/abc123', <VoteScreen />);
  expect(await screen.findByText('Maya')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Who is late' })).toBeInTheDocument();
  expect(screen.queryByText(/place bet/i)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
  expect(castVote).toHaveBeenCalledWith('abc123', {
    voterId: 'user-1',
    name: 'Sam',
    optionId: 'a',
  });
  expect(await screen.findByText(/you're on/i)).toHaveTextContent('Yes');
  expect(screen.getByRole('link', { name: 'See the picks' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Send code' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
  expect(screen.queryByText(/we’ll text a code/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^phone$/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
});

const textFriendsMessage = [
  'FRIENDLY · You in?',
  'Who is late?',
  '1. Yes',
  '2. No',
  'At stake: a coffee',
  'Make your call: http://localhost/b/abc123',
].join('\n');

test('the creator can close and settle from the tally', async () => {
  renderAt('/t/abc123', <TallyScreen />);
  expect(screen.getByRole('heading', { name: 'The picks' })).toBeInTheDocument();
  expect(await screen.findByText('Who is late')).toBeInTheDocument();
  const share = screen.getByRole('button', { name: 'Text the crew' });
  const close = screen.getByRole('button', { name: /close & settle/i });
  expect(share).toHaveClass('cta', 'press');
  expect(close).toHaveClass('danger', 'press');
  expect(share.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await userEvent.click(close);
  await userEvent.click(screen.getByRole('button', { name: 'No' }));
  expect(settleBet).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Settle & notify' }));
  expect(settleBet).toHaveBeenCalledWith('abc123', 'b');
  expect(screen.getByRole('button', { name: 'Text the crew' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
});

test('anyone can share the text-friends message from the tally', async () => {
  useIdentity.mockReturnValue({ uid: 'guest' });
  renderAt('/t/abc123', <TallyScreen />);
  const share = await screen.findByRole('button', { name: 'Text the crew' });
  expect(screen.queryByRole('button', { name: /close & settle/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phone' })).not.toBeInTheDocument();
  expect(screen.queryByText('Who won?')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  expect(screen.queryByText(/we’ll text a code/i)).not.toBeInTheDocument();
  await userEvent.click(share);
  expect(shareMessage).toHaveBeenCalledWith(textFriendsMessage);
  expect(await screen.findByText('Copied — paste into a text.')).toBeInTheDocument();
});

test('a manual share shows the message under the tally', async () => {
  shareMessage.mockResolvedValue('manual');
  renderAt('/t/abc123', <TallyScreen />);
  await userEvent.click(await screen.findByRole('button', { name: 'Text the crew' }));
  expect(await screen.findByText('Copy the message below.')).toBeInTheDocument();
  expect(document.querySelector('.manual-message')).toHaveTextContent(textFriendsMessage, {
    normalizeWhitespace: false,
  });
});

test('tally shows the Friendly loader instead of a loading line', () => {
  subscribeBet.mockImplementation(() => () => {});
  renderAt('/t/abc123', <TallyScreen />);
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  expect(screen.getByText('Friendly')).toHaveClass('friendly-load-mark');
  expect(document.querySelectorAll('.friendly-load-bar')).toHaveLength(3);
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Text the crew' })).not.toBeInTheDocument();
});

test('the loader holds for at least 450ms before the tally appears', () => {
  jest.useFakeTimers();
  try {
    let publish = () => {};
    subscribeBet.mockImplementation((_code, onChange) => {
      publish = () => onChange(openBet);
      return () => {};
    });
    renderAt('/t/abc123', <TallyScreen />);
    act(() => {
      publish();
    });
    expect(screen.queryByText('Who is late')).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(449);
    });
    expect(screen.getByText('Friendly')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText('Who is late')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('reduced motion keeps the tally loader static', () => {
  const css = fs.readFileSync(path.join(__dirname, 'phone.css'), 'utf8');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  expect(css).toContain('@keyframes friendly-load-pulse');
  expect(css).toContain('opacity: 0.4');
  expect(css).toContain('color: #007a45');
  expect(reduced).toContain('.friendly-load-bar');
  expect(reduced).toContain('animation: none');
});

test('live bar changes ease in, and hold still under reduced motion', () => {
  const css = fs.readFileSync(path.join(__dirname, 'phone.css'), 'utf8');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  expect(css).toMatch(/\.bar-fill \{[^}]*transition: width/);
  expect(reduced).toContain('.bar-fill');
  expect(reduced).toContain('transition: none');
});

test('vote shows the Friendly loader instead of a loading line', () => {
  subscribeBet.mockImplementation(() => () => {});
  renderAt('/b/abc123', <VoteScreen />);
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  expect(screen.getByText('Friendly')).toHaveClass('friendly-load-mark');
  expect(document.querySelectorAll('.friendly-load-bar')).toHaveLength(3);
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  expect(screen.queryByText('Who is late')).not.toBeInTheDocument();
});

test('the loader holds for at least 450ms before the vote appears', () => {
  jest.useFakeTimers();
  try {
    let publish = () => {};
    subscribeBet.mockImplementation((_code, onChange) => {
      publish = () => onChange(openBet);
      return () => {};
    });
    renderAt('/b/abc123', <VoteScreen />);
    act(() => {
      publish();
    });
    expect(screen.queryByText('Who is late')).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(449);
    });
    expect(screen.getByText('Friendly')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText('Who is late')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

function finishedBet(winnerId = 'a') {
  const bet = {
    ...openBet, stake: '$20 pot',
    votes: [
      { voterId: 'user-1', name: 'Jack', optionId: 'a' },
      { voterId: 'sam', name: 'Sam', optionId: 'b' },
    ],
  };
  return { ...bet, status: 'closed', winnerId, settledAt: 123, settlement: buildSettlement(bet, winnerId) };
}

test('the creator previews, confirms, and gets the committed result immediately', async () => {
  settleBet.mockResolvedValue(finishedBet('b'));
  renderAt('/t/abc123', <TallyScreen />);
  await userEvent.click(await screen.findByRole('button', { name: 'Close & settle' }));
  await userEvent.click(screen.getByRole('button', { name: 'No' }));
  expect(screen.getByRole('region', { name: 'Result preview' })).toBeInTheDocument();
  expect(settleBet).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Settle & notify' }));
  expect(await screen.findByRole('heading', { name: 'Sam won the $20 pot' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close & settle' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Share the result' }));
  expect(shareMessage).toHaveBeenCalledWith(expect.stringContaining('Closed · Sam won the $20 pot'));
  expect(shareMessage).toHaveBeenCalledWith(expect.not.stringContaining('Make your call'));
});

test('failed settlement keeps the preview available and does not claim a result', async () => {
  settleBet.mockRejectedValue(new Error('Could not settle. Try again.'));
  renderAt('/t/abc123', <TallyScreen />);
  await userEvent.click(await screen.findByRole('button', { name: 'Close & settle' }));
  await userEvent.click(screen.getByRole('button', { name: 'No' }));
  await userEvent.click(screen.getByRole('button', { name: 'Settle & notify' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not settle. Try again.');
  expect(screen.getByRole('button', { name: 'Settle & notify' })).toBeEnabled();
  expect(screen.queryByRole('region', { name: 'Settled result' })).not.toBeInTheDocument();
});

test.each([
  ['a', 'You called it.'],
  ['b', 'This one’s settled. Thanks for being in.'],
])('a participant sees the %s outcome directly on the original invite link', async (winnerId, copy) => {
  subscribeBet.mockImplementation((_code, onChange) => { onChange(finishedBet(winnerId)); return () => {}; });
  renderAt('/b/abc123', <VoteScreen />);
  expect(await screen.findByRole('region', { name: 'Settled result' })).toHaveTextContent(copy);
  expect(screen.queryByText(/you're on/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Share the result' })).toBeInTheDocument();
});

test('an expired deadline is waiting for a result, never a winner notification', async () => {
  subscribeBet.mockImplementation((_code, onChange) => { onChange({ ...openBet, closesAt: 1 }); return () => {}; });
  renderAt('/b/abc123', <VoteScreen />);
  expect(await screen.findByText('Picks are closed. The final call is coming.')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Settled result' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Share the result' })).not.toBeInTheDocument();
});

test('result sharing falls back to copyable final-result text', async () => {
  subscribeBet.mockImplementation((_code, onChange) => { onChange(finishedBet()); return () => {}; });
  shareMessage.mockResolvedValue('manual');
  renderAt('/b/abc123', <VoteScreen />);
  await userEvent.click(await screen.findByRole('button', { name: 'Share the result' }));
  expect(await screen.findByText('Copy this into the group chat.')).toBeInTheDocument();
  expect(document.querySelector('.manual-message')).toHaveTextContent('Closed · Jack won the $20 pot');
});

describe('text me who won', () => {
  const flag = process.env.NEXT_PUBLIC_RESULT_TEXTS;
  const voter = { uid: 'anon-1', isAnonymous: true, providerData: [] };
  const votedBet = { ...openBet, votes: [{ voterId: 'anon-1', name: 'Sam', optionId: 'a' }] };
  let publish;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_RESULT_TEXTS = '1';
    localStorage.clear();
    useIdentity.mockReturnValue(voter);
    saveResultText.mockReset();
    saveResultText.mockResolvedValue(undefined);
    subscribeBet.mockImplementation((_code, onChange) => {
      publish = (bet) => act(() => onChange(bet));
      onChange(openBet);
      return () => {};
    });
  });

  afterEach(() => {
    if (flag === undefined) delete process.env.NEXT_PUBLIC_RESULT_TEXTS;
    else process.env.NEXT_PUBLIC_RESULT_TEXTS = flag;
  });

  const card = () => screen.queryByRole('heading', { name: RESULT_TEXT_COPY.heading });
  const field = () => screen.getByRole('textbox', { name: RESULT_TEXT_COPY.heading });

  async function renderVoted() {
    subscribeBet.mockImplementation((_code, onChange) => {
      publish = (bet) => act(() => onChange(bet));
      onChange(votedBet);
      return () => {};
    });
    renderAt('/b/abc123', <VoteScreen />);
    expect(await screen.findByRole('heading', { name: RESULT_TEXT_COPY.heading })).toBeInTheDocument();
  }

  test('appears only after the pick is recorded, and voting stays one tap', async () => {
    renderAt('/b/abc123', <VoteScreen />);
    await screen.findByRole('button', { name: 'Yes' });
    expect(card()).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(castVote).toHaveBeenCalledTimes(1);
    expect(castVote).toHaveBeenCalledWith('abc123', { voterId: 'anon-1', name: 'Sam', optionId: 'a' });
    expect(await screen.findByText(/you're on/i)).toHaveTextContent('Yes');
    // A pending click is not a recorded vote.
    expect(card()).not.toBeInTheDocument();
    expect(saveResultText).not.toHaveBeenCalled();

    publish(votedBet);
    expect(card()).toBeInTheDocument();
    expect(field()).toHaveAttribute('type', 'tel');
    expect(field()).toHaveAttribute('inputmode', 'tel');
    expect(field()).toHaveAttribute('autocomplete', 'tel-national');
    expect(field()).toHaveAttribute('placeholder', '(555) 555-0100');
    expect(screen.getByText('+1')).toHaveClass('phone-cc');
    expect(screen.getByText(RESULT_TEXT_COPY.privacy)).toHaveClass('muted');
    const send = screen.getByRole('button', { name: 'Text me' });
    expect(send).toHaveClass('cta', 'press');
    expect(document.querySelectorAll('.result-text-card .cta')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'No thanks' })).not.toHaveClass('cta');
  });

  test('No thanks collapses the card for this bet and leaves the tally alone', async () => {
    await renderVoted();
    await userEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(card()).not.toBeInTheDocument();
    expect(screen.getByText(/you're on/i)).toHaveTextContent('Yes');
    expect(screen.getByRole('link', { name: 'See the picks' })).toBeInTheDocument();
    expect(localStorage.getItem('fb.resultText.abc123')).toBe('skipped');
    expect(saveResultText).not.toHaveBeenCalled();
  });

  test('a skipped card stays hidden on revisit', async () => {
    localStorage.setItem('fb.resultText.abc123', 'skipped');
    subscribeBet.mockImplementation((_code, onChange) => { onChange(votedBet); return () => {}; });
    renderAt('/b/abc123', <VoteScreen />);
    expect(await screen.findByText(/you're on/i)).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
  });

  test('Text me saves the number, shows Saving…, then the confirmation', async () => {
    let finish;
    saveResultText.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await renderVoted();
    await userEvent.type(field(), '2025550143');
    expect(field()).toHaveValue('(202) 555-0143');
    await userEvent.click(screen.getByRole('button', { name: 'Text me' }));
    expect(saveResultText).toHaveBeenCalledWith('abc123', '+12025550143');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await act(async () => finish());
    expect(await screen.findByText('You’re set. We’ll text you who won.')).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
    expect(localStorage.getItem('fb.resultText.abc123')).toBe('saved');
    expect(document.body.textContent).not.toMatch(/555|0143/);
  });

  test('a revisit after saving shows the confirmation, not the field', async () => {
    localStorage.setItem('fb.resultText.abc123', 'saved');
    subscribeBet.mockImplementation((_code, onChange) => { onChange(votedBet); return () => {}; });
    renderAt('/b/abc123', <VoteScreen />);
    expect(await screen.findByText(RESULT_TEXT_COPY.confirmed)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: RESULT_TEXT_COPY.heading })).not.toBeInTheDocument();
  });

  const textMe = () => screen.getByRole('button', { name: 'Text me' });

  async function failSave(rejection) {
    await renderVoted();
    await userEvent.type(field(), '2025550143');
    saveResultText.mockRejectedValueOnce(rejection);
    await userEvent.click(textMe());
    return screen.findByRole('alert');
  }

  test('a save error sits right under the phone field in the sign-in error style', async () => {
    const alert = await failSave(new Error('boom'));
    expect(alert.tagName).toBe('P');
    expect(alert).toHaveClass('form-error');
    expect(alert.previousElementSibling).toBe(field().closest('label.field'));
    expect(alert.nextElementSibling).toHaveTextContent(RESULT_TEXT_COPY.privacy);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAttribute('aria-describedby', alert.id);
    expect(alert.id).not.toBe('');
  });

  test('editing the field clears the error', async () => {
    await failSave(new Error('boom'));
    await userEvent.type(field(), '1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(field()).not.toHaveAttribute('aria-describedby');
  });

  test('bad numbers reuse the phone sign-in line', () => {
    expect(RESULT_TEXT_COPY.invalid).toBe('Enter a US phone number.');
    expect(RESULT_TEXT_COPY.invalid).toBe(PHONE_INVALID_ERROR);
    const authSlides = fs.readFileSync(path.join(__dirname, 'AuthSlides.jsx'), 'utf8');
    expect(authSlides).toContain('setError(PHONE_INVALID_ERROR)');
    expect(authSlides).not.toContain('Enter a US phone number.');
  });

  test('an invalid number shows the invalid line without calling the server', async () => {
    await renderVoted();
    await userEvent.type(field(), '1025550143');
    await userEvent.click(textMe());
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(PHONE_INVALID_ERROR);
    expect(alert).toHaveClass('form-error');
    expect(saveResultText).not.toHaveBeenCalled();
  });

  test('a server-rejected number shows the sign-in invalid line', async () => {
    const alert = await failSave(Object.assign(new Error('bad'), { code: 'invalid-phone' }));
    expect(alert.textContent).toBe(PHONE_INVALID_ERROR);
    expect(textMe()).toBeEnabled();
  });

  test('a network failure shows the sign-in offline line', async () => {
    expect(RESULT_TEXT_COPY.offline).toBe(PHONE_OFFLINE_ERROR);
    expect(phoneError({ code: 'auth/network-request-failed' }).message).toBe(RESULT_TEXT_COPY.offline);
    const alert = await failSave(Object.assign(new Error('Could not reach the server.'), { code: 'network' }));
    expect(alert.textContent).toBe('You\u2019re offline. Try again.');
  });

  test('a browser that reports offline shows the offline line', async () => {
    const onLine = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      const alert = await failSave(Object.assign(new Error('nope'), { code: 'save-failed' }));
      expect(alert.textContent).toBe(RESULT_TEXT_COPY.offline);
    } finally {
      onLine.mockRestore();
    }
  });

  test.each([
    ['a server failure', Object.assign(new Error('Could not save that number.'), { code: 'save-failed' })],
    ['a missing session', new Error('Still connecting. Try again.')],
  ])('%s shows the generic save line', async (_name, rejection) => {
    const alert = await failSave(rejection);
    expect(RESULT_TEXT_COPY.saveFailed).toBe('Couldn\u2019t save that number. Try again.');
    expect(alert.textContent).toBe('Couldn\u2019t save that number. Try again.');
    expect(textMe()).toBeEnabled();
  });

  test('a failed save leaves the recorded vote alone', async () => {
    renderAt('/b/abc123', <VoteScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Yes' }));
    publish(votedBet);
    expect(castVote).toHaveBeenCalledTimes(1);

    await userEvent.type(field(), '2025550143');
    saveResultText.mockRejectedValueOnce(new Error('boom'));
    await userEvent.click(textMe());
    expect(await screen.findByRole('alert')).toHaveTextContent(RESULT_TEXT_COPY.saveFailed);

    expect(castVote).toHaveBeenCalledTimes(1);
    expect(settleBet).not.toHaveBeenCalled();
    expect(screen.getByText(/you're on/i)).toHaveTextContent('Yes');
    expect(screen.getByRole('link', { name: 'See the picks' })).toBeInTheDocument();
    expect(localStorage.getItem('fb.resultText.abc123')).toBeNull();
  });

  test('No thanks still works after a failed save', async () => {
    await failSave(new Error('boom'));
    const skip = screen.getByRole('button', { name: 'No thanks' });
    expect(skip).toBeEnabled();
    await userEvent.click(skip);
    expect(card()).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem('fb.resultText.abc123')).toBe('skipped');
    expect(screen.getByText(/you're on/i)).toHaveTextContent('Yes');
    expect(castVote).not.toHaveBeenCalled();
  });

  test.each([
    ['the flag is off', () => { delete process.env.NEXT_PUBLIC_RESULT_TEXTS; }],
    ['the voter is a local fallback id', () => { useIdentity.mockReturnValue({ uid: 'anon-1', isLocal: true }); }],
  ])('is never shown when %s', async (_name, setup) => {
    setup();
    subscribeBet.mockImplementation((_code, onChange) => { onChange(votedBet); return () => {}; });
    renderAt('/b/abc123', <VoteScreen />);
    expect(await screen.findByText(/you're on/i)).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
  });

  test('is never shown on a settled bet', async () => {
    const settled = { ...votedBet, status: 'closed', winnerId: 'a', settledAt: 1, settlement: buildSettlement(votedBet, 'a') };
    subscribeBet.mockImplementation((_code, onChange) => { onChange(settled); return () => {}; });
    renderAt('/b/abc123', <VoteScreen />);
    expect(await screen.findByRole('region', { name: 'Settled result' })).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
  });

  test('the tally never renders a saved number', async () => {
    subscribeBet.mockImplementation((_code, onChange) => { onChange(votedBet); return () => {}; });
    renderAt('/t/abc123', <TallyScreen />);
    expect(await screen.findByText('Who is late')).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\+1|555|0143/);
  });
});

describe('live results after voting', () => {
  let feeds;
  const live = () => feeds.filter((feed) => !feed.unsubscribe.mock.calls.length);
  // meta mirrors subscribeBet's third argument; fromCache marks an offline miss.
  const push = async (bet, err, meta = { fromCache: false }) => {
    await act(async () => {
      live().forEach((feed) => feed.onChange(bet, err, meta));
    });
  };
  const counts = () => [...document.querySelectorAll('.bar-count')].map((node) => node.textContent);
  const widths = () => [...document.querySelectorAll('.bar-fill')].map((node) => node.style.width);
  const votes = [
    { voterId: 'user-1', name: 'Jack', optionId: 'a' },
    { voterId: 'sam', name: 'Sam', optionId: 'b' },
  ];
  const votedBet = { ...openBet, votes };

  beforeEach(() => {
    feeds = [];
    subscribeBet.mockImplementation((code, onChange) => {
      const feed = { code, onChange, unsubscribe: jest.fn() };
      feeds.push(feed);
      onChange(votedBet);
      return feed.unsubscribe;
    });
  });

  afterEach(() => {
    cleanup();
    feeds.forEach((feed) => expect(feed.unsubscribe).toHaveBeenCalledTimes(1));
    delete document.visibilityState;
  });

  test('counts and bars follow new picks, and unmount unsubscribes', async () => {
    const removed = jest.spyOn(document, 'removeEventListener');
    try {
      const { unmount } = renderAt('/b/abc123', <VoteScreen />);
      expect(await screen.findByText(/you're on/i)).toHaveTextContent('Yes');
      expect(counts()).toEqual(['1 · 50%', '1 · 50%']);

      await push({ ...votedBet, votes: [...votes, { voterId: 'kim', name: 'Kim', optionId: 'b' }, { voterId: 'lee', name: 'Lee', optionId: 'b' }] });
      expect(counts()).toEqual(['1 · 25%', '3 · 75%']);
      expect(widths()).toEqual(['25%', '75%']);
      expect(feeds).toHaveLength(1);

      unmount();
      expect(feeds[0].unsubscribe).toHaveBeenCalledTimes(1);
      expect(removed).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    } finally {
      removed.mockRestore();
    }
  });

  test('a snapshot error keeps the last results with no new error', async () => {
    renderAt('/b/abc123', <VoteScreen />);
    expect(await screen.findByText(/you're on/i)).toBeInTheDocument();
    await push(undefined, new Error('offline'));
    await push(null, undefined, { fromCache: true });
    expect(screen.getByText(/you're on/i)).toHaveTextContent('Yes');
    expect(counts()).toEqual(['1 · 50%', '1 · 50%']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('This bet’s off the table.')).not.toBeInTheDocument();
  });

  test('a delete the server confirms shows the not-found screen live', async () => {
    renderAt('/b/abc123', <VoteScreen />);
    expect(await screen.findByText(/you're on/i)).toBeInTheDocument();
    await push(null);
    expect(screen.getByText('This bet’s off the table.')).toBeInTheDocument();
    expect(screen.getByText('It was deleted, or the link’s not quite right.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a bet' })).toHaveAttribute('href', '/new');
    expect(screen.queryByText(/you're on/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('coming back to the tab resubscribes and the settled result lands live', async () => {
    renderAt('/b/abc123', <VoteScreen />);
    expect(await screen.findByText(/you're on/i)).toBeInTheDocument();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(feeds).toHaveLength(2);
    expect(live()).toEqual([feeds[1]]);

    await push({ ...votedBet, status: 'closed', winnerId: 'a', settledAt: 1, settlement: buildSettlement(votedBet, 'a') });
    expect(screen.getByRole('region', { name: 'Settled result' })).toHaveTextContent('You called it.');
    expect(screen.getByText('Final tally')).toBeInTheDocument();
    expect(screen.queryByText(/you're on/i)).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Picked by Jack' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Picked by Sam' })).toBeInTheDocument();
  });

  test('the You’re on view keeps counts only, without voter names', async () => {
    renderAt('/b/abc123', <VoteScreen />);
    expect(await screen.findByText(/you're on/i)).toHaveTextContent('Yes');
    expect(document.querySelector('.voter-list')).toBeNull();
  });
});

test('the vote screen header carries the Results menu', async () => {
  renderAt('/b/abc123', <VoteScreen />);
  expect(within(await screen.findByRole('banner')).getByTestId('results-menu')).toBeInTheDocument();
});

describe('your own pick counts right away', () => {
  let feeds;
  let settle;
  const live = () => feeds.filter((feed) => !feed.unsubscribe.mock.calls.length);
  const push = async (bet, err, meta = { fromCache: false }) => {
    await act(async () => {
      live().forEach((feed) => feed.onChange(bet, err, meta));
    });
  };
  const counts = () => [...document.querySelectorAll('.bar-count')].map((node) => node.textContent);
  const widths = () => [...document.querySelectorAll('.bar-fill')].map((node) => node.style.width);
  const mine = { voterId: 'user-1', name: 'Sam', optionId: 'a' };
  const vote = async () => {
    renderAt('/b/abc123', <VoteScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Yes' }));
  };

  beforeEach(() => {
    feeds = [];
    subscribeBet.mockImplementation((code, onChange) => {
      const feed = { code, onChange, unsubscribe: jest.fn() };
      feeds.push(feed);
      onChange(openBet);
      return feed.unsubscribe;
    });
    castVote.mockImplementation(() => new Promise((resolve, reject) => {
      settle = { resolve, reject };
    }));
  });

  afterEach(() => {
    cleanup();
    castVote.mockImplementation(async () => {});
  });

  test('the results view shows your pick before any snapshot has it', async () => {
    await vote();
    expect(screen.getByText(/you're on/i)).toHaveTextContent('Yes');
    expect(counts()).toEqual(['1 · 100%', '0 · 0%']);
    expect(widths()).toEqual(['100%', '0%']);
    expect(screen.queryByText('0 · 0%', { selector: '.mine .bar-count' })).not.toBeInTheDocument();
    await act(async () => settle.resolve());
    expect(counts()).toEqual(['1 · 100%', '0 · 0%']);
  });

  test('a snapshot with your pick is used as-is, never double counted', async () => {
    await vote();
    await act(async () => settle.resolve());
    await push({ ...openBet, votes: [mine] });
    expect(counts()).toEqual(['1 · 100%', '0 · 0%']);
    await push({ ...openBet, votes: [mine, { voterId: 'kim', name: 'Kim', optionId: 'b' }] });
    expect(counts()).toEqual(['1 · 50%', '1 · 50%']);
  });

  test('another pick landing first adds to yours', async () => {
    await vote();
    await push({ ...openBet, votes: [{ voterId: 'kim', name: 'Kim', optionId: 'b' }] });
    expect(counts()).toEqual(['1 · 50%', '1 · 50%']);
    expect(widths()).toEqual(['50%', '50%']);
    await act(async () => settle.resolve());
    await push({ ...openBet, votes: [{ voterId: 'kim', name: 'Kim', optionId: 'b' }, mine] });
    expect(counts()).toEqual(['1 · 50%', '1 · 50%']);
  });

  test('a failed pick drops the optimistic count and shows the usual error', async () => {
    await vote();
    expect(counts()).toEqual(['1 · 100%', '0 · 0%']);
    await act(async () => settle.reject(new Error('This bet is closed.')));
    expect(screen.getByRole('alert')).toHaveTextContent('This bet is closed.');
    expect(screen.queryByText(/you're on/i)).not.toBeInTheDocument();
    expect(counts()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled();

    // A later pick that lands still counts only once.
    await userEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(counts()).toEqual(['0 · 0%', '1 · 100%']);
  });

  test('a failed pick with no message keeps the fallback line', async () => {
    await vote();
    await act(async () => settle.reject({}));
    expect(screen.getByRole('alert')).toHaveTextContent('Your pick didn’t stick. Give it another go.');
    expect(screen.queryByText(/you're on/i)).not.toBeInTheDocument();
  });

  test('a snapshot error or offline miss keeps your pick and the last tally', async () => {
    await vote();
    await push({ ...openBet, votes: [{ voterId: 'kim', name: 'Kim', optionId: 'b' }] });
    await push(undefined, new Error('offline'));
    await push(null, undefined, { fromCache: true });
    expect(screen.getByText(/you're on/i)).toHaveTextContent('Yes');
    expect(counts()).toEqual(['1 · 50%', '1 · 50%']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => settle.resolve());
    expect(counts()).toEqual(['1 · 50%', '1 · 50%']);
  });

  test('a delete the server confirms still shows the not-found screen', async () => {
    await vote();
    await push(null);
    expect(screen.getByText('This bet’s off the table.')).toBeInTheDocument();
    expect(screen.queryByText(/you're on/i)).not.toBeInTheDocument();
  });
});

test('a mistyped code shows the not-found screen with a way to start a bet', async () => {
  subscribeBet.mockImplementation((_code, onChange) => {
    onChange(null, undefined, { fromCache: false });
    return () => {};
  });
  renderAt('/b/nope99', <VoteScreen />);
  expect(await screen.findByText('This bet’s off the table.')).toBeInTheDocument();
  expect(screen.getByText('It was deleted, or the link’s not quite right.')).toBeInTheDocument();
  const start = screen.getByRole('link', { name: 'Start a bet' });
  expect(start).toHaveAttribute('href', '/new');
  expect(start).toHaveClass('cta');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
