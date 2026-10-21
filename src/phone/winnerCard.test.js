import { CARD, CARD_BRAND, CARD_COLORS, buildWinnerCard, graphemes, textDirection, winnerCardText, wrapText } from './winnerCard';
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
      subline: 'Time for everyone else to pay up.',
      stake: 'Stakes: $20',
    });
    expect(winnerCardText(bet).headline).toBe(buildReveal({ bet, viewerId: null }).headline);
  });

  test('never says You, even when the sharer won', () => {
    const bet = settled({ winners: [['maya', 'Maya'], ['sam', 'Sam']] });
    expect(buildReveal({ bet, viewerId: 'maya' }).headline).toBe('You called it.');
    expect(winnerCardText(bet).headline).toBe('Maya & Sam won.');
  });

  test('many winners keep the reveal\'s two names and a count, joined with no-break spaces', () => {
    const winners = [['jack', 'Jack'], ['maya', 'Maya'], ['sam', 'Sam'], ['kim', 'Kim'], ['lee', 'Lee']];
    const bet = settled({ winners });
    expect(winnerCardText(bet).headline).toBe('Jack, Maya &\u00A03\u00A0others won.');
    expect(buildReveal({ bet, viewerId: null }).headline).toBe('Jack, Maya & 3 others won.');
  });

  test('one other is kept with its count too', () => {
    const winners = [['jack', 'Jack'], ['maya', 'Maya'], ['anon', '']];
    expect(winnerCardText(settled({ winners })).headline).toBe('Jack, Maya &\u00A01\u00A0other won.');
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

describe('the creator among the winners, on the card', () => {
  // makeBet's creator is createdByID 'jack'.
  test('a named creator is a winner like any other, alone or in the list', () => {
    const solo = winnerCardText(settled({ winners: [['jack', 'Jack']], losers: [['zed', 'Zed']], stake: 'Coffee' }));
    expect(solo.headline).toBe('Jack won.');
    expect(solo.subline).toBe('Called it solo. Coffee’s on everyone else.');
    const crew = winnerCardText(settled({ winners: [['maya', 'Maya'], ['jack', 'Jack']], stake: 'Coffee' }));
    expect(crew.headline).toBe('Maya & Jack won.');
    expect(crew.subline).toBe('Coffee’s on everyone else.');
    const many = winnerCardText(settled({ winners: [['maya', 'Maya'], ['jack', 'Jack'], ['sam', 'Sam'], ['kim', 'Kim']] }));
    expect(many.headline).toBe('Maya, Jack &\u00A02\u00A0others won.');
  });

  test('an unnamed creator alone: I called it.', () => {
    const bet = settled({ winners: [['jack', '']], losers: [['zed', 'Zed']], stake: 'Lunch' });
    const text = winnerCardText(bet, 'jack');
    expect(text.headline).toBe('I called it.');
    expect(text.subline).toBe('Solo win. Lunch is on everyone else.');
    expect(textOf(buildWinnerCard(bet, { measure, viewerId: 'jack' }), 'headline')).toEqual(['I called it.']);
  });

  test.each([
    [[['maya', 'Maya'], ['jack', '']], 'Maya &\u00A0I won.'],
    [[['jack', ''], ['maya', 'Maya']], 'Maya &\u00A0I won.'],
    [[['sam', 'Sam'], ['jack', ''], ['maya', 'Maya']], 'Sam, Maya &\u00A0I won.'],
  ])('an unnamed creator with others ends the names as I: %j', (winners, headline) => {
    const bet = settled({ winners, stake: 'Drinks' });
    expect(winnerCardText(bet, 'jack').headline).toBe(headline);
    expect(winnerCardText(bet, 'jack').subline).toBe('Drinks are on everyone else.');
    expect(textOf(buildWinnerCard(bet, { measure, viewerId: 'jack' }), 'headline').join(' ')).toBe(headline);
  });

  test('with 4 or more winners an unnamed creator counts in the others', () => {
    const winners = [['sam', 'Sam'], ['maya', 'Maya'], ['jack', ''], ['kim', 'Kim'], ['lee', 'Lee']];
    expect(winnerCardText(settled({ winners }), 'jack').headline).toBe('Sam, Maya &\u00A03\u00A0others won.');
    const four = [['sam', 'Sam'], ['maya', 'Maya'], ['kim', 'Kim'], ['jack', '']];
    expect(winnerCardText(settled({ winners: four }), 'jack').headline).toBe('Sam, Maya &\u00A02\u00A0others won.');
  });

  test('the "& I" stays together when the headline wraps', () => {
    const bet = settled({ winners: [['a1', 'Bartholomew Maximilian'], ['a2', 'Anastasia Konstantin'], ['jack', '']] });
    const headline = textOf(buildWinnerCard(bet, { measure, viewerId: 'jack' }), 'headline');
    expect(headline.join(' ')).toMatch(/ &\u00A0I won\.$/);
    expect(headline.some((line) => line.endsWith('&'))).toBe(false);
  });

  // Anyone but the creator sharing the card: a voter, or a visitor with no
  // id. They never speak as the creator.
  const UNNAMED_CREATOR = [
    ['solo', [['jack', '']], 'One friend called it.', 'Lunch is on everyone else.'],
    ['with one other', [['maya', 'Maya'], ['jack', '']], 'Maya &\u00A01\u00A0other won.', 'Lunch is on everyone else.'],
    ['with two others', [['sam', 'Sam'], ['jack', ''], ['maya', 'Maya']], 'Sam, Maya &\u00A01\u00A0other won.', 'Lunch is on everyone else.'],
  ];
  const CREATOR_LINES = ['I called it.', '& I won.', '&\u00A0I won.'];
  describe.each([
    ['a voter who won', 'maya'],
    ['a voter who lost', 'zed'],
    ['a visitor (no viewer)', undefined],
    ['a visitor (null)', null],
    ['a visitor (empty id)', ''],
  ])('%s sharing the card', (_label, viewerId) => {
    test.each(UNNAMED_CREATOR)('an unnamed creator %s is not I', (_case, winners, headline, subline) => {
      const bet = settled({ winners, losers: [['zed', 'Zed']], stake: 'Lunch' });
      const text = winnerCardText(bet, viewerId);
      expect(text.headline).toBe(headline);
      expect(text.subline).toBe(subline);
      expect(text.headline).toBe(winnerCardText(bet).headline);
      const card = buildWinnerCard(bet, { measure, viewerId });
      const all = [...Object.values(text), ...card.lines.map((line) => line.text)].join('\n');
      CREATOR_LINES.forEach((line) => expect(all).not.toContain(line));
    });
  });

  test('a creator id on the bet that matches no viewer never makes an I card', () => {
    const bet = { ...settled({ winners: [['jack', '']] }), createdByID: '' };
    expect(winnerCardText(bet, '').headline).toBe('One friend called it.');
    const noCreator = { ...settled({ winners: [['jack', '']] }), createdByID: undefined };
    expect(winnerCardText(noCreator, undefined).headline).toBe('One friend called it.');
  });

  test('the creator\'s own screen still says You called it.', () => {
    const solo = settled({ winners: [['jack', '']], stake: 'Dinner' });
    expect(buildReveal({ bet: solo, viewerId: 'jack' })).toMatchObject({ headline: 'You called it.', subline: 'Solo win. Dinner’s on everyone else.' });
    const crew = settled({ winners: [['maya', 'Maya'], ['jack', '']], stake: 'Dinner' });
    expect(buildReveal({ bet: crew, viewerId: 'jack' })).toMatchObject({ headline: 'You called it.', subline: 'You & Maya won. Dinner’s on everyone else.' });
  });
});

describe('the card\'s winners line follows the stake', () => {
  test.each([
    ['', 'Bragging rights, secured.', ''],
    ['Bragging rights', 'Bragging rights, secured.', 'Stakes: Bragging rights'],
    ['Coffee', 'Coffee’s on everyone else.', 'Stakes: Coffee'],
    ['Lunch', 'Lunch is on everyone else.', 'Stakes: Lunch'],
    ['Drinks', 'Drinks are on everyone else.', 'Stakes: Drinks'],
    ['Dinner', 'Dinner’s on everyone else.', 'Stakes: Dinner'],
    ['$5', 'Time for everyone else to pay up.', 'Stakes: $5'],
    ['Loser buys pizza', 'Time for everyone else to pay up.', 'Stakes: Loser buys pizza'],
  ])('stake %j', (stake, line, stakeText) => {
    const solo = buildWinnerCard(settled({ winners: [['maya', 'Maya']], losers: [['zed', 'Zed']], stake }), { measure });
    expect(solo.text.subline).toBe(`Called it solo. ${line}`);
    expect(textOf(solo, 'subline').join(' ')).toBe(`Called it solo. ${line}`);
    expect(textOf(solo, 'stake')).toEqual(stakeText ? [stakeText] : []);
    const crew = buildWinnerCard(settled({ winners: [['maya', 'Maya'], ['sam', 'Sam']], stake }), { measure });
    expect(textOf(crew, 'subline').join(' ')).toBe(line);
    // Every line fits inside the card, the subline in its two lines.
    expect(textOf(solo, 'subline').length).toBeLessThanOrEqual(2);
    [...solo.lines, ...crew.lines].forEach((item) => expect(measure(item.text, item.font)).toBeLessThanOrEqual(inner));
  });
});

describe('buildWinnerCard layout', () => {
  test('lines in reading order, inside the card, with the brand around them', () => {
    const card = buildWinnerCard(settled({ winners: [['maya', 'Maya']] }), { measure });
    expect(card).toMatchObject({ width: 1080, height: 1350, background: CARD_COLORS.background });
    expect(card.lines.map((line) => line.key)).toEqual(['question', 'eyebrow', 'headline', 'subline', 'subline', 'stake']);
    expect(card.lines.map((line) => line.text)).toEqual([
      'Chiefs cover -3?', 'Chiefs -3 won', 'Maya won.', 'Called it solo. Time for everyone else', 'to pay up.', 'Stakes: $20',
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
    expect(headline.map((line) => line.text).join(' ')).toBe('Bartholomew Maximilian, Anastasia Konstantin &\u00A02\u00A0others won.');
  });

  test('then cuts each name, so the count and "won." always show', () => {
    const winners = [['a', 'Bartholomew Maximilian Fitzgerald-Worthington'], ['b', 'Anastasia Konstantinopoulou'],
      ['c', 'Kim'], ['d', 'Lee'], ['e', 'Ana'], ['f', 'Ravi']];
    const card = buildWinnerCard(settled({ winners }), { measure });
    const headline = card.lines.filter((line) => line.key === 'headline').map((line) => line.text);
    expect(headline.length).toBeLessThanOrEqual(3);
    const joined = headline.join(' ');
    expect(joined).toMatch(/^Bartholomew.*…, Anastasia.*… &\u00A04\u00A0others won\.$/);
    expect(headline.some((line) => line.includes('&\u00A04\u00A0others'))).toBe(true);
    const font = card.lines.find((line) => line.key === 'headline').font;
    headline.forEach((line) => expect(measure(line, font)).toBeLessThanOrEqual(inner));
  });

  test('the count stays with "others": no "Sam & 2" ending a line', () => {
    // At 100px a line holds 17 characters: plain spaces would wrap this as
    // "Jo, Sam & 2" / "others won.".
    const winners = [['jo', 'Jo'], ['sam', 'Sam'], ['kim', 'Kim'], ['lee', 'Lee']];
    const card = buildWinnerCard(settled({ winners }), { measure });
    expect(wrapText('Jo, Sam & 2 others won.', { width: inner, font: '800 100px x', maxLines: 3, measure }))
      .toEqual(['Jo, Sam & 2', 'others won.']);
    expect(textOf(card, 'headline')).toEqual(['Jo, Sam', '&\u00A02\u00A0others won.']);
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
  test('never breaks at a no-break space', () => {
    const nb = (text) => text.replace(/_/g, '\u00A0');
    expect(wrapText(nb('Sam &_2_others won.'), { ...opts, width: 60, maxLines: 3 }))
      .toEqual(['Sam', nb('&_2_others'), 'won.']);
    expect(wrapText(nb('aa bb_cc dd'), { ...opts, width: 30, maxLines: 3 })).toEqual(['aa', nb('bb_cc'), 'dd']);
  });
  test('a no-break run wider than a line is still broken', () => {
    const run = Array(5).fill('abc').join('\u00A0');
    const lines = wrapText(run, { ...opts, maxLines: 3 });
    expect(lines.join('')).toBe(run);
    lines.forEach((line) => expect(measure(line, opts.font)).toBeLessThanOrEqual(50));
  });
  test('clipping keeps a no-break run whole up to the ellipsis', () => {
    const lines = wrapText('aaaa bbbb &\u00A04\u00A0others won. more words', { ...opts, width: 60 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('aaaa bbbb');
    expect(lines[1].startsWith('&\u00A04\u00A0others')).toBe(true);
    expect(lines[1].endsWith('…')).toBe(true);
  });
  test('empty text has no lines', () => {
    expect(wrapText('   ', opts)).toEqual([]);
  });
});

describe('graphemes', () => {
  const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
  const flag = '\u{1F1FA}\u{1F1F8}';
  const thumbs = '\u{1F44D}\u{1F3FD}';
  const accent = 'e\u0301';

  test('keeps emoji, ZWJ sequences, flags and accents whole', () => {
    expect(graphemes(`a${family}${flag}${thumbs}${accent}`)).toEqual(['a', family, flag, thumbs, accent]);
  });

  test('falls back to code points without Intl.Segmenter', () => {
    const { Segmenter } = Intl;
    try {
      delete Intl.Segmenter;
      expect(graphemes(`a${flag}`)).toEqual(['a', '\u{1F1FA}', '\u{1F1F8}']);
    } finally {
      Intl.Segmenter = Segmenter;
    }
  });

  // Each grapheme 10 units wide, the measure the layout sees on a canvas.
  const byGrapheme = (text) => graphemes(text).length * 10;
  const opts = { width: 50, font: '400 10px x', maxLines: 2, measure: byGrapheme };

  test('a hard break never splits an emoji sequence', () => {
    const word = Array(7).fill(family).join('');
    const lines = wrapText(word, { ...opts, maxLines: 3 });
    expect(lines.join('')).toBe(word);
    lines.forEach((line) => expect(graphemes(line).every((g) => g === family)).toBe(true));
  });

  test('clipping never splits an emoji sequence, and keeps no-break runs', () => {
    const lines = wrapText(`aa bb ${Array(8).fill(family).join('')} c`, opts);
    expect(lines).toEqual(['aa bb', `${Array(4).fill(family).join('')}…`]);
    const nb = wrapText(`aa bb &\u00A04\u00A0${flag}${flag} more`, { ...opts, width: 60 });
    expect(nb[0]).toBe('aa bb');
    expect(nb[1]).toBe(`&\u00A04\u00A0${flag}…`);
  });

  test('cut names keep their emoji whole', () => {
    const name = `${'Bartholomew'}${family}${family}${family}${family}${family}${family}${family}${family}`;
    const card = buildWinnerCard(settled({ winners: [['m', name], ['z', `Zed ${'x'.repeat(40)}`]] }), { measure });
    const headline = card.lines.filter((line) => line.key === 'headline').map((line) => line.text).join(' ');
    expect(headline).toContain('…');
    // Whatever is left once whole families are taken out has no piece of one.
    expect(headline.split(family).join('')).not.toMatch(/[\u200D\u{1F466}-\u{1F469}]/u);
  });
});

describe('textDirection', () => {
  test.each([
    ['Maya won.', 'ltr'],
    ['Stakes: $20', 'ltr'],
    ['\u05DE\u05D0\u05D9\u05D4 won.', 'rtl'],
    ['$20 \u0645\u0631\u062D\u0628\u0627', 'rtl'],
    ['Chiefs vs \u05DE\u05DB\u05D1\u05D9?', 'ltr'],
    ['123 ?', 'ltr'],
    ['', 'ltr'],
  ])('%s is %s', (text, dir) => {
    expect(textDirection(text)).toBe(dir);
  });
});
