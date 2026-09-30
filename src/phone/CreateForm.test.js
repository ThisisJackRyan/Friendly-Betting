import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateForm from './CreateForm';
import { saveBet } from './api';
import { shareMessage } from './share';
import { navigation } from 'next/navigation';

jest.mock('next/navigation');
jest.mock('next/link');

jest.mock('./api', () => ({
  saveBet: jest.fn(),
}));

jest.mock('./identity', () => ({
  useIdentity: () => ({ uid: 'user-1', email: 'sam@example.com' }),
  creatorName: () => 'Sam',
  rememberName: () => {},
  savedName: () => '',
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'copied'),
}));

beforeEach(() => {
  saveBet.mockReset();
  saveBet.mockResolvedValue('abc123');
  shareMessage.mockReset();
  shareMessage.mockResolvedValue('copied');
});

function renderForm(path) {
  const type = path.split('/').pop();
  navigation.pathname = path;
  navigation.params = { type };
  return render(<CreateForm />);
}

test('money line, over-under, and prop share one form ending in Text friends', () => {
  const { unmount } = renderForm('/new/money-line');
  expect(screen.getByLabelText(/question/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/option a/i)).toHaveValue('Yes');
  expect(screen.getByLabelText(/option b/i)).toHaveValue('No');
  expect(screen.getByLabelText(/stake/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/closes/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /text friends/i })).toBeInTheDocument();
  unmount();

  const { unmount: unmountLine } = renderForm('/new/over-under');
  expect(screen.getByLabelText(/^line$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^over$/i)).toHaveValue('Over');
  expect(screen.getByLabelText(/^under$/i)).toHaveValue('Under');
  unmountLine();

  renderForm('/new/prop');
  expect(screen.getByLabelText(/option 1/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/option 2/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add option/i })).toBeInTheDocument();
});

test('Text friends saves the bet and shares a short vote link', async () => {
  renderForm('/new/money-line');
  await userEvent.type(screen.getByLabelText(/question/i), 'Who is late');
  await userEvent.type(screen.getByLabelText(/stake/i), 'a coffee');
  await userEvent.click(screen.getByRole('button', { name: /text friends/i }));

  expect(saveBet).toHaveBeenCalledWith(null, expect.objectContaining({
    type: 'money-line',
    question: 'Who is late',
    stake: 'a coffee',
    createdByName: 'Sam',
  }));
  expect(await screen.findByRole('link', { name: /\/b\/abc123/ })).toBeInTheDocument();
  expect(shareMessage).toHaveBeenCalledWith(
    'Sam: Who is late? Yes / No — a coffee. Vote: http://localhost/b/abc123',
  );
});
