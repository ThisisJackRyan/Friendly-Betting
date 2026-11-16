/** @jest-environment node */
import { adminDb, adminMessaging } from './firebaseAdmin';
import { buildSettlement } from '../phone/settlement';
import { PUSH_CHANNEL_COPY, PUSH_NOTIFICATION_COPY } from '../phone/pushCopy';
import { PUSH_CHANNEL_ID } from '../phone/pushConfig';
import {
  betPushOptions, buildBetPush, deliverBetPush, MAX_EVENT_AGE_MS, pushEventId, pushRecipients,
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
const claims = (db) => db.paths('privatePushSends/');
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
