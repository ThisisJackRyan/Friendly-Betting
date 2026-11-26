import {
  CLOSED_CARD_COPY, CLOSED_TEXT_COPY, LINK_STATUS, closedTitle, formatCalledOffText, formatSettledText, withStatus,
} from './closedCopy';
import { smsHref } from './share';

const LINK = 'https://www.friendly-bets.com/b/abc123';

test('withStatus adds ?s=, or &s= after a query, before any fragment', () => {
  expect(withStatus(LINK, 'settled')).toBe(`${LINK}?s=settled`);
  expect(withStatus(`${LINK}?ref=sms`, 'off')).toBe(`${LINK}?ref=sms&s=off`);
  expect(withStatus(`${LINK}#top`, 'closed')).toBe(`${LINK}?s=closed#top`);
  expect(withStatus(` ${LINK} `, '')).toBe(LINK);
  expect(LINK_STATUS).toEqual({ settled: 'settled', calledOff: 'off', closed: 'closed' });
});

test('settled text, exactly, with and without stakes', () => {
  expect(formatSettledText({ question: 'Will it rain?', side: 'Yes', stake: 'Coffee', url: LINK })).toBe(
    'Bet settled:\nWill it rain?\n\nWinning pick:\nYes\n\nStakes:\nCoffee\n\nSee who called it:\nhttps://www.friendly-bets.com/b/abc123?s=settled',
  );
  for (const stake of ['', '   ', '\n\t', undefined]) {
    expect(formatSettledText({ question: 'Will it rain?', side: 'Yes', stake, url: LINK })).toBe(
      'Bet settled:\nWill it rain?\n\nWinning pick:\nYes\n\nSee who called it:\nhttps://www.friendly-bets.com/b/abc123?s=settled',
    );
  }
});

test('called-off text, exactly', () => {
  expect(formatCalledOffText({ question: ' Will  it\nrain? ', url: LINK })).toBe(
    'Bet called off:\nWill it rain?\n\nNobody won this one.\n\nSee the bet:\nhttps://www.friendly-bets.com/b/abc123?s=off',
  );
});

test('the sms: href encodes each newline as %0A, ends on the link, never on %0A', () => {
  const text = formatSettledText({ question: 'Will it rain?', side: 'Yes', stake: 'Coffee', url: LINK });
  for (const href of [smsHref(text, 'iPhone'), smsHref(text, 'Android')]) {
    const body = href.split('body=')[1];
    expect(body).toContain('Bet%20settled%3A%0AWill%20it%20rain%3F%0A%0AWinning%20pick%3A%0AYes%0A%0A');
    expect(body).not.toMatch(/%0A$/);
    expect(body.endsWith(`%0A${encodeURIComponent(`${LINK}?s=settled`)}`)).toBe(true);
    expect(decodeURIComponent(body)).toBe(text);
  }
  const off = smsHref(formatCalledOffText({ question: 'Q', url: LINK }), 'iPhone');
  expect(off).toBe(`sms:&body=Bet%20called%20off%3A%0AQ%0A%0ANobody%20won%20this%20one.%0A%0ASee%20the%20bet%3A%0A${encodeURIComponent(`${LINK}?s=off`)}`);
});

test('every text template is plain GSM-7: straight quotes, no dashes, middle dot or ellipsis character', () => {
  for (const line of Object.values(CLOSED_TEXT_COPY)) {
    expect(line).not.toMatch(/[‘’“”–—…·]/);
    // GSM-7 basic set only: letters, digits, space and plain punctuation.
    expect(line).toMatch(/^[A-Za-z0-9 .,:?!"']+$/);
  }
});

test('card copy and og titles', () => {
  expect(CLOSED_CARD_COPY.settled.hero('Yes')).toBe('Yes won.');
  expect(closedTitle(CLOSED_CARD_COPY.settled.hero('Yes'), ' Will  it rain? ')).toBe('Yes won. Will it rain?');
  expect(CLOSED_CARD_COPY.settled.description).toBe('See who called it on Friendly Bets.');
  expect(CLOSED_CARD_COPY.calledOff.hero()).toBe('Called off.');
  expect(CLOSED_CARD_COPY.calledOff.note).toBe('Nobody won this one.');
  expect(CLOSED_CARD_COPY.closed.hero()).toBe('Picks are in.');
  expect(CLOSED_CARD_COPY.closed.note).toBe('Waiting on the result.');
  for (const copy of Object.values(CLOSED_CARD_COPY)) {
    expect(`${copy.hero('x')} ${copy.note} ${copy.description}`).not.toMatch(/[–—']|[A-Z]{3,}/);
  }
});
