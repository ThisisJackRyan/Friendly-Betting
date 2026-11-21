import { previewCard } from './previewCard';

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

test('the question card shows the question, the name, and no green or labels', () => {
  const card = previewCard('Will Sam actually finish the marathon before the end of next spring?');
  const text = textOf(card);
  expect(text).toContain('Friendly Bets');
  expect(text).toContain('marathon');
  expect(text).not.toMatch(/New bet|\$/);
  const colors = JSON.stringify(stylesOf(card)).toLowerCase();
  expect(colors).not.toMatch(/#007a45|#a6c9a9|#deecd5|green/);
});

test('the fallback card is the app icon and the name only', () => {
  const card = previewCard('', { iconSrc: 'data:image/svg+xml;base64,AA==' });
  expect(textOf(card).trim()).toBe('Friendly Bets');
  const img = card.props.children.find((child) => child && child.type === 'img');
  expect(img.props.src).toBe('data:image/svg+xml;base64,AA==');
});
