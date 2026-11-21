import fs from 'fs';
import path from 'path';
import { INVITE_COPY, formatInvite } from './inviteCopy';
import { smsHref } from './share';

const url = 'https://www.friendly-bets.com/b/ABC123';
const bet = { title: 'Chiefs cover -3?', stake: '$20', url };
const sides = ['Chiefs -3', 'Bills +3'];

// GSM 03.38 basic set plus its extension table: anything else forces UCS-2.
const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

function expectGsm7(text) {
  expect(text).toMatch(GSM7);
  expect(text).not.toMatch(/[‘’“”—–·]/);
}

test('with stakes, the invite is the question, the stakes, and the link alone on the last line', () => {
  expect(formatInvite(bet)).toBe(
    'New bet:\nChiefs cover -3?\n\nStakes:\n$20\n\nPick your side:\nhttps://www.friendly-bets.com/b/ABC123',
  );
});

test.each([['', 'empty'], ['   ', 'blank'], [' \n\t ', 'whitespace'], [undefined, 'missing'], [null, 'null']])(
  'a %p stake (%s) drops the Stakes block and its blank line',
  (stake) => {
    expect(formatInvite({ ...bet, stake })).toBe(
      'New bet:\nChiefs cover -3?\n\nPick your side:\nhttps://www.friendly-bets.com/b/ABC123',
    );
  },
);

test('the question and stakes are trimmed with every whitespace run collapsed to one space', () => {
  expect(formatInvite({ title: '  Who is\n\n late \t tonight  ', stake: ' a\r\n  coffee ', url })).toBe(
    `New bet:\nWho is late tonight\n\nStakes:\na coffee\n\nPick your side:\n${url}`,
  );
});

test('the question and stakes are otherwise kept as entered: no punctuation added, case and emoji kept', () => {
  expect(formatInvite({ title: 'who wins TONIGHT 🏀', stake: 'Loser buys 🍕', url })).toBe(
    `New bet:\nwho wins TONIGHT 🏀\n\nStakes:\nLoser buys 🍕\n\nPick your side:\n${url}`,
  );
});

test('a long question is not truncated', () => {
  const title = 'Will it rain '.repeat(30).trim();
  expect(formatInvite({ title, stake: '', url })).toContain(`\n${title}\n`);
});

test('the invite has no sides, no counts, no trailing space or newline, and the link alone last', () => {
  for (const stake of ['$20', '']) {
    const text = formatInvite({ ...bet, stake });
    sides.forEach((side) => expect(text).not.toContain(side));
    expect(text).not.toMatch(/\b\d+ (?:votes?|picks?)\b|\d+%/i);
    expect(text).not.toMatch(/[ \t]$/m);
    expect(text.endsWith('\n')).toBe(false);
    expect(text.split('\n').at(-1)).toBe(url);
    expectGsm7(text);
  }
});

test('every invite template is GSM-7 with no em dashes', () => {
  Object.values(INVITE_COPY).forEach(expectGsm7);
});

test.each([
  ['iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'sms:&body='],
  ['Android', 'Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'sms:?body='],
])('the %s sms: link encodes the line breaks as %%0A', (_os, ua, prefix) => {
  const text = formatInvite(bet);
  const href = smsHref(text, ua);
  expect(href.startsWith(prefix)).toBe(true);
  const body = href.slice(prefix.length);
  expect(body).toBe(encodeURIComponent(text));
  expect(body).toBe(
    'New%20bet%3A%0AChiefs%20cover%20-3%3F%0A%0AStakes%3A%0A%2420%0A%0APick%20your%20side%3A%0Ahttps%3A%2F%2Fwww.friendly-bets.com%2Fb%2FABC123',
  );
  expect(body).not.toMatch(/\n/);
  expect(decodeURIComponent(body)).toBe(text);
});

test('the tally builds its one invite from the invite copy, not formatSms', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
  expect(read('TallyScreen.jsx')).toMatch(/formatInvite\(/);
  expect(read('CreateForm.jsx')).not.toMatch(/formatInvite|shareMessage/);
  expect(read('model.js')).not.toMatch(/formatSms/);
});
