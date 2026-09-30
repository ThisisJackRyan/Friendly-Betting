import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

jest.mock('./phone/api', () => ({
  subscribeMyBets: (_uid, onChange) => {
    onChange([]);
    return () => {};
  },
  subscribeBet: () => () => {},
  hydrateBet: async (bet) => bet,
  saveBet: jest.fn(),
  castVote: jest.fn(),
  settleBet: jest.fn(),
}));

jest.mock('./phone/identity', () => ({
  useIdentity: () => ({ uid: 'user-1', email: 'sam@example.com' }),
  creatorName: () => 'Sam',
  rememberName: () => {},
  savedName: () => '',
  watchIdentity: () => () => {},
}));

test('opens on New bet with all three types and a Create / My bets tab bar', async () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'New bet' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /money line/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /over-under/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /prop/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /create/i })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('link', { name: /my bets/i }));
  expect(await screen.findByRole('heading', { name: 'My bets' })).toBeInTheDocument();
  expect(await screen.findByText(/no bets yet/i)).toBeInTheDocument();
});
