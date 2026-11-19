/** @jest-environment node */
import { adminDb, adminMessaging } from './firebaseAdmin';
import { buildSettlement } from '../phone/settlement';
import { PUSH_CHANNEL_COPY, PUSH_NOTIFICATION_COPY } from '../phone/pushCopy';
import { PUSH_CHANNEL_ID } from '../phone/pushConfig';
import {
  betPushOptions, buildBetPush, buildPickPush, deliverBetPush, deliverPickPush, MAX_EVENT_AGE_MS, pickEventId,
  PICK_PUSH_BET_LIMIT, PICK_PUSH_BET_WINDOW_MS, pickCountId, pushEventId, pushRecipients, recordedPick,
} from './pushEvents';
import { sendToUser } from './pushSend';
import { fakeDb } from './testing/fakeDb';

jest.mock('firebase-admin/app', () => ({}));
jest.mock('firebase-admin/auth', () => ({}));
jest.mock('firebase-admin/firestore', () => ({}));
jest.mock('firebase-admin/messaging', () => ({}));
jest.mock('./firebaseAdmin', () => ({ adminAuth: jest.fn(), adminDb: jest.fn(), adminMessaging: jest.fn() }));

const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;
const CODE = 'abc123';
const NOW = 1_800_000_000_000;
const PHONE = '+15551234567';
const at = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 });
let logs;

function openBet(overrides = {}) {
  return {
    schemaVersion: 2,
    code: CODE,
    status: 'open',
    createdByID: 'creator',
    question: 'Who is late',
    options: [{ id: 'a', label: 'Over' }, { id: 'b', label: 'Under' }],
    votes: [
      { voterId: 'creator', name: 'Casey', optionId: 'a' },
      { voterId: 'jack', name: 'Jack', optionId: 'a' },
      { voterId: 'sam', name: 'Sam', optionId: 'b' },
    ],
    ...overrides,
  };
}

function settled(bet = openBet(), winnerId = 'a', settledAtMs = NOW - 40000) {
  return { ...bet, status: 'closed', winnerId, settledAt: at(settledAtMs), settlement: buildSettlement(bet, winnerId) };
}

function calledOff(bet = openBet(), settledAtMs = NOW - 1000) {
  return { ...bet, status: 'closed', calledOff: true, settledAt: at(settledAtMs) };
}

const ok = () => jest.fn(async () => ({ sent: 1, failed: 0, removed: 0 }));
const seeded = (bet, extra = {}) => fakeDb({ [`bets/${CODE}`]: bet, ...extra });
// Claims only; the per-bet pick count doc is checked on its own.
const claims = (db) => db.paths('privatePushSends/').filter((path) => !path.startsWith('privatePushSends/pickcount:'));
const logged = () => JSON.stringify(logs.map((spy) => spy.mock.calls));
const recipientsOf = (send) => send.mock.calls.map(([uid]) => uid).sort();

beforeEach(() => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  adminDb.mockReset();
  adminMessaging.mockReset();
  logs = ['log', 'info', 'warn', 'error'].map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  logs.forEach((spy) => spy.mockRestore());
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

describe('copy', () => {
  test('bodies and the Android channel are the UX-final strings, verbatim', () => {
    expect(PUSH_NOTIFICATION_COPY.settled('Over')).toBe('Over won. See who called it.');
    expect(PUSH_NOTIFICATION_COPY.calledOff).toBe('This bet was called off. Nobody won this one.');
    expect(PUSH_CHANNEL_COPY).toEqual({ name: 'Bet updates', description: 'Picks, results, and closing reminders on your bets.' });
    expect(PUSH_CHANNEL_ID).toBe('bet_updates');
  });

  test('settle payload: question title, winning side body, /b/{code} route, strings only', () => {
    const push = buildBetPush(settled(), CODE);
    expect(push).toEqual({
      title: 'Who is late',
      body: 'Over won. See who called it.',
      data: { code: CODE, route: `/b/${CODE}`, event: 'settle' },
    });
    Object.values(push.data).forEach((value) => expect(typeof value).toBe('string'));
  });

  test('settle body uses the vote label (an over-under line), and the snapshot question', () => {
    const bet = openBet({ type: 'over-under', line: 7.5 });
    const result = settled(bet, 'a');
    result.question = 'Edited later';
    const push = buildBetPush(result, CODE);
    expect(push.body).toBe(`${result.settlement.optionLabel} won. See who called it.`);
    expect(result.settlement.optionLabel).not.toBe('Over');
    expect(push.title).toBe('Who is late');
  });

  test('call-off payload', () => {
    expect(buildBetPush(calledOff(), CODE)).toEqual({
      title: 'Who is late',
      body: 'This bet was called off. Nobody won this one.',
      data: { code: CODE, route: `/b/${CODE}`, event: 'calloff' },
    });
  });

  test('options collapse and thread per bet, in the Android channel', () => {
    expect(betPushOptions(CODE)).toEqual({ collapseKey: CODE, threadId: CODE, channelId: 'bet_updates', code: CODE });
  });

  test('payload has no phone, name or uid', () => {
    const bet = settled(openBet({ votes: [{ voterId: 'jack', name: 'Jack', optionId: 'a', phone: PHONE }] }));
    const text = JSON.stringify(buildBetPush(bet, CODE));
    ['Jack', 'jack', 'creator', '555'].forEach((secret) => expect(text).not.toContain(secret));
  });
});

describe('event ids', () => {
  test('settle and call-off ids carry the settledAt ms; open bets have none', () => {
    expect(pushEventId(settled(openBet(), 'a', NOW), CODE)).toBe(`settle:${CODE}:${NOW}`);
    expect(pushEventId(calledOff(openBet(), NOW), CODE)).toBe(`calloff:${CODE}:${NOW}`);
    expect(pushEventId(openBet(), CODE)).toBeNull();
    expect(pushEventId({ ...settled(), settledAt: undefined }, CODE)).toBeNull();
  });
});

describe('recipients', () => {
  test('settle: settlement.recipients minus the creator/settler', () => {
    expect(pushRecipients(settled()).sort()).toEqual(['jack', 'sam']);
  });

  test('settle: a settledBy uid is skipped too, and a voter with no uid is never sent', () => {
    const bet = openBet({ votes: [...openBet().votes, { voterId: '', optionId: 'a' }, { voterId: 'maya', optionId: 'b' }] });
    expect(pushRecipients({ ...settled(bet), settledBy: 'maya' }).sort()).toEqual(['jack', 'sam']);
  });

  test('settle: the snapshot decides, not later live votes', () => {
    const bet = settled();
    bet.votes = [...bet.votes, { voterId: 'late', optionId: 'a' }];
    expect(pushRecipients(bet)).not.toContain('late');
  });

  test('settle: a snapshot uid with no live pick is dropped; real voters still get through', () => {
    const bet = settled();
    bet.settlement.recipients = [
      ...bet.settlement.recipients,
      { voterId: 'stranger', name: 'X', optionId: 'a' },
      { voterId: 'lurker', name: 'Y', optionId: 'b' },
    ];
    bet.votes = [...bet.votes, { voterId: 'lurker', name: 'Y' }];
    expect(pushRecipients(bet).sort()).toEqual(['jack', 'sam']);
  });

  test('settle: a snapshot voter whose live pick is gone is dropped', () => {
    const bet = settled();
    bet.votes = bet.votes.filter((vote) => vote.voterId !== 'sam');
    expect(pushRecipients(bet)).toEqual(['jack']);
  });

  test('call-off: only voters with a pick, never the creator', () => {
    const bet = calledOff(openBet({
      votes: [
        { voterId: 'creator', optionId: 'a' },
        { voterId: 'jack', optionId: 'a' },
        { voterId: 'sam', optionId: 'b' },
        { voterId: 'nopick', name: 'Lurker' },
        { voterId: '', optionId: 'a' },
      ],
    }));
    expect(pushRecipients(bet).sort()).toEqual(['jack', 'sam']);
  });

  test('open bets have no recipients', () => {
    expect(pushRecipients(openBet())).toEqual([]);
  });
});

describe('deliverBetPush', () => {
  test('flag off: no bet read, no token read, no Messaging, no send', async () => {
    for (const value of [undefined, '', '0', 'true']) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
      else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
      const db = { doc: jest.fn(), collection: jest.fn(), runTransaction: jest.fn() };
      const send = jest.fn();
      expect(await deliverBetPush({ db, code: CODE, send })).toEqual({ sent: 0, failed: 0, skipped: 'disabled' });
      expect(db.doc).not.toHaveBeenCalled();
      expect(db.collection).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
    expect(adminDb).not.toHaveBeenCalled();
    expect(adminMessaging).not.toHaveBeenCalled();
  });

  test('a settle past the window sends each voter once, never the creator, and claims the event', async () => {
    const db = seeded(settled());
    const send = ok();
    const wait = jest.fn();
    expect(await deliverBetPush({ db, code: CODE, send, wait, now: () => NOW })).toEqual({ sent: 2, failed: 0 });
    expect(wait).not.toHaveBeenCalled();
    expect(recipientsOf(send)).toEqual(['jack', 'sam']);
    send.mock.calls.forEach(([, payload, options]) => {
      expect(payload).toEqual({ title: 'Who is late', body: 'Over won. See who called it.', data: { code: CODE, route: `/b/${CODE}`, event: 'settle' } });
      expect(options).toEqual({ collapseKey: CODE, threadId: CODE, channelId: 'bet_updates', code: CODE });
    });
    expect(claims(db)).toEqual([`privatePushSends/settle:${CODE}:${NOW - 40000}`]);
    expect(db.data(claims(db)[0])).toEqual({ code: CODE, at: NOW });
  });

  test('a call-off sends right away, without waiting, to voters with a pick in the array and vote docs', async () => {
    const db = seeded(calledOff(openBet({ votes: [{ voterId: 'jack', optionId: 'a' }] })), {
      [`bets/${CODE}/votes/maya`]: { voterId: 'maya', name: 'Maya', optionId: 'b', at: { seconds: 5, nanoseconds: 0 } },
      [`bets/${CODE}/votes/creator`]: { voterId: 'creator', optionId: 'a', at: { seconds: 6, nanoseconds: 0 } },
    });
    const send = ok();
    const wait = jest.fn();
    expect(await deliverBetPush({ db, code: CODE, send, wait, now: () => NOW })).toEqual({ sent: 2, failed: 0 });
    expect(wait).not.toHaveBeenCalled();
    expect(recipientsOf(send)).toEqual(['jack', 'maya']);
    expect(send.mock.calls[0][1].body).toBe('This bet was called off. Nobody won this one.');
    expect(claims(db)).toEqual([`privatePushSends/calloff:${CODE}:${NOW - 1000}`]);
  });

  describe('the undo window', () => {
    test('a fresh settle waits out the 35s rules window, re-reads, then sends', async () => {
      const db = seeded(settled(openBet(), 'a', NOW - 2000));
      const send = ok();
      let clock = NOW;
      const wait = jest.fn(async (ms) => { clock += ms; });
      expect(await deliverBetPush({ db, code: CODE, send, wait, now: () => clock })).toEqual({ sent: 2, failed: 0 });
      expect(wait).toHaveBeenCalledWith(33000);
      expect(send).toHaveBeenCalledTimes(2);
    });

    test('a settle undone during the wait sends nobody and leaves no claim', async () => {
      const db = seeded(settled(openBet(), 'a', NOW - 2000));
      const send = ok();
      let clock = NOW;
      const wait = jest.fn(async (ms) => {
        clock += ms;
        await db.doc(`bets/${CODE}`).set(openBet());
      });
      expect(await deliverBetPush({ db, code: CODE, send, wait, now: () => clock })).toEqual({ sent: 0, failed: 0, skipped: 'not-settled' });
      expect(send).not.toHaveBeenCalled();
      expect(claims(db)).toEqual([]);
    });

    test('undone and settled again during the wait: this run stands down; the new settle sends its own event', async () => {
      const db = seeded(settled(openBet(), 'a', NOW - 2000));
      const send = ok();
      let clock = NOW;
      const wait = jest.fn(async (ms) => {
        clock += ms;
        await db.doc(`bets/${CODE}`).set(settled(openBet(), 'b', clock - 1000));
      });
      expect(await deliverBetPush({ db, code: CODE, send, wait, now: () => clock })).toEqual({ sent: 0, failed: 0, skipped: 'undo-window' });
      expect(send).not.toHaveBeenCalled();
      expect(claims(db)).toEqual([]);
      const later = await deliverBetPush({ db, code: CODE, send, wait: jest.fn(), now: () => clock + 40000 });
      expect(later).toEqual({ sent: 2, failed: 0 });
      expect(send.mock.calls[0][1].body).toBe('Under won. See who called it.');
      expect(claims(db)).toEqual([`privatePushSends/settle:${CODE}:${clock - 1000}`]);
    });

    test('repeat calls for the same settle return at once while one run waits', async () => {
      const db = seeded(settled(openBet(), 'a', NOW - 2000));
      const send = ok();
      let clock = NOW;
      let release;
      const wait = jest.fn((ms) => new Promise((resolve) => { release = () => { clock += ms; resolve(); }; }));
      const first = deliverBetPush({ db, code: CODE, send, wait, now: () => clock });
      await new Promise((resolve) => { setImmediate(resolve); });
      expect(wait).toHaveBeenCalledTimes(1);
      const repeats = await Promise.all([1, 2].map(() => deliverBetPush({ db, code: CODE, send, wait, now: () => clock })));
      expect(repeats).toEqual([1, 2].map(() => ({ sent: 0, failed: 0, skipped: 'in-flight' })));
      expect(wait).toHaveBeenCalledTimes(1);
      release();
      expect(await first).toEqual({ sent: 2, failed: 0 });
      expect(send).toHaveBeenCalledTimes(2);
    });
  });

  describe('idempotency', () => {
    test('a second deliver of the same settle or call-off sends nothing', async () => {
      for (const bet of [settled(), calledOff()]) {
        const db = seeded(bet);
        const send = ok();
        await deliverBetPush({ db, code: CODE, send, now: () => NOW });
        expect(await deliverBetPush({ db, code: CODE, send, now: () => NOW })).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
        expect(send).toHaveBeenCalledTimes(2);
      }
    });

    test('concurrent runs for one event send once', async () => {
      const db = seeded(settled());
      const send = ok();
      const runs = await Promise.all([1, 2, 3].map(() => deliverBetPush({ db, code: CODE, send, now: () => NOW })));
      expect(runs.reduce((sum, run) => sum + run.sent, 0)).toBe(2);
      expect(send).toHaveBeenCalledTimes(2);
    });

    test('a new settle (new settledAt) after an undo may send again', async () => {
      const db = seeded(settled(openBet(), 'a', NOW - 40000));
      const send = ok();
      await deliverBetPush({ db, code: CODE, send, now: () => NOW });
      await db.doc(`bets/${CODE}`).set(settled(openBet(), 'b', NOW - 36000));
      expect(await deliverBetPush({ db, code: CODE, send, now: () => NOW })).toEqual({ sent: 2, failed: 0 });
      expect(send).toHaveBeenCalledTimes(4);
      expect(claims(db)).toHaveLength(2);
    });

    test('if every send fails the claim is dropped and a retry sends', async () => {
      const db = seeded(settled());
      const failing = jest.fn(async () => ({ sent: 0, failed: 1, removed: 0 }));
      expect(await deliverBetPush({ db, code: CODE, send: failing, now: () => NOW })).toEqual({ sent: 0, failed: 2 });
      expect(claims(db)).toEqual([]);
      const send = ok();
      expect(await deliverBetPush({ db, code: CODE, send, now: () => NOW })).toEqual({ sent: 2, failed: 0 });
      expect(claims(db)).toHaveLength(1);
    });

    test('a setup skip (admin not configured) also drops the claim', async () => {
      const db = seeded(settled());
      const skipped = jest.fn(async () => ({ sent: 0, failed: 0, removed: 0, skipped: 'admin-not-configured' }));
      expect(await deliverBetPush({ db, code: CODE, send: skipped, now: () => NOW })).toEqual({ sent: 0, failed: 0 });
      expect(claims(db)).toEqual([]);
    });

    test('voters with no device are not a failure: the claim stays', async () => {
      const db = seeded(settled());
      const none = jest.fn(async () => ({ sent: 0, failed: 0, removed: 0, skipped: 'no-devices' }));
      await deliverBetPush({ db, code: CODE, send: none, now: () => NOW });
      expect(claims(db)).toHaveLength(1);
    });

    test('a partial failure keeps the claim and still counts', async () => {
      const db = seeded(settled());
      const send = jest.fn(async (uid) => (uid === 'jack' ? { sent: 1, failed: 0 } : { sent: 0, failed: 1 }));
      expect(await deliverBetPush({ db, code: CODE, send, now: () => NOW })).toEqual({ sent: 1, failed: 1 });
      expect(claims(db)).toHaveLength(1);
    });
  });

  test('a throwing send for one voter is caught; the others still get theirs', async () => {
    const db = seeded(settled());
    const send = jest.fn(async (uid) => {
      if (uid === 'jack') throw Object.assign(new Error(`boom for ${uid} ${PHONE}`), { code: 'messaging/internal-error' });
      return { sent: 1, failed: 0 };
    });
    expect(await deliverBetPush({ db, code: CODE, send, now: () => NOW })).toEqual({ sent: 1, failed: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(logged()).toContain(CODE);
    expect(logged()).toContain('messaging/internal-error');
    ['jack', 'sam', 'creator', PHONE, 'tok-'].forEach((secret) => expect(logged()).not.toContain(secret));
  });

  test('nothing to send: open, missing, stale, old number settledAt, or no recipients', async () => {
    const send = ok();
    const cases = [
      [openBet(), 'not-settled'],
      [settled(openBet(), 'a', NOW - MAX_EVENT_AGE_MS - 1), 'stale'],
      [{ ...settled(), settledAt: undefined }, 'no-event'],
      [{ ...settled(), winnerId: 'gone', settlement: { ...settled().settlement, optionLabel: '' } }, 'no-winner'],
      [settled(openBet({ votes: [{ voterId: 'creator', optionId: 'a' }] })), 'no-recipients'],
      [calledOff(openBet({ votes: [{ voterId: 'creator', optionId: 'a' }, { voterId: 'x' }] })), 'no-recipients'],
    ];
    for (const [bet, skipped] of cases) {
      const db = seeded(bet);
      expect(await deliverBetPush({ db, code: CODE, send, now: () => NOW })).toEqual({ sent: 0, failed: 0, skipped });
      expect(claims(db)).toEqual([]);
    }
    expect(await deliverBetPush({ db: fakeDb(), code: CODE, send, now: () => NOW })).toEqual({ sent: 0, failed: 0, skipped: 'not-found' });
    expect(send).not.toHaveBeenCalled();
  });

  describe('end to end with the real sendToUser and a mocked Messaging', () => {
    const DEVICES = (uid) => `privatePushTokens/${uid}/devices`;
    let messaging;
    beforeEach(() => {
      messaging = {
        sendEach: jest.fn(async (messages) => ({ responses: messages.map(() => ({ success: true })) })),
      };
      adminMessaging.mockReturnValue(messaging);
    });

    const withDevices = (bet) => seeded(bet, {
      [`${DEVICES('creator')}/d0`]: { token: 'tok-creator', platform: 'android' },
      [`${DEVICES('jack')}/d1`]: { token: 'tok-jack-android', platform: 'android' },
      [`${DEVICES('sam')}/d2`]: { token: 'tok-sam-ios', platform: 'ios' },
    });

    test('Android and iOS messages carry the copy, route, collapse, thread and channel; the creator gets nothing', async () => {
      const db = withDevices(settled());
      adminDb.mockReturnValue(db);
      expect(await deliverBetPush({ db, code: CODE, send: sendToUser, now: () => NOW })).toEqual({ sent: 2, failed: 0 });
      const messages = messaging.sendEach.mock.calls.flatMap(([batch]) => batch);
      expect(messages.map((m) => m.token).sort()).toEqual(['tok-jack-android', 'tok-sam-ios']);
      messages.forEach((m) => {
        expect(m.notification).toEqual({ title: 'Who is late', body: 'Over won. See who called it.' });
        expect(m.data).toEqual({ code: CODE, route: `/b/${CODE}`, event: 'settle' });
        expect(m.android).toEqual({ collapseKey: CODE, notification: { tag: CODE, channelId: 'bet_updates' } });
        expect(m.apns).toEqual({ headers: { 'apns-collapse-id': CODE }, payload: { aps: { threadId: CODE } } });
      });
      ['tok-', 'jack', 'sam', 'creator', PHONE].forEach((secret) => expect(logged()).not.toContain(secret));
    });

    test('settle: a non-voter listed in settlement.recipients is never sent, even with a device', async () => {
      const bet = settled();
      bet.settlement.recipients = [...bet.settlement.recipients, { voterId: 'stranger', name: 'X', optionId: 'a' }];
      const db = withDevices(bet);
      await db.doc(`${DEVICES('stranger')}/d9`).set({ token: 'tok-stranger', platform: 'ios' });
      adminDb.mockReturnValue(db);
      const send = jest.fn(sendToUser);
      expect(await deliverBetPush({ db, code: CODE, send, now: () => NOW })).toEqual({ sent: 2, failed: 0 });
      expect(recipientsOf(send)).toEqual(['jack', 'sam']);
      const tokens = messaging.sendEach.mock.calls.flatMap(([batch]) => batch).map((m) => m.token).sort();
      expect(tokens).toEqual(['tok-jack-android', 'tok-sam-ios']);
    });

    test('Messaging throwing for everyone fails soft, logs only the code, and frees the claim', async () => {
      const db = withDevices(calledOff());
      adminDb.mockReturnValue(db);
      messaging.sendEach.mockRejectedValue(Object.assign(new Error('tok-jack-android bad'), { code: 'messaging/unavailable' }));
      expect(await deliverBetPush({ db, code: CODE, send: sendToUser, now: () => NOW })).toEqual({ sent: 0, failed: 2 });
      expect(claims(db)).toEqual([]);
      expect(logged()).toContain('messaging/unavailable');
      ['tok-', 'jack', 'sam', 'creator'].forEach((secret) => expect(logged()).not.toContain(secret));
    });

    test('admin not configured: skipped, no throw, no claim left', async () => {
      const db = withDevices(settled());
      adminDb.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'admin-not-configured' }); });
      // sendToUser reads its own admin handles; deliver still has the db it was given.
      expect(await deliverBetPush({ db, code: CODE, send: sendToUser, now: () => NOW })).toEqual({ sent: 0, failed: 0 });
      expect(messaging.sendEach).not.toHaveBeenCalled();
      expect(claims(db)).toEqual([]);
    });
  });
});

describe('first-pick push', () => {
  const VOTES = (uid) => `bets/${CODE}/votes/${uid}`;
  const pickBet = (overrides = {}) => openBet({ votes: [{ voterId: 'creator', name: 'Casey', optionId: 'a' }], ...overrides });
  const voteDoc = (uid, name, optionId, ms = NOW - 1000) => ({ voterId: uid, name, optionId, at: at(ms) });
  const pickClaim = (uid = 'maya') => `privatePushSends/pick:${CODE}:${uid}`;
  const deliver = (db, actorUid = 'maya', extra = {}) => deliverPickPush({ db, code: CODE, actorUid, now: () => NOW, ...extra });
  const COUNT = `privatePushSends/${pickCountId(CODE)}`;
  const countOf = (db) => (db.data(COUNT)?.sends || []).length;

  describe('copy and payload', () => {
    test('first-pick bodies are the UX-final strings, verbatim', () => {
      expect(PUSH_NOTIFICATION_COPY.firstPickNamed('Maya', 'Over')).toBe('Maya picked Over.');
      expect(PUSH_NOTIFICATION_COPY.firstPickNamed('D’Andre', 'Under')).toBe('D’Andre picked Under.');
      expect(PUSH_NOTIFICATION_COPY.firstPickUnnamed('Over')).toBe('A friend picked Over.');
    });

    test('named: question title, "{name} picked {side}.", /b/{code}, event pick, strings only', () => {
      const push = buildPickPush(pickBet(), CODE, { voterId: 'maya', name: '  Maya  ', optionId: 'b' });
      expect(push).toEqual({
        title: 'Who is late',
        body: 'Maya picked Under.',
        data: { code: CODE, route: `/b/${CODE}`, event: 'pick' },
      });
      Object.values(push.data).forEach((value) => expect(typeof value).toBe('string'));
    });

    test('unnamed when the cleaned name is empty', () => {
      for (const name of ['', '   ', undefined, null]) {
        expect(buildPickPush(pickBet(), CODE, { voterId: 'maya', name, optionId: 'a' }).body).toBe('A friend picked Over.');
      }
    });

    test('control characters and newlines in a name are dropped so the body is one line', () => {
      const body = (name) => buildPickPush(pickBet(), CODE, { voterId: 'maya', name, optionId: 'a' }).body;
      expect(body('Maya\nLee')).toBe('Maya Lee picked Over.');
      expect(body('Maya\tLee\r\n  Jr')).toBe('Maya Lee Jr picked Over.');
      expect(body('Ma\u0000ya\u0085')).toBe('Ma ya picked Over.');
      for (const name of ['\n', '\u0000\u0007', '\t\r\n\u007F\u009F']) expect(body(name)).toBe('A friend picked Over.');
      expect(body('Maya')).toBe('Maya picked Over.');
      expect(body('D’Andre')).toBe('D’Andre picked Over.');
      expect(body('Mary Ann')).toBe('Mary Ann picked Over.');
    });

    test('the side is the vote label (an over-under line), and the name is capped like cleanName', () => {
      const bet = pickBet({ type: 'over-under', line: 7.5 });
      expect(buildPickPush(bet, CODE, { voterId: 'maya', name: 'M'.repeat(40), optionId: 'a' }).body)
        .toBe(`${'M'.repeat(30)} picked Over 7.5.`);
    });

    test('data has no phone, name, token or uid', () => {
      const push = buildPickPush(pickBet(), CODE, { voterId: 'maya', name: 'Maya', optionId: 'a', phone: PHONE });
      const data = JSON.stringify(push.data);
      ['Maya', 'maya', 'creator', '555', 'tok-'].forEach((secret) => expect(data).not.toContain(secret));
      expect(JSON.stringify(push)).not.toContain('555');
    });

    test('claim id and recorded pick', () => {
      expect(pickEventId(CODE, 'maya')).toBe(`pick:${CODE}:maya`);
      const bet = pickBet({ votes: [{ voterId: 'maya', optionId: 'a' }, { voterId: 'lurker', name: 'L' }] });
      expect(recordedPick(bet, 'maya')).toMatchObject({ optionId: 'a' });
      expect(recordedPick(bet, 'lurker')).toBeNull();
      expect(recordedPick(bet, '')).toBeNull();
      expect(recordedPick(bet, 'stranger')).toBeNull();
    });
  });

  test('flag off: no read, no send', async () => {
    for (const value of [undefined, '', '0', 'true']) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
      else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
      const db = { doc: jest.fn(), collection: jest.fn(), runTransaction: jest.fn() };
      const send = jest.fn();
      expect(await deliver(db, 'maya', { send })).toEqual({ sent: 0, failed: 0, skipped: 'disabled' });
      expect(db.doc).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
    expect(adminMessaging).not.toHaveBeenCalled();
  });

  test('a first pick (vote doc) sends once, to the creator only, with the named body and bet options', async () => {
    const db = seeded(pickBet(), { [VOTES('maya')]: voteDoc('maya', 'Maya', 'b') });
    const send = ok();
    expect(await deliver(db, 'maya', { send })).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const [uid, payload, options] = send.mock.calls[0];
    expect(uid).toBe('creator');
    expect(payload).toEqual({ title: 'Who is late', body: 'Maya picked Under.', data: { code: CODE, route: `/b/${CODE}`, event: 'pick' } });
    expect(options).toEqual(betPushOptions(CODE));
    expect(claims(db)).toEqual([pickClaim()]);
    expect(db.data(pickClaim())).toEqual({ code: CODE, at: NOW });
    expect(db.data(COUNT)).toEqual({ code: CODE, sends: [NOW] });
  });

  test('a first pick from the legacy array with no name sends the unnamed body', async () => {
    const db = seeded(pickBet({ votes: [...pickBet().votes, { voterId: 'maya', name: '', optionId: 'a', at: NOW - 500 }] }));
    const send = ok();
    expect(await deliver(db, 'maya', { send })).toEqual({ sent: 1, failed: 0 });
    expect(send.mock.calls[0][1].body).toBe('A friend picked Over.');
  });

  test('a second call for the same voter sends nothing, even after a side or name change', async () => {
    const db = seeded(pickBet(), { [VOTES('maya')]: voteDoc('maya', 'Maya', 'a') });
    const send = ok();
    await deliver(db, 'maya', { send });
    await db.doc(VOTES('maya')).set(voteDoc('maya', 'May', 'b', NOW - 10));
    expect(await deliver(db, 'maya', { send })).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(claims(db)).toEqual([pickClaim()]);
    expect(countOf(db)).toBe(1);
  });

  test('concurrent calls for one voter send once; another voter has their own claim', async () => {
    const db = seeded(pickBet(), { [VOTES('maya')]: voteDoc('maya', 'Maya', 'a'), [VOTES('lee')]: voteDoc('lee', 'Lee', 'b') });
    const send = ok();
    const runs = await Promise.all([1, 2, 3].map(() => deliver(db, 'maya', { send })));
    expect(runs.reduce((sum, run) => sum + run.sent, 0)).toBe(1);
    expect(await deliver(db, 'lee', { send })).toEqual({ sent: 1, failed: 0 });
    expect(send.mock.calls.map(([, payload]) => payload.body)).toEqual(['Maya picked Over.', 'Lee picked Under.']);
    expect(claims(db).sort()).toEqual([pickClaim('lee'), pickClaim('maya')]);
    expect(countOf(db)).toBe(2);
  });

  test('the creator’s own pick sends nothing and claims nothing', async () => {
    const db = seeded(pickBet());
    const send = ok();
    expect(await deliver(db, 'creator', { send })).toEqual({ sent: 0, failed: 0, skipped: 'self' });
    expect(send).not.toHaveBeenCalled();
    expect(claims(db)).toEqual([]);
  });

  test('no recorded pick, a stale pick, or no side label: nothing sent, nothing claimed', async () => {
    const send = ok();
    const cases = [
      [seeded(pickBet()), 'no-pick'],
      [seeded(pickBet({ votes: [{ voterId: 'maya', name: 'Maya' }] })), 'no-pick'],
      [seeded(pickBet(), { [VOTES('maya')]: voteDoc('maya', 'Maya', 'a', NOW - MAX_EVENT_AGE_MS - 1) }), 'stale'],
      [seeded(pickBet({ votes: [{ voterId: 'maya', optionId: 'a', at: NOW - MAX_EVENT_AGE_MS - 1 }] })), 'stale'],
      [seeded(pickBet(), { [VOTES('maya')]: voteDoc('maya', 'Maya', 'gone') }), 'no-side'],
      [seeded(pickBet({ createdByID: undefined }), { [VOTES('maya')]: voteDoc('maya', 'Maya', 'a') }), 'no-recipients'],
    ];
    for (const [db, skipped] of cases) {
      expect(await deliver(db, 'maya', { send })).toEqual({ sent: 0, failed: 0, skipped });
      expect(claims(db)).toEqual([]);
      expect(db.data(COUNT)).toBeUndefined();
    }
    expect(await deliver(fakeDb(), 'maya', { send })).toEqual({ sent: 0, failed: 0, skipped: 'not-found' });
    expect(send).not.toHaveBeenCalled();
  });

  test('a pick with no time yet still sends', async () => {
    const db = seeded(pickBet({ votes: [{ voterId: 'maya', name: 'Maya', optionId: 'a' }] }));
    const send = ok();
    expect(await deliver(db, 'maya', { send })).toEqual({ sent: 1, failed: 0 });
  });

  test('a failed or unconfigured send drops the claim so a retry can send', async () => {
    const db = seeded(pickBet(), { [VOTES('maya')]: voteDoc('maya', 'Maya', 'a') });
    const failing = jest.fn(async () => ({ sent: 0, failed: 1, removed: 0 }));
    expect(await deliver(db, 'maya', { send: failing })).toEqual({ sent: 0, failed: 1 });
    expect(claims(db)).toEqual([]);
    expect(countOf(db)).toBe(0);
    for (const skipped of ['admin-not-configured', 'read-failed']) {
      const skip = jest.fn(async () => ({ sent: 0, failed: 0, removed: 0, skipped }));
      expect(await deliver(db, 'maya', { send: skip })).toEqual({ sent: 0, failed: 0 });
      expect(claims(db)).toEqual([]);
      expect(countOf(db)).toBe(0);
    }
    const thrower = jest.fn(async () => { throw Object.assign(new Error(`maya ${PHONE} tok-x`), { code: 'messaging/internal-error' }); });
    expect(await deliver(db, 'maya', { send: thrower })).toEqual({ sent: 0, failed: 1 });
    expect(claims(db)).toEqual([]);
    expect(countOf(db)).toBe(0);
    expect(logged()).toContain(CODE);
    expect(logged()).toContain('messaging/internal-error');
    ['maya', 'Maya', 'creator', PHONE, 'tok-'].forEach((secret) => expect(logged()).not.toContain(secret));
    const send = ok();
    expect(await deliver(db, 'maya', { send })).toEqual({ sent: 1, failed: 0 });
    expect(claims(db)).toEqual([pickClaim()]);
    expect(countOf(db)).toBe(1);
  });

  test('a settled or called-off bet sends nothing and leaves no claim; an open bet still sends', async () => {
    const send = ok();
    const base = pickBet();
    const finished = [
      settled(base, 'a', NOW - 60000),
      calledOff(base),
      { ...base, status: 'closed' },
      { ...base, status: 'called-off' },
    ];
    for (const bet of finished) {
      const db = seeded(bet, { [VOTES('maya')]: voteDoc('maya', 'Maya', 'a') });
      expect(await deliver(db, 'maya', { send })).toEqual({ sent: 0, failed: 0, skipped: 'not-open' });
      expect(claims(db)).toEqual([]);
      expect(db.data(COUNT)).toBeUndefined();
    }
    expect(send).not.toHaveBeenCalled();
    const db = seeded(base, { [VOTES('maya')]: voteDoc('maya', 'Maya', 'a') });
    expect(await deliver(db, 'maya', { send })).toEqual({ sent: 1, failed: 0 });
  });

  describe('per-bet cap', () => {
    const voters = (n, from = 0) => Array.from({ length: n }, (_, i) => `v${from + i}`);
    const crowd = (uids, ms = NOW - 1000) => Object.fromEntries(uids.map((uid) => [VOTES(uid), voteDoc(uid, 'Friend', 'a', ms)]));

    test('constants: 10 per bet per 10 minutes', () => {
      expect(PICK_PUSH_BET_LIMIT).toBe(10);
      expect(PICK_PUSH_BET_WINDOW_MS).toBe(10 * 60 * 1000);
      expect(pickCountId(CODE)).toBe(`pickcount:${CODE}`);
    });

    test('the first 10 distinct voters send to the creator; the 11th is capped but claimed', async () => {
      const uids = voters(11);
      const db = seeded(pickBet(), crowd(uids));
      const send = ok();
      for (const uid of uids.slice(0, 10)) expect(await deliver(db, uid, { send })).toEqual({ sent: 1, failed: 0 });
      expect(send).toHaveBeenCalledTimes(10);
      expect(new Set(recipientsOf(send))).toEqual(new Set(['creator']));
      expect(await deliver(db, 'v10', { send })).toEqual({ sent: 0, failed: 0, skipped: 'bet-capped' });
      expect(send).toHaveBeenCalledTimes(10);
      expect(claims(db)).toContain(pickClaim('v10'));
      expect(db.data(pickClaim('v10'))).toEqual({ code: CODE, at: NOW });
      expect(countOf(db)).toBe(10);
      // Already claimed now: already-sent, and the count does not move.
      expect(await deliver(db, 'v10', { send })).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
      expect(await deliver(db, 'v3', { send })).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
      expect(countOf(db)).toBe(10);
      expect(send).toHaveBeenCalledTimes(10);
      ['v10', 'Friend', 'creator'].forEach((secret) => expect(logged()).not.toContain(secret));
    });

    test('after the window resets a new voter sends again; the capped voter still does not', async () => {
      const early = voters(11);
      const db = seeded(pickBet(), crowd(early));
      const send = ok();
      for (const uid of early) await deliver(db, uid, { send });
      expect(send).toHaveBeenCalledTimes(10);
      const later = NOW + PICK_PUSH_BET_WINDOW_MS + 1;
      const fresh = voters(2, 11);
      for (const uid of fresh) await db.doc(VOTES(uid)).set(voteDoc(uid, 'Friend', 'b', later - 1000));
      await db.doc(VOTES('v10')).set(voteDoc('v10', 'Friend', 'b', later - 1000));
      const after = (uid) => deliver(db, uid, { send, now: () => later });
      expect(await after('v10')).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
      expect(await after('v11')).toEqual({ sent: 1, failed: 0 });
      expect(await after('v12')).toEqual({ sent: 1, failed: 0 });
      expect(send).toHaveBeenCalledTimes(12);
      // Old send times dropped out of the window.
      expect(db.data(COUNT)).toEqual({ code: CODE, sends: [later, later] });
    });

    test('a slot frees as the oldest send leaves the rolling window', async () => {
      const uids = voters(12);
      const db = seeded(pickBet(), crowd(uids));
      const send = ok();
      await deliver(db, 'v0', { send, now: () => NOW - 60000 });
      for (const uid of uids.slice(1, 10)) await deliver(db, uid, { send });
      expect(await deliver(db, 'v10', { send })).toEqual({ sent: 0, failed: 0, skipped: 'bet-capped' });
      const later = NOW - 60000 + PICK_PUSH_BET_WINDOW_MS;
      expect(await deliver(db, 'v11', { send, now: () => later })).toEqual({ sent: 1, failed: 0 });
      expect(countOf(db)).toBe(10);
    });

    test('a failed send gives its slot back; a creator with no device keeps it consumed', async () => {
      const uids = voters(11);
      const db = seeded(pickBet(), crowd(uids));
      const send = ok();
      for (const uid of uids.slice(0, 9)) await deliver(db, uid, { send });
      const failing = jest.fn(async () => ({ sent: 0, failed: 1, removed: 0 }));
      expect(await deliver(db, 'v9', { send: failing })).toEqual({ sent: 0, failed: 1 });
      expect(countOf(db)).toBe(9);
      expect(claims(db)).not.toContain(pickClaim('v9'));
      const noDevice = jest.fn(async () => ({ sent: 0, failed: 0, removed: 0 }));
      expect(await deliver(db, 'v9', { send: noDevice })).toEqual({ sent: 0, failed: 0 });
      expect(countOf(db)).toBe(10);
      expect(claims(db)).toContain(pickClaim('v9'));
      expect(await deliver(db, 'v10', { send })).toEqual({ sent: 0, failed: 0, skipped: 'bet-capped' });
    });

    test('concurrent distinct voters never exceed the cap', async () => {
      const uids = voters(14);
      const db = seeded(pickBet(), crowd(uids));
      const send = ok();
      const runs = [];
      for (let i = 0; i < uids.length; i += 2) {
        runs.push(...await Promise.all(uids.slice(i, i + 2).map((uid) => deliver(db, uid, { send }))));
      }
      expect(runs.filter((run) => run.sent === 1)).toHaveLength(10);
      expect(runs.filter((run) => run.skipped === 'bet-capped')).toHaveLength(4);
      expect(countOf(db)).toBe(10);
      expect(claims(db)).toHaveLength(14);
    });
  });

  describe('with the real sendToUser and a mocked Messaging', () => {
    const DEVICES = (uid) => `privatePushTokens/${uid}/devices`;
    let messaging;
    beforeEach(() => {
      messaging = { sendEach: jest.fn(async (messages) => ({ responses: messages.map(() => ({ success: true })) })) };
      adminMessaging.mockReturnValue(messaging);
    });

    test('Android and iOS messages to the creator’s devices carry the copy, route, collapse, thread and channel', async () => {
      const db = seeded(pickBet(), {
        [VOTES('maya')]: voteDoc('maya', 'Maya', 'a'),
        [`${DEVICES('creator')}/d0`]: { token: 'tok-creator-ios', platform: 'ios' },
        [`${DEVICES('creator')}/d1`]: { token: 'tok-creator-android', platform: 'android' },
        [`${DEVICES('maya')}/d2`]: { token: 'tok-maya', platform: 'android' },
      });
      adminDb.mockReturnValue(db);
      expect(await deliver(db, 'maya', { send: sendToUser })).toEqual({ sent: 2, failed: 0 });
      const messages = messaging.sendEach.mock.calls.flatMap(([batch]) => batch);
      expect(messages.map((m) => m.token).sort()).toEqual(['tok-creator-android', 'tok-creator-ios']);
      messages.forEach((m) => {
        expect(m.notification).toEqual({ title: 'Who is late', body: 'Maya picked Over.' });
        expect(m.data).toEqual({ code: CODE, route: `/b/${CODE}`, event: 'pick' });
        expect(m.android).toEqual({ collapseKey: CODE, notification: { tag: CODE, channelId: 'bet_updates' } });
        expect(m.apns).toEqual({ headers: { 'apns-collapse-id': CODE }, payload: { aps: { threadId: CODE } } });
      });
      ['tok-', 'maya', 'Maya', 'creator', PHONE].forEach((secret) => expect(logged()).not.toContain(secret));
    });

    test('a creator with no registered device (push off in the app): no send, no throw, the claim stays', async () => {
      const db = seeded(pickBet(), { [VOTES('maya')]: voteDoc('maya', 'Maya', 'a') });
      adminDb.mockReturnValue(db);
      expect(await deliver(db, 'maya', { send: sendToUser })).toEqual({ sent: 0, failed: 0 });
      expect(messaging.sendEach).not.toHaveBeenCalled();
      expect(claims(db)).toEqual([pickClaim()]);
    });
  });
});
