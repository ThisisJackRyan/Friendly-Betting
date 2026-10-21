import { render, screen } from '@testing-library/react';
import ProBadge, { badgeLabel } from './ProBadge';

test('shows Pro, or nothing without a badge', () => {
  const { rerender, container } = render(<ProBadge badge={{ kind: 'pro' }} />);
  expect(screen.getByText('Pro')).toHaveClass('pro-badge');
  rerender(<ProBadge badge={null} />);
  expect(container).toBeEmptyDOMElement();
});

test('badgeLabel matches what the badge shows', () => {
  expect(badgeLabel({ kind: 'pro' })).toBe('Pro');
  expect(badgeLabel(null)).toBe('');
});
