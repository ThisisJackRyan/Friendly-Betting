/** @jest-environment node */
import { createHash } from 'crypto';
import { RESULT_TEXT_COPY } from '../phone/resultTextCopy';
import { buildSettlement } from '../phone/settlement';
import { fakeDb } from './testing/fakeDb';
import {
  buildResultSms,
  deliverResultTexts,
  gsm7Septets,
  MAX_NUMBERS_PER_BET,
  saveVoterNumber,
  toGsm7,
} from './resultTexts';

const NUMBERS = 'privateResultTexts/abc123/numbers';
const sha = (value) => createHash('sha256').update(value).digest('hex');

function openBet(overrides = {}) {
  return {
    schemaVersion: 2,
    code: 'abc123',
    status: 'open',
    question: 'Who is late',
    options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }],
    votes: [
      { voterId: 'jack', name: 'Jack', optionId: 'a' },
      { voterId: 'sam', name: 'Sam', optionId: 'b' },
    ],
    ...overrides,
  };
}

function settle(bet, winnerId) {
  return { ...bet, status: 'closed', winnerId, settledAt: 1, settlement: buildSettlement(bet, winnerId) };
}

const link = 'https://www.friendly-bets.com/t/abc123';
const wonText = `Friendly Bets: "Who is late" is settled. Yes won, and you called it. See the final tally: ${link}`;
const lostText = `Friendly Bets: "Who is late" is settled. Yes won. Better luck on the next one. See the final tally: ${link}`;
const calledOffText = `Friendly Bets: "Who is late" was called off, so nobody won this one. ${link}`;

describe('saveVoterNumber', () => {
  test('stores the number privately under its hash with the server-side vote', async () => {
    const db = fakeDb({ 'bets/abc123': openBet() });
    const before = db.data('bets/abc123');
    await saveVoterNumber({ db, code: 'abc123', uid: 'sam', phone: '(202) 555-0143', side: 'a', optionId: 'a', now: 42 });
    expect(db.paths('privateResultTexts/')).toEqual([`${NUMBERS}/${sha('+12025550143')}`]);
    expect(db.data(`${NUMBERS}/${sha('+12025550143')}`)).toEqual({
      e164: '+12025550143',
      voterId: 'sam',
      optionId: 'b',
      createdAt: 42,
    });
    expect(db.data('bets/abc123')).toEqual(before);
    expect(db.writes.every(([, path]) => path.startsWith('privateResultTexts/'))).toBe(true);
  });

  test('the same number saved twice, in any format, keeps one doc', async () => {
    const db = fakeDb({ 'bets/abc123': openBet() });
    for (const phone of ['2025550143', '(202) 555-0143', '+1 202 555 0143', '12025550143']) {
      await saveVoterNumber({ db, code: 'abc123', uid: 'jack', phone });
    }
    expect(db.paths('privateResultTexts/')).toHaveLength(1);
  });

  test('a voter saving a different number replaces their first one', async () => {
    const db = fakeDb({ 'bets/abc123': openBet() });
    await saveVoterNumber({ db, code: 'abc123', uid: 'jack', phone: '2025550143' });
    await saveVoterNumber({ db, code: 'abc123', uid: 'jack', phone: '2025550188' });
    expect(db.paths('privateResultTexts/')).toEqual([`${NUMBERS}/${sha('+12025550188')}`]);
    expect(db.data(`${NUMBERS}/${sha('+12025550188')}`).voterId).toBe('jack');
  });

  test('two voters saving the same number keep one doc for the latest voter', async () => {
    const db = fakeDb({ 'bets/abc123': openBet() });
    await saveVoterNumber({ db, code: 'abc123', uid: 'jack', phone: '2025550143' });
    await saveVoterNumber({ db, code: 'abc123', uid: 'sam', phone: '2025550143' });
    expect(db.paths('privateResultTexts/')).toEqual([`${NUMBERS}/${sha('+12025550143')}`]);
    expect(db.data(`${NUMBERS}/${sha('+12025550143')}`)).toMatchObject({ voterId: 'sam', optionId: 'b' });
  });

  describe(`at the ${MAX_NUMBERS_PER_BET}-number cap`, () => {
    const others = {};
    for (let i = 0; i < MAX_NUMBERS_PER_BET; i += 1) {
      others[`${NUMBERS}/other-${i}`] = { e164: `+1202555${String(i).padStart(4, '0')}`, voterId: `other-${i}` };
    }

    test('a new voter is rejected with too-many and nothing is written', async () => {
      const db = fakeDb({ 'bets/abc123': openBet(), ...others });
      await expect(
        saveVoterNumber({ db, code: 'abc123', uid: 'jack', phone: '2025550199' }),
      ).rejects.toMatchObject({ code: 'too-many' });
      expect(db.writes).toEqual([]);
    });

    test('a voter can still replace their own number', async () => {
      const own = `${NUMBERS}/${sha('+12025550143')}`;
      const full = { ...others, [own]: { e164: '+12025550143', voterId: 'jack' } };
      delete full[`${NUMBERS}/other-0`];
      const db = fakeDb({ 'bets/abc123': openBet(), ...full });
      expect(db.paths(`${NUMBERS}/`)).toHaveLength(MAX_NUMBERS_PER_BET);
      await saveVoterNumber({ db, code: 'abc123', uid: 'jack', phone: '2025550199' });
      expect(db.data(own)).toBeUndefined();
      expect(db.data(`${NUMBERS}/${sha('+12025550199')}`).voterId).toBe('jack');
      expect(db.paths(`${NUMBERS}/`)).toHaveLength(MAX_NUMBERS_PER_BET);
    });
  });

  test.each([
    ['invalid-phone', openBet(), 'jack', '555'],
    ['invalid-phone', openBet(), 'jack', '+44 20 7946 0958'],
    ['not-found', null, 'jack', '2025550143'],
    ['closed', settle(openBet(), 'a'), 'jack', '2025550143'],
    ['no-vote', openBet(), 'stranger', '2025550143'],
  ])('rejects %s and writes nothing', async (code, bet, uid, phone) => {
    const db = fakeDb(bet ? { 'bets/abc123': bet } : {});
    await expect(saveVoterNumber({ db, code: 'abc123', uid, phone })).rejects.toMatchObject({ code });
    expect(db.writes).toEqual([]);
  });

  test('a bet settled during the save retries and rejects closed, writing nothing', async () => {
    const db = fakeDb({ 'bets/abc123': openBet() });
    const runTransaction = db.runTransaction;
    let attempts = 0;
    db.runTransaction = (run) =>
      runTransaction(async (tx) => {
        const result = await run(tx);
        attempts += 1;
        // Settle after this attempt's reads, before its commit check.
        if (attempts === 1) db.store.set('bets/abc123', { data: settle(openBet(), 'a'), version: 1e9 });
        return result;
      });
    await expect(saveVoterNumber({ db, code: 'abc123', uid: 'jack', phone: '2025550143' })).rejects.toMatchObject({
      code: 'closed',
    });
    expect(attempts).toBe(1);
    expect(db.writes).toEqual([]);
    expect(db.paths('privateResultTexts/')).toEqual([]);
  });
});

describe('deliverResultTexts', () => {
  async function seeded(bet, phones = { jack: '2025550143', sam: '2025550188' }) {
    const db = fakeDb({ 'bets/abc123': openBet() });
    for (const [uid, phone] of Object.entries(phones)) {
      await saveVoterNumber({ db, code: 'abc123', uid, phone });
    }
    await db.doc('bets/abc123').set(bet);
    return db;
  }

  test('an unsettled bet sends nothing and keeps every number', async () => {
    const db = await seeded(openBet());
    const sendSms = jest.fn();
    expect(await deliverResultTexts({ db, code: 'abc123', sendSms })).toEqual({ sent: 0, skipped: 'not-settled' });
    expect(sendSms).not.toHaveBeenCalled();
    expect(db.paths('privateResultTexts/')).toHaveLength(2);
  });

  test('a settled bet texts each number once with its own outcome, then deletes it', async () => {
    const db = await seeded(settle(openBet(), 'a'));
    const sendSms = jest.fn(async () => {});
    expect(await deliverResultTexts({ db, code: 'abc123', sendSms })).toEqual({ sent: 2, failed: 0 });
    expect(sendSms).toHaveBeenCalledTimes(2);
    expect(sendSms).toHaveBeenCalledWith('+12025550143', wonText);
    expect(sendSms).toHaveBeenCalledWith('+12025550188', lostText);
    expect(db.paths('privateResultTexts/')).toEqual([]);
  });

  test('a voter who switched sides gets the outcome for their current pick', async () => {
    const db = await seeded(openBet(), { sam: '2025550188' });
    expect(db.data(`${NUMBERS}/${sha('+12025550188')}`).optionId).toBe('b');
    const switched = openBet({ votes: [{ voterId: 'jack', optionId: 'a' }, { voterId: 'sam', optionId: 'a' }] });
    await db.doc('bets/abc123').set(settle(switched, 'a'));
    const sendSms = jest.fn(async () => {});
    await deliverResultTexts({ db, code: 'abc123', sendSms });
    expect(sendSms).toHaveBeenCalledWith('+12025550188', wonText);
  });

  test('without a settlement snapshot the current vote decides the outcome', async () => {
    const bet = openBet({ status: 'closed', winnerId: 'b' });
    const db = await seeded(bet);
    const sendSms = jest.fn(async () => {});
    await deliverResultTexts({ db, code: 'abc123', sendSms });
    expect(sendSms).toHaveBeenCalledWith('+12025550143', lostText.replace('Yes won', 'No won'));
    expect(sendSms).toHaveBeenCalledWith('+12025550188', wonText.replace('Yes won', 'No won'));
  });

  test('running again, or concurrently, never sends a duplicate', async () => {
    const db = await seeded(settle(openBet(), 'a'));
    const sendSms = jest.fn(async () => {});
    const runs = await Promise.all([
      deliverResultTexts({ db, code: 'abc123', sendSms }),
      deliverResultTexts({ db, code: 'abc123', sendSms }),
      deliverResultTexts({ db, code: 'abc123', sendSms }),
    ]);
    expect(await deliverResultTexts({ db, code: 'abc123', sendSms })).toEqual({ sent: 0, failed: 0 });
    expect(runs.reduce((total, run) => total + run.sent, 0)).toBe(2);
    expect(sendSms).toHaveBeenCalledTimes(2);
    expect(new Set(sendSms.mock.calls.map(([to]) => to)).size).toBe(2);
  });

  test('a failed send still deletes the number, counts it, and never logs it', async () => {
    const db = await seeded(settle(openBet(), 'a'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const sendSms = jest.fn(async (to) => {
      if (to === '+12025550143') throw Object.assign(new Error(`rejected ${to}`), { code: 'sms-not-configured' });
    });
    expect(await deliverResultTexts({ db, code: 'abc123', sendSms })).toEqual({ sent: 1, failed: 1 });
    expect(db.paths('privateResultTexts/')).toEqual([]);
    expect(await deliverResultTexts({ db, code: 'abc123', sendSms })).toEqual({ sent: 0, failed: 0 });
    expect(sendSms).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/555/);
    warn.mockRestore();
  });

  test('a called-off bet sends the called-off text to everyone', async () => {
    const db = await seeded(openBet({ calledOff: true }));
    const sendSms = jest.fn(async () => {});
    expect(await deliverResultTexts({ db, code: 'abc123', sendSms })).toEqual({ sent: 2, failed: 0 });
    expect(sendSms.mock.calls.map(([, body]) => body)).toEqual([calledOffText, calledOffText]);
  });

  test('a missing bet is a no-op', async () => {
    const sendSms = jest.fn();
    expect(await deliverResultTexts({ db: fakeDb(), code: 'abc123', sendSms })).toEqual({ sent: 0, skipped: 'not-settled' });
  });
});

describe('buildResultSms', () => {
  const settled = settle(openBet(), 'a');

  test('fills the winner, loser and called-off templates exactly', () => {
    expect(buildResultSms({ bet: settled, won: true, code: 'abc123' })).toBe(wonText);
    expect(buildResultSms({ bet: settled, won: false, code: 'abc123' })).toBe(lostText);
    expect(buildResultSms({ bet: openBet(), calledOff: true, code: 'abc123' })).toBe(calledOffText);
  });

  test('the templates are straight-quoted GSM-7 with no emoji', () => {
    Object.values(RESULT_TEXT_COPY.sms).forEach((template) => {
      expect(template).not.toMatch(/[‘-‟…]/);
      expect(template).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(toGsm7(template)).toBe(template);
    });
  });

  test('sanitizes curly quotes, dashes, ellipses, odd spaces and emoji', () => {
    expect(toGsm7('“Big” game — Sam’s call… 🏈 tonight  ')).toBe(
      '"Big" game - Sam\'s call... tonight',
    );
    const bet = settle(openBet({ question: '‘Who’s late?’ 😂', options: [{ id: 'a', label: 'Me – again' }, { id: 'b', label: 'No' }] }), 'a');
    expect(buildResultSms({ bet, won: true, code: 'abc123' })).toBe(
      `Friendly Bets: "'Who's late?'" is settled. Me - again won, and you called it. See the final tally: ${link}`,
    );
  });

  test('keeps GSM-7 accents and transliterates the rest', () => {
    expect(toGsm7('Café Señor Müller Ångström Æon Øl Ça à è')).toBe('Café Señor Müller Ångström Æon Øl Ça à è');
    expect(toGsm7('Zoë á ç ő Łódź 中文')).toBe('Zoe a c o odz');
  });

  test('long titles are cut with ... to fit one 160-septet segment', () => {
    const bet = settle(openBet({ question: `Will ${'the very long title '.repeat(10)}end` }), 'a');
    const body = buildResultSms({ bet, won: false, code: 'abc123' });
    expect(gsm7Septets(body)).toBeLessThanOrEqual(160);
    expect(gsm7Septets(body)).toBeGreaterThan(150);
    expect(body).toMatch(/^Friendly Bets: "Will the very long.*\.\.\." is settled\. Yes won\./);
    expect(body.endsWith(link)).toBe(true);
  });

  test('extension characters count as two septets', () => {
    expect(gsm7Septets('a{b}€')).toBe(8);
    // 30 plain chars fit the title room; the same 30 as braces (60 septets) don't.
    const plain = buildResultSms({ bet: settle(openBet({ question: 'x'.repeat(30) }), 'a'), won: true, code: 'abc123' });
    const braces = buildResultSms({ bet: settle(openBet({ question: '{'.repeat(30) }), 'a'), won: true, code: 'abc123' });
    expect(plain).toContain(`"${'x'.repeat(30)}"`);
    expect(braces).toContain('..."');
    expect(gsm7Septets(braces)).toBeLessThanOrEqual(160);
  });

  test('a side label too long for one segment is sent whole as multi-part', () => {
    const side = 'S'.repeat(150);
    const bet = settle(openBet({ question: 'Short', options: [{ id: 'a', label: side }, { id: 'b', label: 'No' }] }), 'a');
    const body = buildResultSms({ bet, won: true, code: 'abc123' });
    expect(body).toContain('"Short"');
    expect(body).toContain(side);
    expect(gsm7Septets(body)).toBeGreaterThan(160);
  });
});
