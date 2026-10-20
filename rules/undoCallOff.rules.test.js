/**
 * Rules for calling off a bet and undoing a settle (docs/UNDO-CALL-OFF.md).
 * Run with `npm run test:rules` (needs the emulator; excluded from `npm test`).
 */
const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { setLogLevel } = require('firebase/firestore');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const { FieldValue, Timestamp } = firebase.firestore;
const PROJECT_ID = 'demo-friendly-betting';

let testEnv;

// The rules only check that a phone claim exists, so a placeholder will do.
const PHONE = { phone_number: 'creator-phone-claim', firebase: { sign_in_provider: 'phone' } };
const OTHER_PHONE = { phone_number: 'other-phone-claim', firebase: { sign_in_provider: 'phone' } };
const ANON = { firebase: { sign_in_provider: 'anonymous' } };

const openBet = {
  schemaVersion: 2,
  code: 'abc123',
  type: 'money-line',
  question: 'Who is late',
  stake: 'a coffee',
  options: [
    { id: 'a', label: 'Yes' },
    { id: 'b', label: 'No' },
  ],
  createdByID: 'creator-1',
  createdByName: 'Maya',
  status: 'open',
  winnerId: null,
  votes: [{ voterId: 'anon-1', name: 'Sam', optionId: 'a', at: 1 }],
  createdAt: 1,
};

const settlement = { version: 1, optionId: 'a', winners: [], recipients: [] };

const callOff = () => ({ status: 'closed', calledOff: true, settledAt: FieldValue.serverTimestamp() });

const undo = () => ({
  status: 'open',
  winnerId: null,
  settledAt: FieldValue.delete(),
  settlement: FieldValue.delete(),
  calledOff: FieldValue.delete(),
});

function creator() {
  return testEnv.authenticatedContext('creator-1', PHONE).firestore();
}
function otherPhone() {
  return testEnv.authenticatedContext('creator-9', OTHER_PHONE).firestore();
}
function anon(uid = 'anon-1') {
  return testEnv.authenticatedContext(uid, ANON).firestore();
}
function guest() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seed(docs) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all(Object.entries(docs).map(([docPath, data]) => db.doc(docPath).set(data)));
  });
}

async function read(docPath) {
  let data;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await ctx.firestore().doc(docPath).get()).data();
  });
  return data;
}

const settledAgo = (ms) => ({
  ...openBet,
  status: 'closed',
  winnerId: 'a',
  settlement,
  settledAt: Timestamp.fromMillis(Date.now() - ms),
});

beforeAll(async () => {
  setLogLevel('error');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed({
    'bets/open': { ...openBet, code: 'open' },
    'bets/fresh': { ...settledAgo(2000), code: 'fresh' },
    'bets/stale': { ...settledAgo(60 * 1000), code: 'stale' },
    'bets/legacy': { ...settledAgo(0), code: 'legacy', settledAt: Date.now() },
    'bets/off': { ...openBet, code: 'off', status: 'closed', calledOff: true, settledAt: Timestamp.now() },
    'bets/off-settled': { ...settledAgo(2000), code: 'off-settled', calledOff: true },
    'bets/off-status': { ...openBet, code: 'off-status', status: 'called-off' },
  });
});

describe('call off', () => {
  test('the creator calls off an open bet', async () => {
    await assertSucceeds(creator().doc('bets/open').update(callOff()));
    const bet = await read('bets/open');
    expect(bet).toMatchObject({ status: 'closed', calledOff: true, winnerId: null });
    expect(bet.settledAt).toBeInstanceOf(Timestamp);
  });

  test('another phone user, a voter or a signed-out viewer cannot call it off', async () => {
    await assertFails(otherPhone().doc('bets/open').update(callOff()));
    await assertFails(anon().doc('bets/open').update(callOff()));
    await assertFails(anon('creator-1').doc('bets/open').update(callOff()));
    await assertFails(guest().doc('bets/open').update(callOff()));
  });

  test('a settled or already called-off bet cannot be called off', async () => {
    await assertFails(creator().doc('bets/fresh').update({ calledOff: true }));
    await assertFails(creator().doc('bets/fresh').update({ ...callOff(), winnerId: null, settlement: FieldValue.delete() }));
    await assertFails(creator().doc('bets/stale').update(callOff()));
    await assertFails(creator().doc('bets/off').update(callOff()));
    await assertFails(creator().doc('bets/off-status').update(callOff()));
  });

  test('the call-off write names no winner, no settlement, and only the server time', async () => {
    // (calledOff alongside a real winner is the older settle write, which the
    // settle rule still allows.)
    await assertFails(creator().doc('bets/open').update({ ...callOff(), winnerId: '' }));
    await assertFails(creator().doc('bets/open').update({ ...callOff(), settlement }));
    await assertFails(creator().doc('bets/open').update({ ...callOff(), settledAt: Date.now() }));
    await assertFails(creator().doc('bets/open').update({ ...callOff(), settledAt: Timestamp.fromMillis(Date.now() + 3600 * 1000) }));
    await assertFails(creator().doc('bets/open').update({ status: 'closed', calledOff: true }));
    await assertFails(creator().doc('bets/open').update({ ...callOff(), calledOff: 'yes' }));
    await assertFails(creator().doc('bets/open').update({ ...callOff(), status: 'open' }));
  });

  test('the call-off write cannot touch other fields', async () => {
    await assertFails(creator().doc('bets/open').update({ ...callOff(), question: 'Changed' }));
    await assertFails(creator().doc('bets/open').update({ ...callOff(), votes: [] }));
  });

  test('a called-off bet cannot then be settled', async () => {
    const settle = { status: 'closed', winnerId: 'a', settlement, settledAt: FieldValue.serverTimestamp() };
    await assertFails(creator().doc('bets/off').update(settle));
    await assertFails(creator().doc('bets/off-status').update(settle));
  });
});

describe('settle', () => {
  test('the creator settles with a server settledAt (what the app writes now)', async () => {
    await assertSucceeds(creator().doc('bets/open').update({
      status: 'closed', winnerId: 'a', settlement, settledAt: FieldValue.serverTimestamp(),
    }));
  });

  test('a made-up settledAt timestamp is refused, so the undo window cannot be stretched', async () => {
    await assertFails(creator().doc('bets/open').update({
      status: 'closed', winnerId: 'a', settlement, settledAt: Timestamp.fromMillis(Date.now() + 3600 * 1000),
    }));
  });

  test('older builds that write a number still settle', async () => {
    await assertSucceeds(creator().doc('bets/open').update({
      status: 'closed', winnerId: 'a', settlement, settledAt: Date.now(),
    }));
  });
});

describe('undo a settle', () => {
  test('the creator undoes within the window and the bet is open again', async () => {
    await assertSucceeds(creator().doc('bets/fresh').update(undo()));
    const bet = await read('bets/fresh');
    expect(bet).toMatchObject({ status: 'open', winnerId: null, question: 'Who is late' });
    expect(bet).not.toHaveProperty('settledAt');
    expect(bet).not.toHaveProperty('settlement');
    expect(bet).not.toHaveProperty('calledOff');
  });

  test('after an undo, voting and a fresh settle work as on any open bet', async () => {
    await assertSucceeds(creator().doc('bets/fresh').update(undo()));
    const votes = [...openBet.votes, { voterId: 'anon-2', name: 'Lee', optionId: 'b', at: 3 }];
    await assertSucceeds(anon('anon-2').doc('bets/fresh').update({ votes }));
    await assertSucceeds(creator().doc('bets/fresh').update({
      status: 'closed', winnerId: 'b', settlement, settledAt: FieldValue.serverTimestamp(),
    }));
  });

  test('an undo after the window is denied', async () => {
    await assertFails(creator().doc('bets/stale').update(undo()));
    await seed({ 'bets/edge': { ...settledAgo(36 * 1000), code: 'edge' } });
    await assertFails(creator().doc('bets/edge').update(undo()));
  });

  test('a legacy settle with a number settledAt cannot be undone', async () => {
    await assertFails(creator().doc('bets/legacy').update(undo()));
  });

  test('nobody but the creator can undo', async () => {
    await assertFails(otherPhone().doc('bets/fresh').update(undo()));
    await assertFails(anon().doc('bets/fresh').update(undo()));
    await assertFails(anon('creator-1').doc('bets/fresh').update(undo()));
    await assertFails(guest().doc('bets/fresh').update(undo()));
  });

  test('the undo cannot change other fields', async () => {
    await assertFails(creator().doc('bets/fresh').update({ ...undo(), question: 'Changed' }));
    await assertFails(creator().doc('bets/fresh').update({ ...undo(), votes: [] }));
    await assertFails(creator().doc('bets/fresh').update({ ...undo(), createdByID: 'creator-9' }));
  });

  test('the undo must leave the bet fully open', async () => {
    await assertFails(creator().doc('bets/fresh').update({ ...undo(), status: 'closed' }));
    await assertFails(creator().doc('bets/fresh').update({ ...undo(), winnerId: 'b' }));
    await assertFails(creator().doc('bets/fresh').update({ ...undo(), settlement }));
    await assertFails(creator().doc('bets/fresh').update({ ...undo(), settledAt: FieldValue.serverTimestamp() }));
    await assertFails(creator().doc('bets/fresh').update({ ...undo(), calledOff: false }));
    // A different winner is not an undo.
    await assertFails(creator().doc('bets/fresh').update({ winnerId: 'b' }));
  });

  test('a call-off cannot be undone', async () => {
    await assertFails(creator().doc('bets/off').update(undo()));
    await assertFails(creator().doc('bets/off-settled').update(undo()));
  });
});
