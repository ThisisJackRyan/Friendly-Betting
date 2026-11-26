/** @jest-environment node */
import { createHash } from 'crypto';
import { CLOSED_TEXT_COPY } from '../phone/closedCopy';
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
// openBet has no stake, so no Stakes block. Winners and losers get the same text.
const settledText = `Bet settled:\nWho is late\n\nWinning pick:\nYes\n\nSee who called it:\n${link}?s=settled`;
const noWonText = settledText.replace('Winning pick:\nYes', 'Winning pick:\nNo');
const calledOffText = `Bet called off:\nWho is late\n\nNobody won this one.\n\nSee the bet:\n${link}?s=off`;

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
    ['closed', openBet({ status: 'called-off' }), 'jack', '2025550143'],
    ['closed', openBet({ calledOff: true }), 'jack', '2025550143'],
    ['no-vote', openBet(), 'stranger', '2025550143'],
  ])('rejects %s and writes nothing', async (code, bet, uid, phone) => {
    const db = fakeDb(bet ? { 'bets/abc123': bet } : {});
    await expect(saveVoterNumber({ db, code: 'abc123', uid, phone })).rejects.toMatchObject({ code });
    expect(db.writes).toEqual([]);
  });

  test('a pick in a vote doc counts, and wins over the voter\'s array entry', async () => {
    const db = fakeDb({
      'bets/abc123': openBet(),
      'bets/abc123/votes/maya': { voterId: 'maya', name: 'Maya', optionId: 'a', at: { seconds: 5, nanoseconds: 0 } },
      'bets/abc123/votes/sam': { voterId: 'sam', name: 'Sam', optionId: 'a', at: { seconds: 6, nanoseconds: 0 } },
    });
    await saveVoterNumber({ db, code: 'abc123', uid: 'maya', phone: '2025550143' });
    await saveVoterNumber({ db, code: 'abc123', uid: 'sam', phone: '2025550188' });
    expect(db.data(`${NUMBERS}/${sha('+12025550143')}`)).toMatchObject({ voterId: 'maya', optionId: 'a' });
    expect(db.data(`${NUMBERS}/${sha('+12025550188')}`)).toMatchObject({ voterId: 'sam', optionId: 'a' });
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

  test('a settled bet texts each number once, winners and losers alike, then deletes it', async () => {
    const db = await seeded(settle(openBet(), 'a'));
    const sendSms = jest.fn(async () => {});
    expect(await deliverResultTexts({ db, code: 'abc123', sendSms })).toEqual({ sent: 2, failed: 0 });
    expect(sendSms).toHaveBeenCalledTimes(2);
    expect(sendSms).toHaveBeenCalledWith('+12025550143', settledText);
    expect(sendSms).toHaveBeenCalledWith('+12025550188', settledText);
    expect(db.paths('privateResultTexts/')).toEqual([]);
  });

  test('a voter who switched sides still gets the settled text', async () => {
    const db = await seeded(openBet(), { sam: '2025550188' });
    expect(db.data(`${NUMBERS}/${sha('+12025550188')}`).optionId).toBe('b');
    const switched = openBet({ votes: [{ voterId: 'jack', optionId: 'a' }, { voterId: 'sam', optionId: 'a' }] });
    await db.doc('bets/abc123').set(settle(switched, 'a'));
    const sendSms = jest.fn(async () => {});
    await deliverResultTexts({ db, code: 'abc123', sendSms });
    expect(sendSms).toHaveBeenCalledWith('+12025550188', settledText);
  });

  test('without a settlement snapshot the winning option names the side', async () => {
    const bet = openBet({ status: 'closed', winnerId: 'b' });
    const db = await seeded(bet);
    const sendSms = jest.fn(async () => {});
    await deliverResultTexts({ db, code: 'abc123', sendSms });
    expect(sendSms).toHaveBeenCalledWith('+12025550143', noWonText);
    expect(sendSms).toHaveBeenCalledWith('+12025550188', noWonText);
  });

  test('without a settlement snapshot a vote doc pick still gets the settled text', async () => {
    const bet = openBet({ status: 'closed', winnerId: 'a' });
    const db = await seeded(bet, { sam: '2025550188' });
    await db.doc('bets/abc123/votes/sam').set({ voterId: 'sam', name: 'Sam', optionId: 'a', at: { seconds: 6, nanoseconds: 0 } });
    const sendSms = jest.fn(async () => {});
    await deliverResultTexts({ db, code: 'abc123', sendSms });
    expect(sendSms).toHaveBeenCalledWith('+12025550188', settledText);
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

  test.each([
    ['calledOff flag', openBet({ calledOff: true })],
    ['status called-off', openBet({ status: 'called-off' })],
    ['calledOff flag on a settled bet', { ...settle(openBet(), 'a'), calledOff: true }],
  ])('a called-off bet (%s) sends the called-off text to everyone', async (_label, bet) => {
    const db = await seeded(bet);
    const sendSms = jest.fn(async () => {});
    expect(await deliverResultTexts({ db, code: 'abc123', sendSms })).toEqual({ sent: 2, failed: 0 });
    expect(sendSms.mock.calls.map(([, body]) => body)).toEqual([calledOffText, calledOffText]);
  });

  describe('the undo window', () => {
    const NOW = 1_800_000_000_000;
    const at = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 });
    const fresh = () => ({ ...settle(openBet(), 'a'), settledAt: at(NOW - 2000) });

    test('a fresh settle waits out the 35s undo window, then texts', async () => {
      const db = await seeded(fresh());
      const sendSms = jest.fn(async () => {});
      let clock = NOW;
      const wait = jest.fn(async (ms) => { clock += ms; });
      expect(await deliverResultTexts({ db, code: 'abc123', sendSms, now: () => clock, wait })).toEqual({ sent: 2, failed: 0 });
      expect(wait).toHaveBeenCalledWith(33000);
      expect(sendSms).toHaveBeenCalledTimes(2);
    });

    test('a settle undone during the wait texts nobody and keeps the numbers', async () => {
      const db = await seeded(fresh());
      const sendSms = jest.fn();
      let clock = NOW;
      const wait = jest.fn(async (ms) => {
        clock += ms;
        await db.doc('bets/abc123').set(openBet());
      });
      expect(await deliverResultTexts({ db, code: 'abc123', sendSms, now: () => clock, wait })).toEqual({ sent: 0, skipped: 'not-settled' });
      expect(sendSms).not.toHaveBeenCalled();
      expect(db.paths('privateResultTexts/')).toHaveLength(2);
    });

    test('undone and settled again during the wait: this run stands down for the new one', async () => {
      const db = await seeded(fresh());
      const sendSms = jest.fn(async () => {});
      let clock = NOW;
      const wait = jest.fn(async (ms) => {
        clock += ms;
        await db.doc('bets/abc123').set({ ...settle(openBet(), 'b'), settledAt: at(clock - 1000) });
      });
      expect(await deliverResultTexts({ db, code: 'abc123', sendSms, now: () => clock, wait })).toEqual({ sent: 0, skipped: 'undo-window' });
      expect(sendSms).not.toHaveBeenCalled();
      expect(db.paths('privateResultTexts/')).toHaveLength(2);
      // The second settle's own call, past its window, sends the new result.
      const later = await deliverResultTexts({ db, code: 'abc123', sendSms, now: () => clock + 40000, wait: jest.fn() });
      expect(later).toEqual({ sent: 2, failed: 0 });
      expect(sendSms.mock.calls.map(([, body]) => body)).toContain(noWonText);
    });

    test('repeat calls for the same settle return at once while one run waits; only that run sends', async () => {
      const db = await seeded(fresh());
      const sendSms = jest.fn(async () => {});
      let clock = NOW;
      let release;
      const wait = jest.fn((ms) => new Promise((resolve) => { release = () => { clock += ms; resolve(); }; }));
      const first = deliverResultTexts({ db, code: 'abc123', sendSms, now: () => clock, wait });
      await new Promise((resolve) => { setImmediate(resolve); });
      expect(wait).toHaveBeenCalledTimes(1);
      const repeats = await Promise.all([1, 2, 3].map(() => deliverResultTexts({ db, code: 'abc123', sendSms, now: () => clock, wait })));
      expect(repeats).toEqual([1, 2, 3].map(() => ({ sent: 0, skipped: 'in-flight' })));
      expect(wait).toHaveBeenCalledTimes(1);
      expect(sendSms).not.toHaveBeenCalled();
      release();
      expect(await first).toEqual({ sent: 2, failed: 0 });
      expect(sendSms).toHaveBeenCalledTimes(2);
      // Done, so the next call runs again, and the numbers are already gone.
      expect(await deliverResultTexts({ db, code: 'abc123', sendSms, now: () => clock, wait })).toEqual({ sent: 0, failed: 0 });
      expect(sendSms).toHaveBeenCalledTimes(2);
    });

    test('a new settle (undone and settled again) is not held up by the run still waiting on the old one', async () => {
      const db = await seeded(fresh());
      const sendSms = jest.fn(async () => {});
      let release;
      const wait = jest.fn(() => new Promise((resolve) => { release = resolve; }));
      const first = deliverResultTexts({ db, code: 'abc123', sendSms, now: () => NOW, wait });
      await new Promise((resolve) => { setImmediate(resolve); });
      await db.doc('bets/abc123').set({ ...settle(openBet(), 'b'), settledAt: at(NOW - 40000) });
      expect(await deliverResultTexts({ db, code: 'abc123', sendSms, now: () => NOW, wait: jest.fn() })).toEqual({ sent: 2, failed: 0 });
      release();
      expect(await first).toEqual({ sent: 0, failed: 0 });
      expect(sendSms).toHaveBeenCalledTimes(2);
    });

    test('a call-off and an older number settledAt send right away', async () => {
      for (const bet of [
        openBet({ status: 'closed', calledOff: true, settledAt: at(NOW - 1000) }),
        { ...settle(openBet(), 'a'), settledAt: NOW - 1000 },
      ]) {
        const db = await seeded(bet);
        const wait = jest.fn();
        const sendSms = jest.fn(async () => {});
        expect(await deliverResultTexts({ db, code: 'abc123', sendSms, now: () => NOW, wait })).toEqual({ sent: 2, failed: 0 });
        expect(wait).not.toHaveBeenCalled();
      }
    });
  });

  test('a missing bet is a no-op', async () => {
    const sendSms = jest.fn();
    expect(await deliverResultTexts({ db: fakeDb(), code: 'abc123', sendSms })).toEqual({ sent: 0, skipped: 'not-settled' });
  });
});

describe('buildResultSms', () => {
  const settled = settle(openBet(), 'a');

  test('fills the settled and called-off templates exactly, the same for winners and losers', () => {
    expect(buildResultSms({ bet: settled, code: 'abc123' })).toBe(settledText);
    expect(buildResultSms({ bet: settled, won: false, code: 'abc123' })).toBe(settledText);
    expect(buildResultSms({ bet: openBet(), calledOff: true, code: 'abc123' })).toBe(calledOffText);
  });

  test('settled with stakes, exactly', () => {
    const bet = settle(openBet({ stake: '$20 pot' }), 'a');
    expect(buildResultSms({ bet, code: 'abc123' })).toBe(
      `Bet settled:\nWho is late\n\nWinning pick:\nYes\n\nStakes:\n$20 pot\n\nSee who called it:\n${link}?s=settled`,
    );
  });

  test.each([
    ['empty', ''],
    ['whitespace-only', ' \n\t '],
  ])('%s stakes drop the Stakes block, not the Bragging rights default', (_label, stake) => {
    const bet = settle(openBet({ stake }), 'a');
    expect(bet.settlement.stake).toBe('Bragging rights');
    expect(buildResultSms({ bet, code: 'abc123' })).toBe(settledText);
  });

  test('a Bragging rights chip the creator picked stays', () => {
    const bet = settle(openBet({ stake: 'Bragging rights' }), 'a');
    expect(buildResultSms({ bet, code: 'abc123' })).toContain('\n\nStakes:\nBragging rights\n\n');
  });

  test('question, side and stakes are trimmed and collapsed; the link is alone on the last line', () => {
    const bet = settle(openBet({
      question: '  Who   is\nlate  ', stake: ' Lunch \n on Sam ',
      options: [{ id: 'a', label: '  Sam   again ' }, { id: 'b', label: 'No' }],
    }), 'a');
    const body = buildResultSms({ bet, code: 'abc123', origin: 'https://example.com' });
    expect(body).toBe('Bet settled:\nWho is late\n\nWinning pick:\nSam again\n\nStakes:\nLunch on Sam\n\nSee who called it:\nhttps://example.com/t/abc123?s=settled');
    expect(body.endsWith('\n')).toBe(false);
  });

  test('the template lines are straight-quoted GSM-7 with no emoji', () => {
    Object.values(CLOSED_TEXT_COPY).forEach((template) => {
      expect(template).not.toMatch(/[‘-‟…·]/);
      expect(template).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(toGsm7(template)).toBe(template);
    });
  });

  test('sanitizes curly quotes, dashes, ellipses, odd spaces and emoji in user text; the output is all GSM-7', () => {
    expect(toGsm7('“Big” game — Sam’s call… 🏈 tonight  ')).toBe(
      '"Big" game - Sam\'s call... tonight',
    );
    const bet = settle(openBet({
      question: '‘Who’s late?’ 😂', stake: 'Café — “round”',
      options: [{ id: 'a', label: 'Me – again' }, { id: 'b', label: 'No' }],
    }), 'a');
    const body = buildResultSms({ bet, code: 'abc123' });
    expect(body).toBe(
      `Bet settled:\n'Who's late?'\n\nWinning pick:\nMe - again\n\nStakes:\nCafé - "round"\n\nSee who called it:\n${link}?s=settled`,
    );
    expect(body.split('\n').map(toGsm7).join('\n')).toBe(body);
    expect(buildResultSms({ bet, calledOff: true, code: 'abc123' })).toBe(
      `Bet called off:\n'Who's late?'\n\nNobody won this one.\n\nSee the bet:\n${link}?s=off`,
    );
  });

  test('keeps GSM-7 accents and transliterates the rest', () => {
    expect(toGsm7('Café Señor Müller Ångström Æon Øl Ça à è')).toBe('Café Señor Müller Ångström Æon Øl Ça à è');
    expect(toGsm7('Zoë á ç ő Łódź 中文')).toBe('Zoe a c o odz');
  });

  test('a long question goes out whole, as a multi-part text, never cut', () => {
    const question = `Will ${'the very long title '.repeat(10)}end`;
    const body = buildResultSms({ bet: settle(openBet({ question }), 'a'), code: 'abc123' });
    expect(body).toContain(`\n${question}\n`);
    expect(body).not.toContain('...');
    expect(gsm7Septets(body)).toBeGreaterThan(160);
  });

  test('extension characters count as two septets', () => {
    expect(gsm7Septets('a{b}€')).toBe(8);
  });
});
