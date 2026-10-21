import { buildSettlement } from './settlement';

// setupTests.js swaps this module out for every other test; this one tests
// the real drawing against a recording canvas, since jsdom has none.
jest.unmock('./winnerCardImage');
const { drawWinnerCard, renderWinnerCard } = jest.requireActual('./winnerCardImage');

const OPTIONS = [{ id: 'a', label: 'Chiefs -3' }, { id: 'b', label: 'Bills +3' }];
const open = {
  id: 'abc123', code: 'abc123', schemaVersion: 2, question: 'Chiefs cover -3?', stake: '$20',
  createdByID: 'jack', status: 'open', options: OPTIONS,
  votes: [{ voterId: 'maya', name: 'Maya', optionId: 'a' }, { voterId: 'zed', name: 'Zed', optionId: 'b' }],
};
const settledBet = { ...open, status: 'closed', winnerId: 'a', settledAt: 1, settlement: buildSettlement(open, 'a') };

function fakeDoc({ fonts, context = true, blob = new Blob(['png'], { type: 'image/png' }) } = {}) {
  const calls = [];
  const ctx = {
    font: '',
    fillStyle: '',
    measureText: (text) => ({ width: Array.from(text).length * 20 }),
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    fillText: (text, x, y) => calls.push(['fillText', text, x, y, ctx.font, ctx.fillStyle]),
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    rect: () => {},
    fill: () => calls.push(['fill', ctx.fillStyle]),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: jest.fn(() => (context ? ctx : null)),
    toBlob: jest.fn((done, type) => done(type === 'image/png' ? blob : null)),
  };
  return { calls, canvas, doc: { fonts, createElement: jest.fn(() => canvas) } };
}

const drawn = (calls) => calls.filter(([op]) => op === 'fillText').map(([, text]) => text);

test('draws the card at 1080x1350 and returns a PNG blob', async () => {
  const { doc, canvas, calls } = fakeDoc({ fonts: { load: jest.fn(async () => []) } });
  const blob = await renderWinnerCard(settledBet, null, doc);
  expect(blob.type).toBe('image/png');
  expect([canvas.width, canvas.height]).toEqual([1080, 1350]);
  expect(calls[0]).toEqual(['fillRect', 0, 0, 1080, 1350]);
  const text = drawn(calls);
  // The brand goes letter by letter, for its tight spacing.
  expect(text.slice(0, 9).join('')).toBe('friendly.');
  // The symbol: a white tile, then the green F and its dot.
  expect(calls.filter(([op]) => op === 'fill')).toEqual([['fill', '#ffffff'], ['fill', '#007a45'], ['fill', '#007a45']]);
  expect(text).toEqual(expect.arrayContaining(['Chiefs cover -3?', 'Chiefs -3 won', 'Maya won.', 'Stakes: $20', 'friendly-bets.com']));
  expect(doc.fonts.load).toHaveBeenCalledWith('800 40px Manrope');
  const headline = calls.find((call) => call[1] === 'Maya won.');
  expect(headline[4]).toMatch(/^800 100px Manrope, /);
});

test('still draws when the font fails to load, in the fallback fonts', async () => {
  const { doc, calls } = fakeDoc({ fonts: { load: jest.fn(async () => { throw new Error('offline'); }) } });
  const blob = await renderWinnerCard(settledBet, null, doc);
  expect(blob).not.toBeNull();
  expect(drawn(calls)).toContain('Maya won.');
});

test('a font that never answers only holds the card up briefly', async () => {
  jest.useFakeTimers();
  try {
    const { doc } = fakeDoc({ fonts: { load: () => new Promise(() => {}) } });
    const pending = renderWinnerCard(settledBet, null, doc);
    await jest.advanceTimersByTimeAsync(1600);
    await expect(pending).resolves.not.toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('works without document.fonts at all', async () => {
  const { doc } = fakeDoc({});
  await expect(renderWinnerCard(settledBet, null, doc)).resolves.not.toBeNull();
});

test.each([
  ['an open bet', open, {}],
  ['a called-off bet', { ...settledBet, calledOff: true }, {}],
  ['no 2d context', settledBet, { context: false }],
  ['toBlob gives nothing', settledBet, { blob: null }],
])('null, never a throw, for %s', async (_label, bet, options) => {
  const { doc } = fakeDoc(options);
  await expect(renderWinnerCard(bet, null, doc)).resolves.toBeNull();
});

test('null when creating the canvas throws, or there is no document', async () => {
  await expect(renderWinnerCard(settledBet, null, { createElement: () => { throw new Error('nope'); } })).resolves.toBeNull();
  await expect(renderWinnerCard(settledBet, null, null)).resolves.toBeNull();
});

test('drawWinnerCard draws the rule only when there is one', () => {
  const calls = [];
  const noop = () => {};
  const ctx = {
    measureText: () => ({ width: 10 }), fillRect: (...a) => calls.push(a), fillText: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, fill: noop, roundRect: noop,
  };
  const card = {
    width: 10, height: 10, background: '#000', lines: [], rule: null,
    brand: { text: 'f', period: '.', font: 'x', color: '#fff', letter: '#000', periodColor: '#fff', x: 0, y: 0, symbol: 32, spacing: 1 },
    footer: { text: 'f', font: 'x', color: '#fff', x: 0, y: 0 },
  };
  drawWinnerCard(ctx, card);
  expect(calls).toHaveLength(1);
  drawWinnerCard(ctx, { ...card, rule: { x: 1, y: 2, width: 3, color: '#fff' } });
  expect(calls.at(-1)).toEqual([1, 2, 3, 2]);
});

test('a right-to-left line is set rtl from the right edge; left-to-right lines stay as they were', () => {
  const calls = [];
  const noop = () => {};
  const ctx = {
    direction: 'inherit', textAlign: 'start',
    measureText: () => ({ width: 10 }), fillRect: noop,
    fillText: (text, x, y) => calls.push([text, x, y, ctx.direction, ctx.textAlign]),
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, fill: noop, roundRect: noop,
  };
  const hebrew = '\u05DE\u05D0\u05D9\u05D4 won.';
  const card = {
    width: 1080, height: 10, background: '#000', rule: null,
    lines: [
      { text: 'Chiefs cover?', x: 96, y: 300, font: 'x', color: '#fff' },
      { text: hebrew, x: 96, y: 400, font: 'x', color: '#fff' },
      { text: 'Stakes: $20', x: 96, y: 500, font: 'x', color: '#fff' },
    ],
    brand: { text: 'f', period: '.', font: 'x', color: '#fff', letter: '#000', periodColor: '#fff', x: 0, y: 0, symbol: 32, spacing: 1 },
    footer: { text: 'friendly-bets.com', font: 'x', color: '#fff', x: 96, y: 1254 },
  };
  drawWinnerCard(ctx, card);
  const line = (text) => calls.find(([drawnText]) => drawnText === text);
  expect(line('Chiefs cover?')).toEqual(['Chiefs cover?', 96, 300, 'ltr', 'left']);
  expect(line(hebrew)).toEqual([hebrew, 984, 400, 'rtl', 'right']);
  expect(line('Stakes: $20')).toEqual(['Stakes: $20', 96, 500, 'ltr', 'left']);
  expect(line('friendly-bets.com')).toEqual(['friendly-bets.com', 96, 1254, 'ltr', 'left']);
});

test('draws I only on the card the creator shares', async () => {
  const bet = { ...open, votes: [{ voterId: 'jack', name: '', optionId: 'a' }, ...open.votes] };
  const settled = { ...bet, status: 'closed', winnerId: 'a', settledAt: 1, settlement: buildSettlement(bet, 'a') };
  const lines = async (viewerId) => {
    const { doc, calls } = fakeDoc();
    await renderWinnerCard(settled, viewerId, doc);
    return drawn(calls).join('\n');
  };
  expect(await lines('jack')).toContain('Maya & I won.');
  await Promise.all(['maya', 'zed', null, undefined, ''].map(async (viewerId) => {
    const text = await lines(viewerId);
    expect(text).toContain('Maya & 1 other won.');
    ['I called it.', '& I won.', '& I won.'].forEach((line) => expect(text).not.toContain(line));
  }));
});
