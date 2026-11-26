import { CARD_COLORS, previewCard } from './previewCard';
import { BRAND_ACCENT } from '../phone/brandColors';

const textOf = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.props?.children);
};
const stylesOf = (node) => {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(stylesOf);
  return [node.props?.style || {}, ...stylesOf(node.props?.children)];
};

const QUESTION = 'Will Sam actually finish the marathon before the end of next spring?';
const nodesWithText = (node, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((child) => nodesWithText(child, out)); return out; }
  const { children } = node.props || {};
  if (typeof children === 'string') out.push(node);
  else nodesWithText(children, out);
  return out;
};

test('the question card shows the question, the name, and no labels', () => {
  const text = textOf(previewCard(QUESTION));
  expect(text).toContain('Friendly Bets');
  expect(text).toContain('marathon');
  expect(text).not.toMatch(/New bet|\$/);
});

test('only the question lines are the brand green; the name and background stay ink on white', () => {
  const card = previewCard(QUESTION);
  expect(CARD_COLORS.title).toBe(BRAND_ACCENT);
  const leaves = nodesWithText(card);
  const wordmark = leaves.filter((node) => node.props.children === 'Friendly Bets');
  const lines = leaves.filter((node) => node.props.children !== 'Friendly Bets');
  expect(wordmark).toHaveLength(1);
  expect(wordmark[0].props.style.color).toBe('#1a1a1a');
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.map((node) => node.props.children).join(' ')).toBe(QUESTION);
  lines.forEach((node) => expect(node.props.style.color).toBe(BRAND_ACCENT));
  expect(card.props.style).toMatchObject({ background: '#ffffff', color: '#1a1a1a' });
  const others = JSON.stringify(stylesOf(card).filter((style) => !lines.some((node) => node.props.style === style)));
  expect(others.toLowerCase()).not.toMatch(/#007a45|#a6c9a9|#deecd5|green/);
});

test('the fallback card is the app icon and the name only', () => {
  const card = previewCard('', { iconSrc: 'data:image/svg+xml;base64,AA==' });
  expect(textOf(card).trim()).toBe('Friendly Bets');
  const img = card.props.children.find((child) => child && child.type === 'img');
  expect(img.props.src).toBe('data:image/svg+xml;base64,AA==');
  expect(card.props.style).toMatchObject({ background: '#ffffff', color: '#1a1a1a' });
  expect(JSON.stringify(stylesOf(card)).toLowerCase()).not.toMatch(/#007a45|#a6c9a9|#deecd5|green/);
});

describe('closed cards', () => {
  const leavesOf = (card) => nodesWithText(card).map((node) => ({ text: node.props.children, style: node.props.style }));

  test('settled: "{side} won." in brand green, the question in ink under it at about half size, the name', () => {
    const leaves = leavesOf(previewCard(QUESTION, { status: 'settled', side: 'Yes' }));
    expect(leaves.map((leaf) => leaf.text)).toEqual(['Yes won.', 'Will Sam actually finish the marathon', 'before the end of next spring?', 'Friendly Bets']);
    expect(leaves[0].style.color).toBe(BRAND_ACCENT);
    expect(leaves[1].style.color).toBe('#1a1a1a');
    expect(leaves[1].style.fontSize).toBe(Math.round(leaves[0].style.fontSize / 2));
    expect(leaves[3].style.color).toBe('#1a1a1a');
  });

  test('called off and picks in: dark hero, the question, a muted note, and no green', () => {
    for (const [status, hero, note] of [['calledOff', 'Called off.', 'Nobody won this one.'], ['closed', 'Picks are in.', 'Waiting on the result.']]) {
      const card = previewCard(QUESTION, { status });
      const leaves = leavesOf(card);
      expect(leaves[0]).toMatchObject({ text: hero, style: { color: '#1a1a1a' } });
      expect(leaves.at(-2)).toMatchObject({ text: note, style: { color: CARD_COLORS.muted } });
      expect(leaves.at(-1).text).toBe('Friendly Bets');
      expect(textOf(card)).toContain('marathon');
      expect(JSON.stringify(stylesOf(card)).toLowerCase()).not.toMatch(/#007a45|green/);
    }
  });

  test('a long side is cut with an ellipsis before " won." in at most two lines', () => {
    const side = 'Sam finishes strong, crosses the line before noon, and somehow still has the legs to dance at the after party';
    const hero = leavesOf(previewCard(QUESTION, { status: 'settled', side })).filter((leaf) => leaf.style.color === BRAND_ACCENT);
    expect(hero.length).toBeLessThanOrEqual(2);
    expect(hero.at(-1).text).toMatch(/… won\.$/);
    expect(hero.map((leaf) => leaf.text).join(' ')).toMatch(/^Sam finishes strong/);
  });

  test('an open status, an unknown status, or settled with no side is the open card', () => {
    const open = JSON.stringify(previewCard(QUESTION));
    expect(JSON.stringify(previewCard(QUESTION, { status: 'open' }))).toBe(open);
    expect(JSON.stringify(previewCard(QUESTION, { status: 'nope' }))).toBe(open);
    expect(JSON.stringify(previewCard(QUESTION, { status: 'settled', side: '  ' }))).toBe(open);
  });
});
