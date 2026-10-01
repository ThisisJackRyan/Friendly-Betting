import { render, screen } from '@testing-library/react';
import MyBets from './MyBets';
import { subscribeMyBets } from './api';

jest.mock('next/link');

jest.mock('./phoneAuth', () => ({
  sendPhoneCode: jest.fn(),
  confirmPhoneCode: jest.fn(),
}));

jest.mock('./identity', () => ({
  useIdentity: () => ({ uid: 'anon-1', isAnonymous: true, providerData: [] }),
}));

jest.mock('./api', () => ({
  subscribeMyBets: jest.fn(() => () => {}),
}));

test('my bets asks for a phone before it lists bets', () => {
  render(<MyBets />);
  expect(screen.getByText("We'll text a code.")).toBeInTheDocument();
  expect(screen.getByText('Friends still vote with one tap — no account.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send code' })).toHaveClass('cta');
  expect(screen.getByLabelText('Phone number')).toHaveValue('+1 ');
  expect(screen.queryByRole('heading', { name: 'My bets' })).not.toBeInTheDocument();
  expect(screen.queryByText(/no bets yet/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  expect(subscribeMyBets).not.toHaveBeenCalled();
});
