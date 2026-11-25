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
