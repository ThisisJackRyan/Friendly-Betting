import { CARD, CARD_BRAND, CARD_COLORS, buildWinnerCard, winnerCardText, wrapText } from './winnerCard';
import { buildReveal } from './reveal';
import { buildSettlement } from './settlement';

// Every character is half the font size wide: close enough to Manrope to
// make wrapping real, with no canvas.
const measure = (text, font) => Array.from(text).length * Number(/(\d+)px/.exec(font)[1]) * 0.5;

const OPTIONS = [{ id: 'a', label: 'Chiefs -3' }, { id: 'b', label: 'Bills +3' }];

function makeBet({ winners = [], losers = [], stake = '$20', question = 'Chiefs cover -3?', ...rest } = {}) {
  const pick = (optionId) => ([voterId, name]) => ({ voterId, name, optionId });
  return {
    id: 'abc123', code: 'abc123', schemaVersion: 2, type: 'money-line', typeLabel: 'Money Line',
    question, createdByID: 'jack', createdByName: 'Jack', status: 'open', stake, options: OPTIONS,
    votes: [...winners.map(pick('a')), ...losers.map(pick('b'))],
    ...rest,
  };
}

function settled(input, winnerId = 'a') {
  const bet = makeBet(input);
  return { ...bet, status: 'closed', winnerId, settledAt: 1, settlement: buildSettlement(bet, winnerId) };
}

const textOf = (card, key) => card.lines.filter((line) => line.key === key).map((line) => line.text);
const inner = CARD.width - CARD.pad * 2;

describe('winnerCardText', () => {
  test('a settled bet: question, winning side and the names the reveal shows a visitor', () => {
    const bet = settled({ winners: [['maya', 'Maya'], ['sam', 'Sam']], losers: [['zed', 'Zed']] });
    expect(winnerCardText(bet)).toEqual({
      question: 'Chiefs cover -3?',
      eyebrow: 'Chiefs -3 won',
      headline: 'Maya & Sam won.',
      subline: 'Bragging rights, secured.',
      stake: 'Stakes: $20',
    });
    expect(winnerCardText(bet).headline).toBe(buildReveal({ bet, viewerId: null }).headline);
  });

  test('never says You, even when the sharer won', () => {
    const bet = settled({ winners: [['maya', 'Maya'], ['sam', 'Sam']] });
    expect(buildReveal({ bet, viewerId: 'maya' }).headline).toBe('You called it.');
    expect(winnerCardText(bet).headline).toBe('Maya & Sam won.');
  });

  test('many winners keep the reveal\'s two names and a count', () => {
    const winners = [['jack', 'Jack'], ['maya', 'Maya'], ['sam', 'Sam'], ['kim', 'Kim'], ['lee', 'Lee']];
    expect(winnerCardText(settled({ winners })).headline).toBe('Jack, Maya & 3 others won.');
  });

  test('nobody called it, and no stake line without a stake', () => {
    const text = winnerCardText(settled({ losers: [['zed', 'Zed']], stake: '' }));
    expect(text.headline).toBe('Nobody called it.');
    expect(text.stake).toBe('');
  });

  test.each([
    ['open', makeBet({ winners: [['maya', 'Maya']] })],
    ['called off', { ...settled({ winners: [['maya', 'Maya']] }), calledOff: true }],
    ['called off by status', { ...makeBet({ winners: [['maya', 'Maya']] }), status: 'called-off', winnerId: 'a' }],
    ['closed with no winner', { ...makeBet(), status: 'closed', winnerId: null }],
    ['legacy count-only', { ...makeBet(), status: 'closed', winnerId: 'a', over: 3, under: 1 }],
    ['missing', null],
  ])('%s has no card', (_label, bet) => {
    expect(winnerCardText(bet)).toBeNull();
    expect(buildWinnerCard(bet, { measure })).toBeNull();
  });
});

describe('buildWinnerCard layout', () => {
  test('lines in reading order, inside the card, with the brand around them', () => {
    const card = buildWinnerCard(settled({ winners: [['maya', 'Maya']] }), { measure });
    expect(card).toMatchObject({ width: 1080, height: 1350, background: CARD_COLORS.background });
    expect(card.lines.map((line) => line.key)).toEqual(['question', 'eyebrow', 'headline', 'subline', 'subline', 'stake']);
    expect(card.lines.map((line) => line.text)).toEqual([
      'Chiefs cover -3?', 'Chiefs -3 won', 'Maya won.', 'Called it solo. Bragging rights,', 'secured.', 'Stakes: $20',
    ]);
    expect(card.brand).toMatchObject({ text: CARD_BRAND, period: '.' });
    expect(card.footer.text).toBe('friendly-bets.com');
    expect(card.rule).not.toBeNull();
    const ys = card.lines.map((line) => line.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(ys[0]).toBeGreaterThan(card.brand.y + card.brand.symbol + 60);
    expect(ys.at(-1)).toBeLessThan(card.footer.y - 40);
    card.lines.forEach((line) => expect(measure(line.text, line.font)).toBeLessThanOrEqual(inner));
  });

  test('a long question wraps to three lines and ends in an ellipsis', () => {
    const question = 'Will the whole crew actually make it to the cabin before midnight on Friday, '
      + 'with snacks, without anyone getting lost, and with the playlist already sorted out ahead of time?';
    const card = buildWinnerCard(settled({ winners: [['maya', 'Maya']], question }), { measure });
    const lines = textOf(card, 'question');
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith('…')).toBe(true);
    expect(lines.join(' ').replace('…', '').length).toBeLessThan(question.length);
    lines.forEach((line) => expect(measure(line, card.lines[0].font)).toBeLessThanOrEqual(inner));
  });

  test('a short question stays whole, with no ellipsis', () => {
    const card = buildWinnerCard(settled({ winners: [['maya', 'Maya']] }), { measure });
    expect(textOf(card, 'question')).toEqual(['Chiefs cover -3?']);
  });

  test('very long names are cut so the headline fits in three lines', () => {
    const winners = [['a', 'Bartholomew-Maximilian Featherstonehaugh'], ['b', 'Anastasiaaaaaaaaaaaaaaaaaaaaaaaaaaaa Lee']];
    const card = buildWinnerCard(settled({ winners }), { measure });
    const lines = textOf(card, 'headline');
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.join(' ')).toContain('…');
    expect(lines.join(' ')).toMatch(/ won\.$/);
    const font = card.lines.find((line) => line.key === 'headline').font;
    lines.forEach((line) => expect(measure(line, font)).toBeLessThanOrEqual(inner));
  });

  test('a headline that will not fit steps down a size before it clips', () => {
    const winners = [['a', 'Bartholomew Maximilian'], ['b', 'Anastasia Konstantin'], ['c', 'Kim'], ['d', 'Lee']];
    const card = buildWinnerCard(settled({ winners }), { measure });
    const headline = card.lines.filter((line) => line.key === 'headline');
    expect(headline[0].font).toMatch(/^800 (84|72)px /);
    expect(headline.map((line) => line.text).join(' ')).toBe('Bartholomew Maximilian, Anastasia Konstantin & 2 others won.');
  });

  test('then cuts each name, so the count and "won." always show', () => {
    const winners = [['a', 'Bartholomew Maximilian Fitzgerald-Worthington'], ['b', 'Anastasia Konstantinopoulou'],
      ['c', 'Kim'], ['d', 'Lee'], ['e', 'Ana'], ['f', 'Ravi']];
    const card = buildWinnerCard(settled({ winners }), { measure });
    const headline = card.lines.filter((line) => line.key === 'headline').map((line) => line.text);
    expect(headline.length).toBeLessThanOrEqual(3);
    const joined = headline.join(' ');
    expect(joined).toMatch(/^Bartholomew.*…, Anastasia.*… & 4 others won\.$/);
  });

  test('a single unbroken name too long for any cut still clips inside the card', () => {
    const card = buildWinnerCard(settled({ winners: [['a', 'X'.repeat(300)]] }), { measure });
    const lines = card.lines.filter((line) => line.key === 'headline');
    expect(lines.length).toBeLessThanOrEqual(3);
    lines.forEach((line) => expect(measure(line.text, line.font)).toBeLessThanOrEqual(inner));
  });

  test('a short headline keeps the largest size', () => {
    const card = buildWinnerCard(settled({ winners: [['maya', 'Maya']] }), { measure });
    expect(card.lines.find((line) => line.key === 'headline').font).toMatch(/^800 100px /);
  });

  test('no stake: no rule and no stake line', () => {
    const card = buildWinnerCard(settled({ winners: [['maya', 'Maya']], stake: '' }), { measure });
    expect(card.rule).toBeNull();
    expect(textOf(card, 'stake')).toEqual([]);
  });

  test('a long stake is clipped to one line', () => {
    const stake = 'Loser buys the whole table brunch and does the dishes for a month straight';
    const card = buildWinnerCard(settled({ winners: [['maya', 'Maya']], stake }), { measure });
    const lines = textOf(card, 'stake');
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('Stakes: Loser')).toBe(true);
    expect(lines[0].endsWith('…')).toBe(true);
  });
});

describe('wrapText', () => {
  const opts = { width: 50, font: '400 10px x', maxLines: 2, measure };
  test('wraps on words', () => {
    expect(wrapText('aaaa bbbb cccc', opts)).toEqual(['aaaa bbbb', 'cccc']);
  });
  test('breaks a word wider than a line', () => {
    expect(wrapText('abcdefghijklmnopqrstuvwxyz', { ...opts, maxLines: 3 })).toEqual(['abcdefghij', 'klmnopqrst', 'uvwxyz']);
  });
  test('clips the overflow with an ellipsis', () => {
    const lines = wrapText('aaaa bbbb cccc dddd eeee ffff', opts);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    lines.forEach((line) => expect(measure(line, opts.font)).toBeLessThanOrEqual(50));
    expect(lines).toEqual(['aaaa bbbb', 'cccc dddd…']);
  });
  test('empty text has no lines', () => {
    expect(wrapText('   ', opts)).toEqual([]);
  });
});
