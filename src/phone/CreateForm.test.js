import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppShell from './AppShell';
import CreateForm from './CreateForm';
import { CreateChromeProvider } from './createChrome';
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
  delete document.documentElement.dataset.arrive;
  navigation.pathname = '/';
  navigation.params = {};
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.back.mockReset();
  saveBet.mockReset();
  saveBet.mockResolvedValue('abc123');
  shareMessage.mockReset();
  shareMessage.mockResolvedValue('copied');
});

function renderForm(path) {
  if (path) {
    const type = path.split('/').pop();
    navigation.pathname = path;
    navigation.params = { type };
  } else {
    navigation.pathname = '/';
    navigation.params = {};
  }
  return render(<CreateForm />);
}

async function goToStake(question = 'Who is late') {
  await userEvent.type(screen.getByLabelText(/question/i), question);
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
}

test('step 1 is the type picker and back returns home', async () => {
  renderForm();
  const home = screen.getByRole('link', { name: 'Friendly' });
  const row = home.closest('.nav-row');
  expect(home).toHaveClass('nav-home');
  expect(home).toHaveAttribute('href', '/');
  expect(home.querySelector('svg')).not.toBeInTheDocument();
  expect(row).toContainElement(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'New bet' })).toHaveClass('nav-title');
  expect(document.querySelector('.stack .wordmark')).not.toBeInTheDocument();
  expect(document.querySelector('h1.screen-title')).not.toBeInTheDocument();
  expect(screen.getByText('Pick a type')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /money line/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /over-under/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /prop/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /text friends/i })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(document.querySelector('.create-pane.is-leaving')).toHaveClass('slide-back');
  expect(document.querySelector('.create-pane.is-entering')).toHaveClass('slide-back');
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/'));
  expect(navigation.push).not.toHaveBeenCalledWith('/bets');
  expect(saveBet).not.toHaveBeenCalled();
});

test('picking a type slides forward into that type’s details', async () => {
  renderForm();
  await userEvent.click(screen.getByRole('button', { name: /over-under/i }));
  expect(navigation.push).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Over-Under' })).toBeInTheDocument();
  expect(document.querySelector('.create-pane.is-entering')).toHaveClass('slide-forward');
  expect(screen.getByLabelText(/line/i)).toBeInTheDocument();
  expect(saveBet).not.toHaveBeenCalled();
});

test('money line, over-under, and prop keep their detail fields', () => {
  const { unmount } = renderForm('/new/money-line');
  expect(screen.getByRole('heading', { name: 'Money Line' })).toBeInTheDocument();
  expect(screen.getByLabelText(/question/i)).toHaveAttribute('placeholder', 'Who shows up last?');
  expect(screen.getByLabelText(/option a/i)).toHaveValue('Yes');
  expect(screen.getByLabelText(/option b/i)).toHaveValue('No');
  expect(screen.queryByLabelText(/stake/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
  unmount();

  const { unmount: unmountLine } = renderForm('/new/over-under');
  expect(screen.getByLabelText(/line/i)).toHaveAttribute('placeholder', '13.5');
  expect(screen.getByLabelText(/^over$/i)).toHaveValue('Over');
  expect(screen.getByLabelText(/^under$/i)).toHaveValue('Under');
  unmountLine();

  renderForm('/new/prop');
  expect(screen.getByLabelText(/option 1/i)).toHaveAttribute('placeholder', 'Maya');
  expect(screen.getByLabelText(/option 2/i)).toHaveAttribute('placeholder', 'Sam');
  expect(screen.getByRole('button', { name: /add option/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /remove option/i })).not.toBeInTheDocument();
});

test('an early Next shows the draft error and blocks an incomplete prop or line', async () => {
  const { unmount } = renderForm('/new/money-line');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Add a question.');
  expect(saveBet).not.toHaveBeenCalled();
  unmount();

  const { unmount: unmountLine } = renderForm('/new/over-under');
  await userEvent.type(screen.getByLabelText(/question/i), 'Rolls');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Add a line.');
  unmountLine();

  renderForm('/new/prop');
  await userEvent.type(screen.getByLabelText(/question/i), 'Who is last');
  await userEvent.type(screen.getByLabelText(/option 1/i), 'Maya');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Add at least two options.');
  await userEvent.click(screen.getByRole('button', { name: /add option/i }));
  expect(screen.getByRole('textbox', { name: /^option 3$/i })).toHaveAttribute('placeholder', 'Sam');
  await userEvent.type(screen.getByRole('textbox', { name: /^option 2$/i }), 'Sam');
  expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(screen.getByRole('button', { name: /add option/i }));
  expect(screen.getByRole('textbox', { name: /^option 4$/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /add option/i })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /remove option 4/i }));
  expect(screen.queryByRole('textbox', { name: /^option 4$/i })).not.toBeInTheDocument();
});

test('back from later steps keeps the draft and slides left to right', async () => {
  renderForm('/new/money-line');
  await goToStake('Who is late');
  expect(document.querySelector('.create-pane.is-entering')).toHaveClass('slide-forward');
  expect(screen.getByRole('heading', { name: 'Stake' })).toBeInTheDocument();
  expect(screen.getByText(/skip if it’s just bragging rights/i)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/^stake$/i), 'Pizza');
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(document.querySelector('.create-pane.is-entering')).toHaveClass('slide-back');
  expect(screen.getByLabelText(/question/i)).toHaveValue('Who is late');
  expect(navigation.push).not.toHaveBeenCalled();
  expect(saveBet).not.toHaveBeenCalled();
});

test('stake step is optional and the recap shows only filled stake and closes', async () => {
  renderForm('/new/money-line');
  await goToStake('Who is late');
  fireEvent.change(screen.getByLabelText(/closes/i), {
    target: { value: '2026-10-02T18:30' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Text friends' })).toBeInTheDocument();
  expect(screen.getByText('Ready to text')).toBeInTheDocument();
  expect(screen.getByText('Who is late')).toBeInTheDocument();
  expect(screen.getByText('Yes / No')).toBeInTheDocument();
  expect(screen.getByText(/^closes /i)).toBeInTheDocument();
  expect(screen.queryByText('Pizza')).not.toBeInTheDocument();
  expect(saveBet).not.toHaveBeenCalled();
});

test('Text friends saves once and keeps the vote link without a second button', async () => {
  let finishSave;
  saveBet.mockImplementation(() => new Promise((resolve) => {
    finishSave = resolve;
  }));
  renderForm('/new/money-line');
  await goToStake('Who is late');
  await userEvent.type(screen.getByLabelText(/^stake$/i), 'a coffee');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(screen.getByRole('button', { name: /text friends/i }));

  expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  finishSave('abc123');

  expect(await screen.findByRole('link', { name: /\/b\/abc123/ })).toBeInTheDocument();
  expect(screen.getByText('Message copied. Paste it into a text.')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /text friends/i })).toHaveLength(1);
  expect(saveBet).toHaveBeenCalledTimes(1);
  expect(saveBet).toHaveBeenCalledWith(null, expect.objectContaining({
    type: 'money-line',
    question: 'Who is late',
    stake: 'a coffee',
    createdByName: 'Sam',
  }));
  expect(shareMessage).toHaveBeenCalledWith(
    'Sam: Who is late? Yes / No — a coffee. Vote: http://localhost/b/abc123',
  );
});

test('over-under still shares the same short vote text', async () => {
  renderForm('/new/over-under');
  await userEvent.type(screen.getByLabelText(/question/i), 'Rolls');
  await userEvent.type(screen.getByLabelText(/line/i), '13.5');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Over 13.5 / Under 13.5')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /text friends/i }));
  expect(shareMessage).toHaveBeenCalledWith(
    'Sam: Rolls? Over 13.5 / Under 13.5. Vote: http://localhost/b/abc123',
  );
});

test('phone tabs hide after step 1 and return when the walkthrough is back on pick type', async () => {
  navigation.pathname = '/new';
  navigation.params = {};
  render(
    <CreateChromeProvider>
      <AppShell>
        <CreateForm />
      </AppShell>
    </CreateChromeProvider>,
  );
  expect(document.querySelector('.app-shell')).toHaveClass('shell-tabs');
  await userEvent.click(screen.getByRole('button', { name: /money line/i }));
  expect(document.querySelector('.app-shell')).toHaveClass('shell-stack');
  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => {
    expect(document.querySelector('.app-shell')).toHaveClass('shell-tabs');
  });
});

test('Friendly in the create nav returns home from every later step', async () => {
  renderForm('/new/prop');

  const homeInNav = () => {
    const link = screen.getByRole('link', { name: 'Friendly' });
    expect(link).toHaveClass('nav-home');
    expect(link.closest('.nav-row')).toContainElement(screen.getByRole('button', { name: 'Back' }));
    return link;
  };

  expect(screen.getByRole('heading', { name: 'Prop' })).toBeInTheDocument();
  homeInNav();

  await userEvent.type(screen.getByLabelText(/question/i), 'Who is last');
  await userEvent.type(screen.getByLabelText(/option 1/i), 'Maya');
  await userEvent.type(screen.getByLabelText(/option 2/i), 'Sam');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Stake' })).toBeInTheDocument();
  homeInNav();

  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Text friends' })).toBeInTheDocument();
  await userEvent.click(homeInNav());
  expect(document.querySelector('.create-pane.is-leaving')).toHaveClass('slide-back');
  expect(document.querySelector('.create-pane.is-entering')).toHaveClass('slide-back');
  expect(document.querySelector('.create-pane.is-entering .landing')).toBeInTheDocument();
  expect(navigation.push).not.toHaveBeenCalled();
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/'));
  expect(navigation.push).not.toHaveBeenCalledWith('/bets');
  expect(saveBet).not.toHaveBeenCalled();
});

test('reduced motion skips the home slide', async () => {
  const previous = window.matchMedia;
  window.matchMedia = jest.fn((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
  try {
    renderForm('/new/money-line');
    await userEvent.click(screen.getByRole('link', { name: 'Friendly' }));
    expect(navigation.push).toHaveBeenCalledWith('/');
    expect(document.querySelector('.create-pane.is-leaving')).not.toBeInTheDocument();
    expect(saveBet).not.toHaveBeenCalled();
  } finally {
    if (previous) window.matchMedia = previous;
    else delete window.matchMedia;
  }
});

test('an unknown create route leaves the walkthrough', () => {
  navigation.pathname = '/new/nope';
  navigation.params = { type: 'nope' };
  render(<CreateForm />);
  expect(navigation.replace).toHaveBeenCalledWith('/new');
});
