import fs from 'fs';
import path from 'path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Bars from './Bars';
import { VOTER_LIST_COPY, votersByOption } from './voters';

const bet = (votes, extra = {}) => ({
  schemaVersion: 2,
  type: 'money-line',
  options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }],
  votes,
  ...extra,
});
const vote = (voterId, name, optionId) => ({ voterId, name, optionId });
const rows = () => [...document.querySelectorAll('.bar-row')];
const css = fs.readFileSync(path.join(__dirname, 'phone.css'), 'utf8');

test('lists who picked each side under its bar', () => {
  render(<Bars showVoters bet={bet([vote('1', 'Jake', 'a'), vote('2', 'Maya', 'b'), vote('3', 'Tyler', 'a')])} />);
  const [yes, no] = rows();
  expect(within(yes).getByRole('list', { name: 'Picked by Jake and Tyler' })).toBeInTheDocument();
  expect(within(yes).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Jake', 'Tyler']);
  expect(within(no).getByRole('list', { name: 'Picked by Maya' })).toBeInTheDocument();
});

test('names are trimmed and unnamed picks collapse into a count', () => {
  render(<Bars showVoters bet={bet([
    vote('1', '  Jake ', 'a'), vote('2', '', 'a'), vote('3', '   ', 'a'), { voterId: '4', optionId: 'a' }, vote('5', '', 'b'),
  ])} />);
  const [yes, no] = rows();
  const list = within(yes).getByRole('list', { name: 'Picked by Jake and 3 friends' });
  expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Jake', '3 friends']);
  expect(within(no).getByRole('list', { name: 'Picked by 1 friend' })).toHaveTextContent('1 friend');
});

test('a side nobody picked shows no list', () => {
  render(<Bars showVoters bet={bet([vote('1', 'Jake', 'a')])} />);
  expect(within(rows()[1]).queryByRole('list')).not.toBeInTheDocument();
});

test('long names truncate with an ellipsis and keep the full name as a title', () => {
  const long = 'Bartholomew Maximilian Fitzgerald-Worthington the Third';
  render(<Bars showVoters bet={bet([vote('1', long, 'a')])} />);
  const item = screen.getByText(long);
  expect(item).toHaveClass('voter-name');
  expect(item).toHaveAttribute('title', long);
  const rule = css.match(/\.voter-name \{([^}]*)\}/)[1];
  expect(rule).toMatch(/text-overflow: ellipsis/);
  expect(rule).toMatch(/white-space: nowrap/);
  expect(rule).toMatch(/overflow: hidden/);
});

test('many voters show five names and a +N more control that expands the rest', async () => {
  const names = ['Jake', 'Maya', 'Tyler', 'Sam', 'Jack', 'Kim', 'Lee', 'Ana'];
  render(<Bars showVoters bet={bet([...names.map((name, i) => vote(`v${i}`, name, 'a')), vote('x', '', 'a')])} />);
  const list = screen.getByRole('list', { name: 'Picked by Jake, Maya, Tyler, Sam, Jack, 3 more, and 1 friend' });
  expect(within(list).queryByText('Kim')).not.toBeInTheDocument();
  const more = within(list).getByRole('button', { name: VOTER_LIST_COPY.more(3) });
  expect(more).toHaveTextContent('+3 more');
  expect(css).toMatch(/\.voter-more button \{[^}]*min-height: 44px/);

  await userEvent.click(more);
  const full = screen.getByRole('list', { name: 'Picked by Jake, Maya, Tyler, Sam, Jack, Kim, Lee, Ana, and 1 friend' });
  expect(within(full).getByText('Ana')).toBeInTheDocument();
  expect(within(full).queryByRole('button')).not.toBeInTheDocument();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(full).toHaveFocus();
});

test('names render as text, never as markup', () => {
  const nasty = '<img src=x onerror="window.__pwned=1">';
  render(<Bars showVoters bet={bet([vote('1', nasty, 'a')])} />);
  const item = screen.getByText(nasty);
  expect(item.textContent).toBe(nasty);
  expect(item.querySelector('img')).toBeNull();
  expect(document.querySelector('.bars img')).toBeNull();
  expect(window.__pwned).toBeUndefined();
});

test('a legacy over/under bet with only counts shows counts and no voter lists', () => {
  render(<Bars showVoters bet={{
    type: 'over-under', line: 3.5, over: 4, under: 2,
    options: [{ id: 'over', label: 'Over' }, { id: 'under', label: 'Under' }],
  }} />);
  expect([...document.querySelectorAll('.bar-count')].map((node) => node.textContent)).toEqual(['4 · 67%', '2 · 33%']);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(votersByOption({ votes: 'nope' })).toEqual({});
});

test('without showVoters the bars stay counts only', () => {
  render(<Bars bet={bet([vote('1', 'Jake', 'a')])} />);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(screen.queryByText('Jake')).not.toBeInTheDocument();
});

test('new voter copy has no em dashes', () => {
  const strings = [VOTER_LIST_COPY.friends(1), VOTER_LIST_COPY.friends(2), VOTER_LIST_COPY.more(3), VOTER_LIST_COPY.pickedBy('Jake')];
  strings.forEach((text) => expect(text).not.toMatch(/—/));
});
