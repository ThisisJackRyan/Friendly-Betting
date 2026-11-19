/** @jest-environment node */
import { adminDb, adminMessaging } from './firebaseAdmin';
import { PUSH_NOTIFICATION_COPY } from '../phone/pushCopy';
import {
  betPushOptions, buildClosingPush, CLOSING_PUSH_MAX_BETS, CLOSING_PUSH_MAX_SCAN, CLOSING_WINDOW_MS, closingEventId,
  closingRecipients, deliverClosingPush, deliverClosingSoon, inClosingWindow,
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
const MIN = 60 * 1000;
const PHONE = '+15551234567';
const CREATOR_BODY = 'Under an hour left. Nudge anyone who hasn’t picked.';
const PENDING_BODY = 'Under an hour left to pick a side.';
const SECRETS = ['creator', 'Casey', 'jack', 'Jack', 'maya', 'Maya', 'tok-', 'dev-', PHONE, '555'];
let logs;

function openBet(overrides = {}) {
  return {
    schemaVersion: 2,
    status: 'open',
    createdByID: 'creator',
    question: 'Who is late',
    closesAt: NOW + 30 * MIN,
    options: [{ id: 'a', label: 'Over' }, { id: 'b', label: 'Under' }],
    votes: [
      { voterId: 'creator', name: 'Casey', optionId: 'a', phone: PHONE },
      { voterId: 'jack', name: 'Jack', optionId: 'b', phone: PHONE },
    ],
    ...overrides,
  };
}

const ok = () => jest.fn(async () => ({ sent: 1, failed: 0, removed: 0 }));
const seeded = (bet, extra = {}) => fakeDb({ [`bets/${CODE}`]: bet, ...extra });
const claims = (db) => db.paths('privatePushSends/');
const claimPath = (code = CODE) => `privatePushSends/closing:${code}`;
const logged = () => JSON.stringify(logs.map((spy) => spy.mock.calls));
const deliver = (db, extra = {}) => deliverClosingPush({ db, code: CODE, now: () => NOW, ...extra });

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

describe('copy and payload', () => {
  test('closing-soon bodies are the UX-final strings, verbatim, curly apostrophe included', () => {
    expect(PUSH_NOTIFICATION_COPY.closingCreator).toBe(CREATOR_BODY);
    expect(PUSH_NOTIFICATION_COPY.closingPending).toBe(PENDING_BODY);
    expect(PUSH_NOTIFICATION_COPY.closingCreator).toContain('hasn’t');
    expect(PUSH_NOTIFICATION_COPY.closingCreator).not.toContain("'");
  });

  test('creator payload: question title, creator body, /b/{code}, event closing, strings only', () => {
    const push = buildClosingPush(openBet(), CODE, 'creator');
    expect(push).toEqual({ title: 'Who is late', body: CREATOR_BODY, data: { code: CODE, route: `/b/${CODE}`, event: 'closing' } });
    Object.values(push.data).forEach((value) => expect(typeof value).toBe('string'));
    expect(buildClosingPush(openBet(), CODE)).toEqual(push);
  });

  test('not-yet-picked payload: same title and data, the pending body', () => {
    expect(buildClosingPush(openBet({ question: '', bet: 'Legacy question' }), CODE, 'pending')).toEqual({
      title: 'Legacy question',
      body: PENDING_BODY,
      data: { code: CODE, route: `/b/${CODE}`, event: 'closing' },
    });
  });

  test('payload has no phone, name, token or uid', () => {
    for (const kind of ['creator', 'pending']) {
      const text = JSON.stringify(buildClosingPush(openBet(), CODE, kind));
      ['creator', 'Casey', 'jack', 'Jack', '555', 'tok-'].forEach((secret) => expect(text).not.toContain(secret));
    }
  });

  test('claim id is once per bet, with no timestamp', () => {
    expect(closingEventId(CODE)).toBe(`closing:${CODE}`);
  });
});

describe('window and recipients', () => {
  test('strictly under an hour left and still in the future', () => {
    const at = (closesAt) => inClosingWindow({ closesAt }, NOW);
    expect(at(NOW + 1)).toBe(true);
    expect(at(NOW + 30 * MIN)).toBe(true);
    expect(at(NOW + CLOSING_WINDOW_MS - 1)).toBe(true);
    expect(at(NOW + CLOSING_WINDOW_MS)).toBe(false);
    expect(at(NOW + 2 * CLOSING_WINDOW_MS)).toBe(false);
    expect(at(NOW)).toBe(false);
    expect(at(NOW - MIN)).toBe(false);
    [null, undefined, 0, '', String(NOW + MIN), NaN].forEach((value) => expect(at(value)).toBe(false));
    expect(CLOSING_WINDOW_MS).toBe(60 * 60 * 1000);
  });

  test('only the creator; voters who picked are never recipients', () => {
    expect(closingRecipients(openBet())).toEqual(['creator']);
    expect(closingRecipients(openBet({ votes: [] }))).toEqual(['creator']);
    [undefined, null, '', 42].forEach((createdByID) => expect(closingRecipients(openBet({ createdByID }))).toEqual([]));
  });
});

describe('deliverClosingPush', () => {
  test('flag off: no read, no write, no send', async () => {
    for (const value of [undefined, '', '0', 'true']) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
      else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
      const db = { doc: jest.fn(), collection: jest.fn(), runTransaction: jest.fn() };
      const send = jest.fn();
      expect(await deliver(db, { send })).toEqual({ sent: 0, failed: 0, skipped: 'disabled' });
      expect(db.doc).not.toHaveBeenCalled();
      expect(db.collection).not.toHaveBeenCalled();
      expect(db.runTransaction).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
    expect(adminDb).not.toHaveBeenCalled();
    expect(adminMessaging).not.toHaveBeenCalled();
  });

  test('inside the window: the creator gets the creator body once, with bet options, and the bet is claimed', async () => {
    const db = seeded(openBet());
    const send = ok();
    expect(await deliver(db, { send })).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const [uid, payload, options] = send.mock.calls[0];
    expect(uid).toBe('creator');
    expect(payload).toEqual({ title: 'Who is late', body: CREATOR_BODY, data: { code: CODE, route: `/b/${CODE}`, event: 'closing' } });
    expect(options).toEqual(betPushOptions(CODE));
    expect(options).toEqual({ collapseKey: CODE, threadId: CODE, channelId: 'bet_updates', code: CODE });
    expect(claims(db)).toEqual([claimPath()]);
    expect(db.data(claimPath())).toEqual({ code: CODE, at: NOW });
  });

  test('voters who picked (array and vote docs) get nothing; the creator still gets the creator body after picking', async () => {
    const db = seeded(openBet(), {
      [`bets/${CODE}/votes/maya`]: { voterId: 'maya', name: 'Maya', optionId: 'a' },
      [`bets/${CODE}/votes/creator`]: { voterId: 'creator', name: 'Casey', optionId: 'b' },
    });
    const send = ok();
    expect(await deliver(db, { send })).toEqual({ sent: 1, failed: 0 });
    expect(send.mock.calls.map(([uid]) => uid)).toEqual(['creator']);
    expect(send.mock.calls[0][1].body).toBe(CREATOR_BODY);
    expect(send.mock.calls.map(([, payload]) => payload.body)).not.toContain(PENDING_BODY);
  });

  test('a rerun finds the claim and sends nothing, even after the deadline moves', async () => {
    const db = seeded(openBet());
    const send = ok();
    await deliver(db, { send });
    expect(await deliver(db, { send })).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
    await db.doc(`bets/${CODE}`).set(openBet({ closesAt: NOW + 45 * MIN }));
    expect(await deliver(db, { send })).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(claims(db)).toEqual([claimPath()]);
  });

  test('an already-claimed bet is detected from the claim; the bet doc is not read', async () => {
    const db = seeded(openBet(), { [claimPath()]: { code: CODE, at: NOW } });
    const read = [];
    const original = db.doc;
    db.doc = (path) => {
      const ref = original(path);
      return { ...ref, get: async () => { read.push(path); return ref.get(); } };
    };
    const send = ok();
    expect(await deliver(db, { send })).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
    expect(read).toEqual([claimPath()]);
    expect(send).not.toHaveBeenCalled();
  });

  test('reads only the bet doc, never the votes collection', async () => {
    const db = seeded(openBet(), { [`bets/${CODE}/votes/maya`]: { voterId: 'maya', name: 'Maya', optionId: 'a' } });
    const collections = [];
    const original = db.collection.bind(db);
    db.collection = (path) => {
      collections.push(path);
      return original(path);
    };
    const send = ok();
    expect(await deliver(db, { send })).toEqual({ sent: 1, failed: 0 });
    expect(collections).toEqual([]);
    expect(send.mock.calls.map(([uid]) => uid)).toEqual(['creator']);
  });

  test('concurrent runs send once', async () => {
    const db = seeded(openBet());
    const send = ok();
    const runs = await Promise.all([1, 2, 3, 4].map(() => deliver(db, { send })));
    expect(runs.reduce((sum, run) => sum + run.sent, 0)).toBe(1);
    expect(runs.filter((run) => run.skipped === 'already-sent')).toHaveLength(3);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['exactly an hour left', { closesAt: NOW + CLOSING_WINDOW_MS }, 'outside-window'],
    ['more than an hour left', { closesAt: NOW + 3 * CLOSING_WINDOW_MS }, 'outside-window'],
    ['at closesAt', { closesAt: NOW }, 'closed'],
    ['past closesAt', { closesAt: NOW - MIN }, 'closed'],
    ['no closesAt', { closesAt: null }, 'no-close-time'],
    ['closesAt missing', { closesAt: undefined }, 'no-close-time'],
    ['closesAt not a number', { closesAt: String(NOW + MIN) }, 'no-close-time'],
    ['settled', { status: 'closed', winnerId: 'a' }, 'settled'],
    ['called off (boolean)', { calledOff: true }, 'called-off'],
    ['called off (status)', { status: 'called-off' }, 'called-off'],
    ['called off and closed', { status: 'closed', calledOff: true, winnerId: 'a' }, 'called-off'],
    ['closed with no winner yet', { status: 'closed' }, 'closed'],
    ['no creator', { createdByID: undefined }, 'no-recipients'],
    ['empty creator', { createdByID: '' }, 'no-recipients'],
  ])('%s: nothing sent, nothing claimed', async (_, overrides, skipped) => {
    const db = seeded(openBet(overrides));
    const send = ok();
    expect(await deliver(db, { send })).toEqual({ sent: 0, failed: 0, skipped });
    expect(send).not.toHaveBeenCalled();
    expect(claims(db)).toEqual([]);
  });

  test('a missing bet: nothing sent, nothing claimed', async () => {
    const db = fakeDb();
    const send = ok();
    expect(await deliver(db, { send })).toEqual({ sent: 0, failed: 0, skipped: 'not-found' });
    expect(send).not.toHaveBeenCalled();
    expect(claims(db)).toEqual([]);
  });

  test('a legacy open bet with no status still gets the reminder', async () => {
    const bet = openBet();
    delete bet.status;
    const db = seeded(bet);
    const send = ok();
    expect(await deliver(db, { send })).toEqual({ sent: 1, failed: 0 });
  });

  test('a creator with no registered device: nothing sent, not a failure, the claim stays', async () => {
    const db = seeded(openBet());
    const send = jest.fn(async () => ({ sent: 0, failed: 0, removed: 0, skipped: 'no-devices' }));
    expect(await deliver(db, { send })).toEqual({ sent: 0, failed: 0, skipped: 'no-devices' });
    expect(claims(db)).toEqual([claimPath()]);
    expect(await deliver(db, { send })).toEqual({ sent: 0, failed: 0, skipped: 'already-sent' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('a failed, thrown or unconfigured send drops the claim so a later run can send', async () => {
    const db = seeded(openBet());
    const failing = jest.fn(async () => ({ sent: 0, failed: 1, removed: 0 }));
    expect(await deliver(db, { send: failing })).toEqual({ sent: 0, failed: 1 });
    expect(claims(db)).toEqual([]);
    for (const skipped of ['admin-not-configured', 'read-failed']) {
      const skip = jest.fn(async () => ({ sent: 0, failed: 0, removed: 0, skipped }));
      expect(await deliver(db, { send: skip })).toEqual({ sent: 0, failed: 0, skipped });
      expect(claims(db)).toEqual([]);
    }
    const thrower = jest.fn(async () => { throw Object.assign(new Error(`creator ${PHONE} tok-x`), { code: 'messaging/internal-error' }); });
    expect(await deliver(db, { send: thrower })).toEqual({ sent: 0, failed: 1 });
    expect(claims(db)).toEqual([]);
    expect(logged()).toContain(CODE);
    expect(logged()).toContain('messaging/internal-error');
    SECRETS.forEach((secret) => expect(logged()).not.toContain(secret));
    const send = ok();
    expect(await deliver(db, { send })).toEqual({ sent: 1, failed: 0 });
    expect(claims(db)).toEqual([claimPath()]);
  });

  describe('with the real sendToUser and a mocked Messaging', () => {
    const DEVICES = (uid) => `privatePushTokens/${uid}/devices`;
    let messaging;
    beforeEach(() => {
      messaging = { sendEach: jest.fn(async (messages) => ({ responses: messages.map(() => ({ success: true })) })) };
      adminMessaging.mockReturnValue(messaging);
    });

    test('only the creator’s devices get it, with the copy, route, collapse, thread and channel', async () => {
      const db = seeded(openBet(), {
        [`bets/${CODE}/votes/maya`]: { voterId: 'maya', name: 'Maya', optionId: 'a' },
        [`${DEVICES('creator')}/dev-c0`]: { token: 'tok-creator-ios', platform: 'ios' },
        [`${DEVICES('creator')}/dev-c1`]: { token: 'tok-creator-android', platform: 'android' },
        [`${DEVICES('jack')}/dev-j`]: { token: 'tok-jack', platform: 'android' },
        [`${DEVICES('maya')}/dev-m`]: { token: 'tok-maya', platform: 'ios' },
      });
      adminDb.mockReturnValue(db);
      expect(await deliver(db, { send: sendToUser })).toEqual({ sent: 2, failed: 0 });
      const messages = messaging.sendEach.mock.calls.flatMap(([batch]) => batch);
      expect(messages.map((m) => m.token).sort()).toEqual(['tok-creator-android', 'tok-creator-ios']);
      messages.forEach((m) => {
        expect(m.notification).toEqual({ title: 'Who is late', body: CREATOR_BODY });
        expect(m.data).toEqual({ code: CODE, route: `/b/${CODE}`, event: 'closing' });
        expect(m.android).toEqual({ collapseKey: CODE, notification: { tag: CODE, channelId: 'bet_updates' } });
        expect(m.apns).toEqual({ headers: { 'apns-collapse-id': CODE }, payload: { aps: { threadId: CODE } } });
      });
      SECRETS.forEach((secret) => expect(logged()).not.toContain(secret));
    });

    test('prefs off (the app unregistered, so no device): no Messaging call, no throw, the claim stays', async () => {
      const db = seeded(openBet(), { [`${DEVICES('jack')}/dev-j`]: { token: 'tok-jack', platform: 'android' } });
      adminDb.mockReturnValue(db);
      expect(await deliver(db, { send: sendToUser })).toEqual({ sent: 0, failed: 0, skipped: 'no-devices' });
      expect(messaging.sendEach).not.toHaveBeenCalled();
      expect(claims(db)).toEqual([claimPath()]);
    });
  });
});

describe('deliverClosingSoon (the cron batch)', () => {
  const bet = (code, minutesLeft, overrides = {}) => [`bets/${code}`, openBet({ closesAt: NOW + minutesLeft * MIN, ...overrides })];
  const run = (db, extra = {}) => deliverClosingSoon({ db, now: () => NOW, ...extra });

  test('flag off: no query, no write, no send', async () => {
    for (const value of [undefined, '', '0', 'true']) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
      else process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
      const db = { doc: jest.fn(), collection: jest.fn(), runTransaction: jest.fn() };
      const send = jest.fn();
      expect(await run(db, { send })).toEqual({ processed: 0, sent: 0, failed: 0, skipped: 'disabled' });
      expect(db.collection).not.toHaveBeenCalled();
      expect(db.doc).not.toHaveBeenCalled();
      expect(db.runTransaction).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
    expect(adminDb).not.toHaveBeenCalled();
    expect(adminMessaging).not.toHaveBeenCalled();
  });

  test('queries closesAt in the strict window, soonest first, bounded by the limit', async () => {
    const db = fakeDb();
    const calls = [];
    const chain = { where: jest.fn(() => chain), orderBy: jest.fn(() => chain), limit: jest.fn(() => chain), get: jest.fn(async () => ({ docs: [] })) };
    db.collection = jest.fn((path) => {
      calls.push(path);
      return chain;
    });
    expect(await run(db, { send: ok() })).toEqual({ processed: 0, notified: 0, sent: 0, failed: 0, skips: {} });
    expect(calls).toEqual(['bets']);
    expect(chain.where.mock.calls).toEqual([['closesAt', '>', NOW], ['closesAt', '<', NOW + CLOSING_WINDOW_MS]]);
    expect(chain.orderBy.mock.calls).toEqual([['closesAt', 'asc']]);
    expect(chain.limit.mock.calls).toEqual([[CLOSING_PUSH_MAX_SCAN]]);
    expect(CLOSING_PUSH_MAX_BETS).toBe(50);
    expect(CLOSING_PUSH_MAX_SCAN).toBe(200);
    expect(CLOSING_PUSH_MAX_SCAN).toBeGreaterThan(CLOSING_PUSH_MAX_BETS);
  });

  test('sends only bets in the window; skips settled, called-off and closed ones; counts only, no uids', async () => {
    const db = fakeDb(Object.fromEntries([
      bet('in1111', 10),
      bet('in2222', 59),
      bet('hour00', 60),
      bet('later0', 120),
      bet('past00', -5),
      bet('settle', 20, { status: 'closed', winnerId: 'a' }),
      bet('calloff', 20, { calledOff: true }),
      bet('callof2', 20, { status: 'called-off' }),
      bet('closed', 20, { status: 'closed' }),
      ['bets/noclose', openBet({ closesAt: null })],
      ['bets/legacy', { createdByID: 'creator', bet: 'Legacy', options: [] }],
    ]));
    const send = ok();
    const result = await run(db, { send });
    expect(result).toEqual({
      processed: 6,
      notified: 2,
      sent: 2,
      failed: 0,
      skips: { settled: 1, 'called-off': 2, closed: 1 },
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([uid]) => uid)).toEqual(['creator', 'creator']);
    expect(send.mock.calls.map(([, , options]) => options.code)).toEqual(['in1111', 'in2222']);
    expect(claims(db).sort()).toEqual([claimPath('in1111'), claimPath('in2222')]);
    const text = JSON.stringify(result);
    SECRETS.forEach((secret) => expect(text).not.toContain(secret));
  });

  test('a rerun sends nothing new; a bet that enters the window later still sends on a later run', async () => {
    const db = fakeDb(Object.fromEntries([bet('first1', 30), bet('second', 70)]));
    const send = ok();
    expect(await run(db, { send })).toMatchObject({ processed: 1, sent: 1 });
    expect(await run(db, { send })).toMatchObject({ processed: 1, sent: 0, skips: { 'already-sent': 1 } });
    const later = await deliverClosingSoon({ db, now: () => NOW + 15 * MIN, send });
    expect(later).toMatchObject({ processed: 2, sent: 1, skips: { 'already-sent': 1 } });
    expect(send.mock.calls.map(([, , options]) => options.code)).toEqual(['first1', 'second']);
    expect(claims(db).sort()).toEqual([claimPath('first1'), claimPath('second')]);
  });

  test('concurrent runs send each bet once', async () => {
    const db = fakeDb(Object.fromEntries([bet('first1', 10), bet('second', 20)]));
    const send = ok();
    const runs = await Promise.all([1, 2, 3].map(() => run(db, { send })));
    expect(runs.reduce((sum, item) => sum + item.sent, 0)).toBe(2);
    expect(send.mock.calls.map(([, , options]) => options.code).sort()).toEqual(['first1', 'second']);
  });

  test('honors the limit, soonest closing first; the rest wait for a later run', async () => {
    const entries = Array.from({ length: CLOSING_PUSH_MAX_BETS + 5 }, (_, i) => bet(`bet${String(i).padStart(3, '0')}`, 55 - i * 0.5));
    const db = fakeDb(Object.fromEntries(entries));
    const send = ok();
    const result = await run(db, { send });
    expect(result.processed).toBe(CLOSING_PUSH_MAX_BETS);
    expect(result.sent).toBe(CLOSING_PUSH_MAX_BETS);
    const codes = send.mock.calls.map(([, , options]) => options.code);
    expect(codes[0]).toBe('bet054');
    expect(codes).not.toContain('bet000');
    expect(codes).not.toContain('bet004');
    const later = await run(db, { send, limit: 2 });
    expect(later).toMatchObject({ sent: 2, notified: 2 });
    expect(later.skips['already-sent']).toBe(CLOSING_PUSH_MAX_BETS);
    expect(send.mock.calls.map(([, , options]) => options.code).slice(-2)).toEqual(['bet004', 'bet003']);
  });

  test('already-claimed bets do not use up the per-run slots; later unclaimed bets still send', async () => {
    const claimed = Array.from({ length: CLOSING_PUSH_MAX_BETS }, (_, i) => bet(`old${String(i).padStart(3, '0')}`, 10 + i * 0.1));
    const claimsFor = claimed.map(([path]) => {
      const code = path.slice('bets/'.length);
      return [`privatePushSends/closing:${code}`, { code, at: NOW }];
    });
    const fresh = [bet('new001', 50), bet('new002', 51)];
    const db = fakeDb(Object.fromEntries([...claimed, ...claimsFor, ...fresh]));
    const send = ok();
    const result = await run(db, { send });
    expect(result.skips['already-sent']).toBe(CLOSING_PUSH_MAX_BETS);
    expect(result.sent).toBe(2);
    expect(result.notified).toBe(2);
    expect(send.mock.calls.map(([, , options]) => options.code)).toEqual(['new001', 'new002']);
  });

  test('one bad bet does not stop the rest; logs hold only codes and error codes', async () => {
    const db = fakeDb(Object.fromEntries([bet('first1', 10), bet('second', 20), bet('third0', 30)]));
    const send = jest.fn(async (uid, payload, options) => {
      if (options.code === 'first1') throw Object.assign(new Error(`${uid} ${PHONE} tok-abc`), { code: 'messaging/internal-error' });
      if (options.code === 'second') return { sent: 0, failed: 0, removed: 0, skipped: 'no-devices' };
      return { sent: 1, failed: 0, removed: 0 };
    });
    expect(await run(db, { send })).toEqual({ processed: 3, notified: 1, sent: 1, failed: 1, skips: { 'no-devices': 1 } });
    expect(claims(db).sort()).toEqual([claimPath('second'), claimPath('third0')]);
    expect(logged()).toContain('first1');
    expect(logged()).toContain('messaging/internal-error');
    SECRETS.forEach((secret) => expect(logged()).not.toContain(secret));
  });

  test('a read failure on one bet is counted and the run goes on', async () => {
    const db = fakeDb(Object.fromEntries([bet('first1', 10), bet('second', 20)]));
    const realDoc = db.doc;
    db.doc = (path) => (path === 'bets/first1'
      ? { path, get: async () => { throw Object.assign(new Error('creator'), { code: 'unavailable' }); } }
      : realDoc(path));
    const send = ok();
    expect(await run(db, { send })).toEqual({ processed: 2, notified: 1, sent: 1, failed: 1, skips: {} });
    expect(logged()).toContain('unavailable');
    SECRETS.forEach((secret) => expect(logged()).not.toContain(secret));
  });
});

describe('fakeDb queries', () => {
  test('where, orderBy and limit on one field; missing, null and other types never match a range', async () => {
    const db = fakeDb({
      'bets/a': { closesAt: 30 },
      'bets/b': { closesAt: 10 },
      'bets/c': { closesAt: 20 },
      'bets/d': { closesAt: null },
      'bets/e': {},
      'bets/f': { closesAt: '15' },
      'bets/a/votes/x': { closesAt: 15 },
    });
    const ids = async (q) => (await q.get()).docs.map((snap) => snap.id);
    expect((await ids(db.collection('bets'))).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(await ids(db.collection('bets').where('closesAt', '>', 5).orderBy('closesAt', 'asc'))).toEqual(['b', 'c', 'a']);
    expect(await ids(db.collection('bets').where('closesAt', '>=', 10).where('closesAt', '<', 30).orderBy('closesAt'))).toEqual(['b', 'c']);
    expect(await ids(db.collection('bets').where('closesAt', '<=', 20).orderBy('closesAt', 'desc'))).toEqual(['c', 'b']);
    expect(await ids(db.collection('bets').where('closesAt', '==', 30))).toEqual(['a']);
    expect(await ids(db.collection('bets').where('closesAt', '>', 0).orderBy('closesAt').limit(2))).toEqual(['b', 'c']);
    expect(() => db.collection('bets').where('closesAt', 'in', [1])).toThrow();
  });
});
