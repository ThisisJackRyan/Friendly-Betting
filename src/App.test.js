import { render, screen } from '@testing-library/react';
import App from './App';

test('opens on the new bet form', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /new bet/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /text friends/i })).toBeInTheDocument();
});
