import { render, screen } from '@testing-library/react';
import ProBadge, { badgeLabel } from './ProBadge';

test('shows Pro, Founder, or Founder #N', () => {
  const { rerender, container } = render(<ProBadge badge={{ kind: 'pro' }} />);
  expect(screen.getByText('Pro')).toHaveClass('pro-badge', 'pro-badge-pro');
  rerender(<ProBadge badge={{ kind: 'founder' }} />);
  expect(screen.getByText('Founder')).toHaveClass('pro-badge-founder');
  rerender(<ProBadge badge={{ kind: 'founder', number: 42 }} />);
  expect(screen.getByText('Founder #42')).toBeInTheDocument();
  rerender(<ProBadge badge={null} />);
  expect(container).toBeEmptyDOMElement();
});

test('badgeLabel matches what the badge shows', () => {
  expect(badgeLabel({ kind: 'pro' })).toBe('Pro');
  expect(badgeLabel({ kind: 'founder', number: 3 })).toBe('Founder #3');
  expect(badgeLabel(null)).toBe('');
});
