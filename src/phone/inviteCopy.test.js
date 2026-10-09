import fs from 'fs';
import path from 'path';
import { INVITE_COPY, formatInvite, formatTallyInvite } from './inviteCopy';

const url = 'https://www.friendly-bets.com/b/ABC123';
const bet = { title: 'Chiefs cover -3?', stake: '$20', url };
const sides = ['Chiefs -3', 'Bills +3'];

// GSM 03.38 basic set plus its extension table: anything else forces UCS-2.
const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

function expectGsm7(text) {
  expect(text).toMatch(GSM7);
  expect(text).not.toMatch(/[‘’“”—–·]/);
}

test('Text friends is the title, stake, and link alone on the last line', () => {
  expect(formatInvite(bet)).toBe(
    'New bet: Chiefs cover -3?\nStakes: $20\nPick your side: https://www.friendly-bets.com/b/ABC123',
  );
});

test('Text the crew asks for picks without any counts', () => {
  expect(formatTallyInvite(bet)).toBe(
    'Votes are coming in on Chiefs cover -3?\nStakes: $20\nGet your pick in: https://www.friendly-bets.com/b/ABC123',
  );
});

test.each([['', 'empty'], ['   ', 'blank'], [undefined, 'missing']])('a %s stake (%s) drops the Stakes line', (stake) => {
  expect(formatInvite({ ...bet, stake })).toBe('New bet: Chiefs cover -3?\nPick your side: https://www.friendly-bets.com/b/ABC123');
  expect(formatTallyInvite({ ...bet, stake })).toBe(
    'Votes are coming in on Chiefs cover -3?\nGet your pick in: https://www.friendly-bets.com/b/ABC123',
  );
});

test('the title is trimmed and kept as entered, with no punctuation added', () => {
  expect(formatInvite({ title: '  Who is late  ', stake: ' a coffee ', url })).toBe(
    `New bet: Who is late\nStakes: a coffee\nPick your side: ${url}`,
  );
  expect(formatTallyInvite({ title: 'Who is late', url })).toBe(`Votes are coming in on Who is late\nGet your pick in: ${url}`);
});

test.each([['create', formatInvite], ['tally', formatTallyInvite]])('%s invite: no sides, no counts, link last, GSM-7 only', (_kind, format) => {
  for (const stake of ['$20', '']) {
    const text = format({ ...bet, stake });
    sides.forEach((side) => expect(text).not.toContain(side));
    expect(text).not.toMatch(/\b\d+ (?:votes?|picks?)\b|\d+%/i);
    expect(text.split('\n').at(-1)).toMatch(new RegExp(`: ${url.replace(/[.]/g, '\\.')}$`));
    expectGsm7(text);
  }
});

test('every invite template is GSM-7 with no em dashes', () => {
  Object.values(INVITE_COPY).forEach((copy) => Object.values(copy).forEach(expectGsm7));
});

test('Create and the tally build their texts from the invite copy, not formatSms', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
  expect(read('CreateForm.jsx')).toMatch(/formatInvite\(/);
  expect(read('TallyScreen.jsx')).toMatch(/formatTallyInvite\(/);
  expect(read('model.js')).not.toMatch(/formatSms/);
});
