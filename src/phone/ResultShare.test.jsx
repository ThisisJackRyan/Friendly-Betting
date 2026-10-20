import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultShare from './ResultShare';
import { shareMessage } from './share';
import { shareImage } from './imageShare';
import { renderWinnerCard } from './winnerCardImage';
import { buildSettlement } from './settlement';

jest.mock('./share', () => ({ shareMessage: jest.fn(async () => 'shared') }));
jest.mock('./imageShare', () => ({ shareImage: jest.fn(async () => 'shared') }));

const OPTIONS = [{ id: 'a', label: 'Chiefs -3' }, { id: 'b', label: 'Bills +3' }];
const open = {
  id: 'abc123', code: 'abc123', schemaVersion: 2, question: 'Chiefs cover -3?', stake: '$20',
  createdByID: 'jack', status: 'open', options: OPTIONS,
  votes: [{ voterId: 'maya', name: 'Maya', optionId: 'a' }, { voterId: 'zed', name: 'Zed', optionId: 'b' }],
};
const settledBet = { ...open, status: 'closed', winnerId: 'a', settledAt: 1, settlement: buildSettlement(open, 'a') };
const png = new Blob(['png'], { type: 'image/png' });

beforeEach(() => {
  shareMessage.mockClear();
  shareImage.mockReset();
  shareImage.mockResolvedValue('shared');
  renderWinnerCard.mockReset();
  renderWinnerCard.mockResolvedValue(png);
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
});

const imageButton = () => screen.getByRole('button', { name: 'Share as image' });

test('a settled bet offers Share as image under Share the result, and draws the card up front', async () => {
  render(<ResultShare bet={settledBet} code="abc123" />);
  expect(screen.getByRole('button', { name: 'Share the result' }).nextElementSibling).toBe(imageButton());
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
  expect(renderWinnerCard).toHaveBeenCalledWith(settledBet);
  await act(async () => {});
});

test.each([
  ['open', open],
  ['called off', { ...settledBet, calledOff: true }],
  ['called off by status', { ...settledBet, status: 'called-off' }],
])('%s: no Share as image, and no card drawn', (_label, bet) => {
  render(<ResultShare bet={bet} code="abc123" />);
  expect(screen.getByRole('button', { name: 'Share the result' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Share as image' })).not.toBeInTheDocument();
  expect(renderWinnerCard).not.toHaveBeenCalled();
});

test('tapping it shares the drawn PNG', async () => {
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(shareImage).toHaveBeenCalledWith(png);
  expect(renderWinnerCard).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('The group chat gets the final word.');
  expect(shareMessage).not.toHaveBeenCalled();
});

test.each([
  ['aborted', 'All good. The result’s here when you’re ready.'],
  ['downloaded', 'Image saved. Drop it in the group chat.'],
  ['failed', 'Couldn’t make the image. Share the result instead.'],
])('%s shows its note', async (outcome, note) => {
  shareImage.mockResolvedValue(outcome);
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(screen.getByRole('status')).toHaveTextContent(note);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('in the app without a file share sheet, the card shows to press and hold', async () => {
  shareImage.mockResolvedValue('preview');
  const { unmount } = render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(screen.getByRole('status')).toHaveTextContent('Press and hold the card to save it.');
  expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:preview');
  expect(URL.createObjectURL).toHaveBeenCalledWith(png);
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});

test('a card that could not be drawn hands nothing on, and ends in the failed note', async () => {
  renderWinnerCard.mockRejectedValue(new Error('no canvas'));
  shareImage.mockImplementation(async (blob) => (blob ? 'shared' : 'failed'));
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(shareImage).toHaveBeenCalledWith(null);
  expect(screen.getByRole('status')).toHaveTextContent('Couldn’t make the image. Share the result instead.');
  expect(imageButton()).toBeEnabled();
});

test('a share that throws never reaches the screen as an error', async () => {
  shareImage.mockRejectedValue(new Error('boom'));
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(screen.getByRole('status')).toHaveTextContent('Couldn’t make the image. Share the result instead.');
  expect(imageButton()).toBeEnabled();
});

test('while the image is on its way both buttons wait', async () => {
  let finish;
  shareImage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(imageButton());
  expect(screen.getByRole('button', { name: 'Getting it ready…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Share the result' })).toBeDisabled();
  await act(async () => finish('shared'));
  expect(imageButton()).toBeEnabled();
});

test('Share the result still sends the text', async () => {
  render(<ResultShare bet={settledBet} code="abc123" />);
  await userEvent.click(screen.getByRole('button', { name: 'Share the result' }));
  expect(shareMessage).toHaveBeenCalledWith(expect.stringMatching(/^FRIENDLY · Closed · Maya won\n/));
  expect(shareImage).not.toHaveBeenCalled();
});
