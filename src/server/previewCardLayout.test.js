import { FONT_SIZES, MAX_LINES, fixOrphan, layoutQuestion, textWidth } from './previewCardLayout';

const WIDTH = 1008;
const fits = ({ fontSize, lines }) => lines.every((line) => textWidth(line) * fontSize <= WIDTH + 0.5);
const isOrphan = (lines) => lines.length > 1 && !lines[lines.length - 1].includes(' ');

test('a short question stays on one line at the largest size', () => {
  const layout = layoutQuestion('Rain on Saturday?', WIDTH);
  expect(layout.lines).toEqual(['Rain on Saturday?']);
  expect(layout.fontSize).toBe(FONT_SIZES[0]);
});

test('the sample question breaks into balanced lines with no orphan', () => {
  const layout = layoutQuestion('Will Sam actually finish the marathon before the end of next spring?', WIDTH);
  expect(layout.lines.length).toBeGreaterThan(1);
  expect(layout.lines.length).toBeLessThanOrEqual(MAX_LINES);
  expect(isOrphan(layout.lines)).toBe(false);
  expect(fits(layout)).toBe(true);
  expect(layout.lines.join(' ')).toBe('Will Sam actually finish the marathon before the end of next spring?');
});

test('a lone last word pulls the word before it down when it fits', () => {
  expect(fixOrphan([['Will', 'it', 'rain'], ['today?']], 20)).toEqual([['Will', 'it'], ['rain', 'today?']]);
  expect(fixOrphan([['Will', 'it', 'rain'], ['today?']], 4)).toEqual([['Will', 'it', 'rain'], ['today?']]);
  expect(fixOrphan([['Rain?']], 20)).toEqual([['Rain?']]);
});

test.each([
  'Who wins tonight?',
  'Will the Chiefs cover the spread against the Bills this Sunday night?',
  'Will it snow in Austin before New Year, and will school actually close for it?',
  'Is the new pizza place on Fifth Street better than the old one on Main, yes or no, final answer?',
  'Does Priya beat Jordan at Mario Kart three races in a row this weekend at the cabin trip?',
])('%p uses at most three lines, fits, and has no orphan', (question) => {
  const layout = layoutQuestion(question, WIDTH);
  expect(layout.lines.length).toBeLessThanOrEqual(MAX_LINES);
  expect(isOrphan(layout.lines)).toBe(false);
  expect(fits(layout)).toBe(true);
  expect(layout.lines.join(' ')).toBe(question);
});

test('a longer question gets a smaller size than a short one', () => {
  const short = layoutQuestion('Rain tomorrow?', WIDTH);
  const long = layoutQuestion('Will it snow in Austin before New Year, and will school actually close for it?', WIDTH);
  expect(long.fontSize).toBeLessThan(short.fontSize);
});

test('a very long question shrinks to the smallest size and ends with an ellipsis', () => {
  const question = 'Will '.concat('the group chat finally agree on where to go for dinner '.repeat(6), 'this year?');
  const layout = layoutQuestion(question, WIDTH);
  expect(layout.fontSize).toBe(FONT_SIZES[FONT_SIZES.length - 1]);
  expect(layout.lines).toHaveLength(MAX_LINES);
  expect(layout.lines[MAX_LINES - 1].endsWith('…')).toBe(true);
  expect(fits(layout)).toBe(true);
});

test.each([
  'x'.repeat(400),
  `Is ${'a'.repeat(120)} real?`,
  '\u{1F3C3}'.repeat(80),
])('a long unbroken word does not throw and stays inside the card', (question) => {
  const layout = layoutQuestion(question, WIDTH);
  expect(layout.lines.length).toBeGreaterThan(0);
  expect(layout.lines.length).toBeLessThanOrEqual(MAX_LINES);
  expect(fits(layout)).toBe(true);
});

test.each(['', '   ', null, undefined])('an empty question %p gives no lines', (question) => {
  expect(layoutQuestion(question, WIDTH).lines).toEqual([]);
});
