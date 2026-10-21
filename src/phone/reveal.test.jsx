import fs from 'fs';
import path from 'path';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoteScreen from './VoteScreen';
import TallyScreen from './TallyScreen';
import { subscribeBet } from './api';
import { useIdentity } from './identity';
import { shareMessage } from './share';
import { navigation } from 'next/navigation';
import { buildSettlement, formatResultMessage } from './settlement';
import { REVEAL_COPY, STAKE_LINES, buildReveal, stakeLine, winnerPhrase } from './reveal';

jest.mock('next/navigation');
jest.mock('next/link');

jest.mock('./api', () => ({
  subscribeBet: jest.fn(),
  hydrateBet: async (bet) => bet,
  castVote: jest.fn(async () => {}),
  settleBet: jest.fn(async () => {}),
}));

jest.mock('./identity', () => ({
  useIdentity: jest.fn(),
  rememberName: jest.fn(),
  savedName: () => '',
  creatorName: () => 'Jack',
}));

jest.mock('./share', () => ({
  shareMessage: jest.fn(async () => 'manual'),
}));

jest.mock('./ResultsMenu', () => () => <span data-testid="results-menu" />);

const OPTIONS = [{ id: 'a', label: 'Chiefs -3' }, { id: 'b', label: 'Bills +3' }];

function makeBet({ winners = [], losers = [], stake = '$20', ...rest } = {}) {
  const pick = (optionId) => ([voterId, name]) => ({ voterId, name, optionId });
  return {
    id: 'abc123', code: 'abc123', schemaVersion: 2, type: 'money-line', typeLabel: 'Money Line',
    question: 'Chiefs cover -3?', createdByID: 'jack', createdByName: 'Jack', status: 'open',
    stake, options: OPTIONS,
    votes: [...winners.map(pick('a')), ...losers.map(pick('b'))],
    ...rest,
  };
}

// Settled the way the app settles: a stored snapshot from buildSettlement.
function settled(input, winnerId = 'a') {
  const bet = makeBet(input);
  return { ...bet, status: 'closed', winnerId, settledAt: 1, settlement: buildSettlement(bet, winnerId) };
}

const lines = (reveal) => [reveal.eyebrow, reveal.headline, reveal.subline, reveal.stake];

describe('the winners line follows the stake', () => {
  const STAKES = [
    ['no stake', '', 'Bragging rights, secured.'],
    ['Bragging rights', 'Bragging rights', 'Bragging rights, secured.'],
    ['Coffee', 'Coffee', 'Coffee’s on everyone else.'],
    ['Lunch', 'Lunch', 'Lunch is on everyone else.'],
    ['Drinks', 'Drinks', 'Drinks are on everyone else.'],
    ['a typed coffee, any case and spacing', '  coffee. ', 'Coffee’s on everyone else.'],
    ['typed drinks with a bang', 'DRINKS!', 'Drinks are on everyone else.'],
    ['a custom stake', 'Loser buys pizza', 'Time for everyone else to pay up.'],
    ['a money stake', '$5', 'Time for everyone else to pay up.'],
    ['Dinner, a chip with no line of its own', 'Dinner', 'Time for everyone else to pay up.'],
  ];

  test.each(STAKES)('%s', (_label, stake, line) => {
    expect(stakeLine(stake)).toBe(line);
    const bet = settled({ winners: [['maya', 'Maya']], losers: [['zed', 'Zed']], stake });
    const crew = settled({ winners: [['maya', 'Maya'], ['sam', 'Sam']], losers: [['zed', 'Zed']], stake });
    // The fixed starts stay; only the stake part changes.
    expect(buildReveal({ bet, viewerId: 'outsider' }).subline).toBe(`Called it solo. ${line}`);
    expect(buildReveal({ bet, viewerId: 'maya' }).subline).toBe(`Solo win. ${line}`);
    expect(buildReveal({ bet: crew, viewerId: 'maya' }).subline).toBe(`You & Sam won. ${line}`);
    expect(buildReveal({ bet: crew, viewerId: 'outsider' }).subline).toBe(line);
    expect(buildReveal({ bet: settled({ winners: [['u1', '']], stake }) }).subline).toBe(line);
    // The muted stakes line still shows whatever was set.
    expect(buildReveal({ bet, viewerId: 'outsider' }).stake).toBe(stake.trim());
    // Losing, nobody and called off keep their lines.
    expect(buildReveal({ bet, viewerId: 'zed' }).subline).toBe('Not your day. Get ’em next time.');
    expect(buildReveal({ bet: settled({ losers: [['zed', 'Zed']], stake }) }).subline).toBe('Not one of you saw that coming.');
    expect(buildReveal({ bet: { ...bet, calledOff: true } }).subline).toBe('Nobody won this one.');
  });

  test('every line uses the typographic apostrophe and no em dash', () => {
    expect(STAKE_LINES.coffee).toBe('Coffee’s on everyone else.');
    Object.values(STAKE_LINES).forEach((line) => {
      expect(line).not.toMatch(/['—]/);
    });
  });
});

describe('buildReveal copy', () => {
  test.each([
    ['2 winners', [['maya', 'Maya'], ['sam', 'Sam']], 'Maya & Sam won.', 'Time for everyone else to pay up.'],
    ['3 winners', [['jack', 'Jack'], ['maya', 'Maya'], ['sam', 'Sam']], 'Jack, Maya & Sam won.', 'Time for everyone else to pay up.'],
    ['4+ winners', [['jack', 'Jack'], ['maya', 'Maya'], ['sam', 'Sam'], ['kim', 'Kim'], ['lee', 'Lee']], 'Jack, Maya & 3 others won.', 'Time for everyone else to pay up.'],
    ['1 winner', [['maya', 'Maya']], 'Maya won.', 'Called it solo. Time for everyone else to pay up.'],
  ])('%s', (_label, winners, headline, subline) => {
    const reveal = buildReveal({ bet: settled({ winners, losers: [['zed', 'Zed']] }), viewerId: 'outsider' });
    expect(lines(reveal)).toEqual(['Chiefs -3 won', headline, subline, '$20']);
    expect(reveal.startBet).toBe(false);
  });

  test('a single unnamed winner gets the plain stake line, not "Called it solo"', () => {
    for (const name of ['', '   ']) {
      const reveal = buildReveal({ bet: settled({ winners: [['u1', name]], losers: [['zed', 'Zed']] }), viewerId: 'outsider' });
      expect(lines(reveal)).toEqual(['Chiefs -3 won', 'One friend called it.', 'Time for everyone else to pay up.', '$20']);
    }
  });

  test('a single named winner keeps "Called it solo"', () => {
    const reveal = buildReveal({ bet: settled({ winners: [['maya', 'Maya']] }), viewerId: 'outsider' });
    expect([reveal.kind, reveal.headline, reveal.subline]).toEqual(['winners', 'Maya won.', 'Called it solo. Time for everyone else to pay up.']);
  });

  test.each([
    [[['jack', 'Jack'], ['u1', '']], 'Jack & 1 other won.'],
    [[['jack', 'Jack'], ['u1', ''], ['u2', '']], 'Jack & 2 others won.'],
    [[['jack', 'Jack'], ['maya', 'Maya'], ['u1', '']], 'Jack, Maya & 1 other won.'],
    [[['u1', ''], ['jack', 'Jack'], ['u2', ''], ['maya', 'Maya'], ['sam', 'Sam']], 'Jack, Maya & 3 others won.'],
    [[['jack', '  Jack  '], ['u1', '   ']], 'Jack & 1 other won.'],
  ])('mixed named and unnamed winners: %j', (winners, headline) => {
    expect(buildReveal({ bet: settled({ winners }) }).headline).toBe(headline);
  });

  test.each([
    [1, 'One friend called it.', 'Time for everyone else to pay up.'],
    [3, '3 friends called it.', 'Time for everyone else to pay up.'],
  ])('all %i winners unnamed get the friends count line', (count, headline, subline) => {
    const winners = Array.from({ length: count }, (_, index) => [`u${index}`, index ? '' : '   ']);
    const reveal = buildReveal({ bet: settled({ winners }) });
    expect([reveal.kind, reveal.headline, reveal.subline]).toEqual(['winners', headline, subline]);
  });

  test('a viewer who lost to unnamed winners gets the count line and the nudge', () => {
    const reveal = buildReveal({ bet: settled({ winners: [['u1', ''], ['u2', '']], losers: [['me', 'Pat']] }), viewerId: 'me' });
    expect(lines(reveal)).toEqual(['Chiefs -3 won', '2 friends called it.', 'Not your day. Get ’em next time.', '$20']);
    expect(reveal.startBet).toBe(true);
  });

  test('nobody picked the winning side', () => {
    const reveal = buildReveal({ bet: settled({ losers: [['maya', 'Maya']] }), viewerId: 'outsider' });
    expect(lines(reveal)).toEqual(['Chiefs -3 won', 'Nobody called it.', 'Not one of you saw that coming.', '$20']);
    expect(reveal.startBet).toBe(false);
  });

  test('viewer won with others, named by the same rule after You', () => {
    const view = (winners) => buildReveal({ bet: settled({ winners }), viewerId: 'me' });
    const me = ['me', 'Pat'];
    expect(lines(view([me, ['jack', 'Jack'], ['maya', 'Maya']]))).toEqual([
      'Chiefs -3 won', 'You called it.', 'You, Jack & Maya won. Time for everyone else to pay up.', '$20',
    ]);
    expect(view([me, ['jack', 'Jack']]).subline).toBe('You & Jack won. Time for everyone else to pay up.');
    expect(view([me, ['u1', '']]).subline).toBe('You & 1 other won. Time for everyone else to pay up.');
    expect(view([me, ['jack', 'Jack'], ['u1', '']]).subline).toBe('You, Jack & 1 other won. Time for everyone else to pay up.');
    expect(view([me, ['jack', 'Jack'], ['maya', 'Maya'], ['sam', 'Sam'], ['kim', 'Kim']]).subline)
      .toBe('You, Jack, Maya & 2 others won. Time for everyone else to pay up.');
    expect(view([me]).startBet).toBe(false);
  });

  test('viewer is the only winner', () => {
    const reveal = buildReveal({ bet: settled({ winners: [['me', '']], losers: [['jack', 'Jack']] }), viewerId: 'me' });
    expect(lines(reveal)).toEqual(['Chiefs -3 won', 'You called it.', 'Solo win. Time for everyone else to pay up.', '$20']);
  });

  test('viewer lost gets the names, the nudge, and Start a bet', () => {
    const reveal = buildReveal({ bet: settled({ winners: [['jack', 'Jack'], ['maya', 'Maya']], losers: [['me', 'Pat']] }), viewerId: 'me' });
    expect(lines(reveal)).toEqual(['Chiefs -3 won', 'Jack & Maya won.', 'Not your day. Get ’em next time.', '$20']);
    expect(reveal.startBet).toBe(true);
  });

  test.each([
    ['calledOff flag on a settled bet', { ...settled({ winners: [['jack', 'Jack']] }), calledOff: true }],
    ['calledOff flag on an open bet', makeBet({ winners: [['jack', 'Jack']], calledOff: true })],
    ['status called-off', makeBet({ winners: [['jack', 'Jack']], status: 'called-off' })],
  ])('called off (%s)', (_label, bet) => {
    const reveal = buildReveal({ bet, viewerId: 'jack' });
    expect(reveal.kind).toBe('called-off');
    expect(lines(reveal)).toEqual(['', 'This bet was called off.', 'Nobody won this one.', '$20']);
    expect(reveal.startBet).toBe(false);
    expect(buildReveal({ bet: { ...bet, stake: '' } }).stake).toBe('');
  });

  test('stake line only when the creator set a stake', () => {
    expect(buildReveal({ bet: settled({ winners: [['jack', 'Jack']], stake: '' }) }).stake).toBe('');
    expect(buildReveal({ bet: settled({ winners: [['jack', 'Jack']], stake: '   ' }) }).stake).toBe('');
    expect(buildReveal({ bet: settled({ winners: [['jack', 'Jack']], stake: 'a coffee' }) }).stake).toBe('a coffee');
  });

  test('legacy settled bets without a settlement derive winners from votes, with no writes', () => {
    const bet = { ...makeBet({ winners: [['jack', 'Jack'], ['maya', 'Maya']], losers: [['me', 'Pat']] }), status: 'closed', winnerId: 'a' };
    const frozen = JSON.stringify(bet);
    expect(lines(buildReveal({ bet, viewerId: 'me' }))).toEqual([
      'Chiefs -3 won', 'Jack & Maya won.', 'Not your day. Get ’em next time.', '$20',
    ]);
    expect(JSON.stringify(bet)).toBe(frozen);
  });

  test('legacy count-only bets keep the plain result card, and a missing winner is not settled', () => {
    const counts = {
      id: 'old', status: 'closed', winnerId: 'over', type: 'Over Under', line: 3.5, over: 2, under: 1,
      question: 'Rolls', options: [{ id: 'over', label: 'Over' }, { id: 'under', label: 'Under' }],
    };
    expect(buildReveal({ bet: counts })).toMatchObject({ kind: 'legacy', eyebrow: 'Over 3.5 won' });
    expect(buildReveal({ bet: { ...counts, winnerId: null } })).toBeNull();
    expect(buildReveal({ bet: { ...counts, winnerId: 'gone' } })).toBeNull();
    expect(buildReveal({ bet: makeBet() })).toBeNull();
    expect(buildReveal({ bet: null })).toBeNull();
  });

  test('winnerPhrase never names more than two', () => {
    expect(winnerPhrase([])).toBe('');
    expect(winnerPhrase([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }])).toBe('A, B & 2 others');
  });

  test('reveal strings have no em dashes and no TODO_UX', () => {
    const strings = Object.values(REVEAL_COPY).flatMap((value) => (typeof value === 'function' ? [value('X'), value(1), value(2)] : [value]));
    strings.forEach((text) => expect(text).not.toMatch(/—|TODO_UX/));
    const source = fs.readFileSync(path.join(__dirname, 'reveal.js'), 'utf8');
    expect(source).not.toMatch(/—|TODO_UX/);
  });
});

describe('settled screens', () => {
  const as = (uid, phone = false) => useIdentity.mockReturnValue(
    phone ? { uid, phoneNumber: '+15551234567', providerData: [{ providerId: 'phone' }] } : { uid, isAnonymous: true, providerData: [] },
  );
  const feed = (bet) => subscribeBet.mockImplementation((_code, onChange) => { onChange(bet); return () => {}; });

  async function renderAt(route, element) {
    navigation.pathname = route;
    navigation.params = { code: 'abc123' };
    jest.useFakeTimers();
    try {
      render(element);
      act(() => { jest.advanceTimersByTime(450); });
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});
  }

  const region = () => screen.getByRole('region', { name: 'Settled result' });
  const crew = { winners: [['jack', 'Jack'], ['maya', 'Maya'], ['sam', 'Sam']], losers: [['bart', 'Bart'], ['u9', '']] };

  beforeEach(() => {
    shareMessage.mockClear();
    shareMessage.mockResolvedValue('manual');
  });

  test('winner on /b/: eyebrow, headline, subline, stake, then Share the result; no voter lists', async () => {
    as('maya');
    feed(settled(crew));
    await renderAt('/b/abc123', <VoteScreen />);
    const card = region();
    expect([...card.children].map((node) => node.textContent)).toEqual([
      'Chiefs -3 won', 'You called it.', 'You, Jack & Sam won. Time for everyone else to pay up.', 'Stakes: $20',
    ]);
    expect(card.compareDocumentPosition(screen.getByRole('button', { name: 'Share the result' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('.bars, .voter-list, .results-heading')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Start a bet' })).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent(/pot/);
  });

  test('loser on /b/ gets the green Start a bet to /new, after Share the result', async () => {
    as('bart');
    feed(settled(crew));
    await renderAt('/b/abc123', <VoteScreen />);
    expect(within(region()).getByRole('heading', { name: 'Jack, Maya & Sam won.' })).toBeInTheDocument();
    expect(region()).toHaveTextContent('Not your day. Get ’em next time.');
    const start = screen.getByRole('link', { name: 'Start a bet' });
    expect(start).toHaveAttribute('href', '/new');
    expect(start).toHaveClass('cta', 'press');
    expect(screen.getByRole('button', { name: 'Share the result' }).compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('.voter-list')).toBeNull();
  });

  test('a visitor who never picked sees the non-viewer variant with no Start a bet', async () => {
    as('outsider');
    feed(settled(crew));
    await renderAt('/b/abc123', <VoteScreen />);
    expect(region()).toHaveTextContent('Jack, Maya & Sam won.Time for everyone else to pay up.');
    expect(screen.queryByRole('link', { name: 'Start a bet' })).not.toBeInTheDocument();
  });

  test('creator who did not vote sees the non-viewer variant on /t/', async () => {
    as('jack', true);
    feed(settled({ ...crew, winners: [['maya', 'Maya'], ['sam', 'Sam'], ['kim', 'Kim'], ['lee', 'Lee']] }));
    await renderAt('/t/abc123', <TallyScreen />);
    expect(screen.getByRole('heading', { name: 'The final word' })).toBeInTheDocument();
    expect(within(region()).getByRole('heading', { name: 'Maya, Sam & 2 others won.' })).toBeInTheDocument();
    expect(region()).toHaveTextContent('Time for everyone else to pay up.');
    expect(document.querySelector('.bars, .voter-list')).toBeNull();
    expect(screen.queryByRole('button', { name: /close & settle/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Text the crew' })).not.toBeInTheDocument();
  });

  test('creator who voted sees the viewer variant on /t/', async () => {
    as('jack', true);
    feed(settled(crew));
    await renderAt('/t/abc123', <TallyScreen />);
    expect(region()).toHaveTextContent('You called it.You, Maya & Sam won. Time for everyone else to pay up.');
  });

  test('nobody called it, with no stake line when there is no stake', async () => {
    as('bart');
    feed(settled({ losers: [['bart', 'Bart']], stake: '' }));
    await renderAt('/b/abc123', <VoteScreen />);
    expect([...region().children].map((node) => node.textContent)).toEqual([
      'Chiefs -3 won', 'Nobody called it.', 'Not one of you saw that coming.',
    ]);
    expect(screen.queryByText(/^Stakes:/)).not.toBeInTheDocument();
  });

  test.each([
    ['calledOff flag', { ...settled(crew), calledOff: true }],
    ['status called-off', makeBet({ ...crew, status: 'called-off' })],
  ])('called off (%s) drops the eyebrow and names nobody, on /b/ and /t/', async (_label, bet) => {
    feed(bet);
    for (const [route, Screen, uid, phone] of [['/b/abc123', VoteScreen, 'maya', false], ['/t/abc123', TallyScreen, 'jack', true]]) {
      as(uid, phone);
      await renderAt(route, <Screen />);
      expect([...region().children].map((node) => node.textContent)).toEqual([
        'This bet was called off.', 'Nobody won this one.', 'Stakes: $20',
      ]);
      // Nobody won, so there is no result to share and no winner to name.
      expect(screen.queryByRole('button', { name: 'Share the result' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Start a bet' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Chiefs -3 won/)).not.toBeInTheDocument();
      cleanup();
    }
  });

  test('a legacy settled bet with no settlement field still reveals from its votes', async () => {
    as('outsider');
    feed({ ...makeBet(crew), status: 'closed', winnerId: 'b' });
    await renderAt('/b/abc123', <VoteScreen />);
    expect(region()).toHaveTextContent('Bills +3 wonBart & 1 other won.Time for everyone else to pay up.Stakes: $20');
  });

  test('a legacy count-only bet falls back to the plain result card without crashing', async () => {
    as('outsider');
    feed({
      id: 'abc123', status: 'closed', winnerId: 'over', type: 'Over Under', line: 3.5, over: 2, under: 1,
      bet: 'Rolls', stake: '', options: [{ id: 'over', label: 'Over' }, { id: 'under', label: 'Under' }],
    });
    await renderAt('/b/abc123', <VoteScreen />);
    expect(region()).toHaveTextContent('Over 3.5 takes it');
    expect(document.querySelector('.voter-list')).toBeNull();
  });

  test('Share the result still sends the existing result text, unchanged', async () => {
    as('maya');
    const bet = settled(crew);
    feed(bet);
    await renderAt('/b/abc123', <VoteScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Share the result' }));
    const expected = [
      'FRIENDLY · Closed · Jack, Maya & Sam won',
      'Chiefs cover -3?',
      'Winning pick: Chiefs -3',
      'At stake: $20',
      'Bragging rights, secured.',
      'The final word: http://localhost/b/abc123',
    ].join('\n');
    expect(formatResultMessage(bet, 'http://localhost/b/abc123')).toBe(expected);
    expect(shareMessage).toHaveBeenCalledWith(expected);
  });

  test('open tallies keep the bars and voter lists exactly as before', async () => {
    as('jack', true);
    feed(makeBet(crew));
    await renderAt('/t/abc123', <TallyScreen />);
    expect(screen.queryByRole('region', { name: 'Settled result' })).not.toBeInTheDocument();
    expect(screen.getByText('Updated live')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Picked by Jack, Maya, and Sam' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Picked by Bart and 1 friend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text the crew' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share as image' })).not.toBeInTheDocument();
  });

  test('settled on /b/ and /t/: Share as image sits right under Share the result', async () => {
    feed(settled(crew));
    for (const [route, Screen, uid, phone] of [['/b/abc123', VoteScreen, 'maya', false], ['/t/abc123', TallyScreen, 'jack', true]]) {
      as(uid, phone);
      await renderAt(route, <Screen />);
      const text = screen.getByRole('button', { name: 'Share the result' });
      const image = screen.getByRole('button', { name: 'Share as image' });
      expect(text.nextElementSibling).toBe(image);
      cleanup();
    }
  });

  test.each([
    ['calledOff flag', { ...settled(crew), calledOff: true }],
    ['status called-off', makeBet({ ...crew, status: 'called-off' })],
  ])('called off (%s) has no image to share', async (_label, bet) => {
    as('maya');
    feed(bet);
    await renderAt('/b/abc123', <VoteScreen />);
    expect(screen.queryByRole('button', { name: 'Share as image' })).not.toBeInTheDocument();
  });

  test('a legacy count-only bet keeps Share the result but has no image', async () => {
    as('outsider');
    feed({
      id: 'abc123', status: 'closed', winnerId: 'over', type: 'Over Under', line: 3.5, over: 2, under: 1,
      bet: 'Rolls', stake: '', options: [{ id: 'over', label: 'Over' }, { id: 'under', label: 'Under' }],
    });
    await renderAt('/b/abc123', <VoteScreen />);
    expect(screen.getByRole('button', { name: 'Share the result' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share as image' })).not.toBeInTheDocument();
  });
});
