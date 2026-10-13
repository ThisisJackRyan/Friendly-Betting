import { render, screen } from '@testing-library/react';
import Link from './Link';

jest.mock('next/link');

test('on the web a tab link replaces the current entry and other links push', () => {
  render(<>
    <Link href="/">Home</Link>
    <Link href="/bets">My bets</Link>
    <Link href="/#how-it-works">How it works</Link>
    <Link href="/new">Create</Link>
    <Link href="/t/abc">Tally</Link>
    <Link href="/t/abc" replace>Swap</Link>
  </>);
  const replaces = (name) => screen.getByRole('link', { name }).getAttribute('data-replace');
  expect(['Home', 'My bets', 'How it works'].map(replaces)).toEqual(['true', 'true', 'true']);
  expect(['Create', 'Tally'].map(replaces)).toEqual([null, null]);
  expect(replaces('Swap')).toBe('true');
});
