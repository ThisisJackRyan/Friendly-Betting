import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoteScreen from './VoteScreen';
import TallyScreen from './TallyScreen';
import { castVote, settleBet } from './api';

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
  subscribeBet: (_code, onChange) => {
    onChange(openBet);
    return () => {};
  },
  hydrateBet: async (bet) => bet,
  castVote: jest.fn(async () => {}),
  settleBet: jest.fn(async () => {}),
}));

jest.mock('./identity', () => ({
  useIdentity: () => ({ uid: 'user-1' }),
  rememberName: jest.fn(),
  savedName: () => 'Sam',
  creatorName: () => 'Sam',
}));

function renderAt(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/b/:code" element={element} />
        <Route path="/t/:code" element={element} />
      </Routes>
    </MemoryRouter>,
  );
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

test('the creator can close and settle from the tally', async () => {
  renderAt('/t/abc123', <TallyScreen />);
  expect(screen.getByRole('heading', { name: 'Tally' })).toBeInTheDocument();
  expect(screen.getByText('Who is late')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /close & settle/i }));
  await userEvent.click(screen.getByRole('button', { name: 'No' }));
  expect(settleBet).toHaveBeenCalledWith('abc123', 'b');
});
