import fs from 'fs';
import path from 'path';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoteScreen from './VoteScreen';
import TallyScreen from './TallyScreen';
import { castVote, settleBet, subscribeBet } from './api';
import { useIdentity } from './identity';
import { shareMessage } from './share';
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

jest.mock('./identity', () => ({
  useIdentity: jest.fn(() => ({ uid: 'user-1' })),
  rememberName: jest.fn(),
  savedName: () => 'Sam',
  creatorName: () => 'Sam',
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'copied'),
}));

beforeEach(() => {
  useIdentity.mockReturnValue({ uid: 'user-1' });
  subscribeBet.mockImplementation((_code, onChange) => {
    onChange(openBet);
    return () => {};
  });
  shareMessage.mockReset();
  shareMessage.mockResolvedValue('copied');
  castVote.mockClear();
  settleBet.mockClear();
});

function renderAt(path, element) {
  navigation.pathname = path;
  navigation.params = { code: path.split('/').pop() };
  return render(element);
}

test('a shared link opens the vote screen and records a one-tap choice', async () => {
  renderAt('/b/abc123', <VoteScreen />);
  expect(screen.getByText('Maya')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Who is late' })).toBeInTheDocument();
  expect(screen.queryByText(/place bet/i)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
  expect(castVote).toHaveBeenCalledWith('abc123', {
    voterId: 'user-1',
    name: 'Sam',
    optionId: 'a',
  });
  expect(await screen.findByText(/you're on/i)).toHaveTextContent('Yes');
  expect(screen.getByRole('link', { name: 'Tally' })).toBeInTheDocument();
});

const textFriendsMessage = [
  'Who is late?',
  '1. Yes',
  '2. No',
  'a coffee',
  'Vote here: http://localhost/b/abc123',
].join('\n');

test('the creator can close and settle from the tally', async () => {
  renderAt('/t/abc123', <TallyScreen />);
  expect(screen.getByRole('heading', { name: 'Tally' })).toBeInTheDocument();
  expect(await screen.findByText('Who is late')).toBeInTheDocument();
  const share = screen.getByRole('button', { name: 'Share' });
  const close = screen.getByRole('button', { name: /close & settle/i });
  expect(share).toHaveClass('cta', 'press');
  expect(close).toHaveClass('danger', 'press');
  expect(share.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await userEvent.click(close);
  await userEvent.click(screen.getByRole('button', { name: 'No' }));
  expect(settleBet).toHaveBeenCalledWith('abc123', 'b');
  expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
});

test('anyone can share the text-friends message from the tally', async () => {
  useIdentity.mockReturnValue({ uid: 'guest' });
  renderAt('/t/abc123', <TallyScreen />);
  const share = await screen.findByRole('button', { name: 'Share' });
  expect(screen.queryByRole('button', { name: /close & settle/i })).not.toBeInTheDocument();
  await userEvent.click(share);
  expect(shareMessage).toHaveBeenCalledWith(textFriendsMessage);
  expect(await screen.findByText('Copied — paste into a text.')).toBeInTheDocument();
});

test('a manual share shows the message under the tally', async () => {
  shareMessage.mockResolvedValue('manual');
  renderAt('/t/abc123', <TallyScreen />);
  await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
  expect(await screen.findByText('Copy the message below.')).toBeInTheDocument();
  expect(document.querySelector('.manual-message')).toHaveTextContent(textFriendsMessage, {
    normalizeWhitespace: false,
  });
});

test('tally shows the Friendly loader instead of a loading line', () => {
  subscribeBet.mockImplementation(() => () => {});
  renderAt('/t/abc123', <TallyScreen />);
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  expect(screen.getByText('Friendly')).toHaveClass('tally-load-mark');
  expect(document.querySelectorAll('.tally-load-bar')).toHaveLength(3);
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
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
  expect(css).toContain('@keyframes tally-load-pulse');
  expect(css).toContain('opacity: 0.4');
  expect(css).toContain('color: #007a45');
  expect(reduced).toContain('.tally-load-bar');
  expect(reduced).toContain('animation: none');
});
