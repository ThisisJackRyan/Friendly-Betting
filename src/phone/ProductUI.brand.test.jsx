import { render } from '@testing-library/react';
import { Brand } from './ProductUI';

test('the Brand symbol is the dotless F from app/icon.svg on a rx 10 tile', () => {
  const { container } = render(<Brand />);
  const svg = container.querySelector('svg.brand-symbol');
  expect(svg).not.toBeNull();
  expect(svg.querySelector('circle')).toBeNull();
  const paths = svg.querySelectorAll('path');
  expect(paths).toHaveLength(1);
  expect(paths[0]).toHaveAttribute('d', 'M9 7h14v5h-9v2h6v5h-6v6H9V7Z');
  expect(svg.querySelector('rect')).toHaveAttribute('rx', '10');
});

test('the Brand wordmark reads Friendly Bets with no period', () => {
  const { container } = render(<Brand />);
  expect(container).toHaveTextContent('Friendly Bets');
  expect(container.querySelector('.brand-period')).toBeNull();
  expect(container.textContent).not.toContain('friendly.');
});
