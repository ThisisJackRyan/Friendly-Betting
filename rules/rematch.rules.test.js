/**
 * Firestore rules for "Run it back": the rematch is a plain create through
 * createBet with one extra key, rematchOf. Run with `npm run test:rules`.
 */
const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { setLogLevel } = require('firebase/firestore');

const PROJECT_ID = 'demo-friendly-betting';

let testEnv;

// The create rule only checks that a phone_number claim is present.
const PHONE = { phone_number: 'phone-verified', firebase: { sign_in_provider: 'phone' } };
const ANON = { firebase: { sign_in_provider: 'anonymous' } };

const settledBet = {
  schemaVersion: 2,
  code: 'old123',
  type: 'money-line',
  typeLabel: 'Money Line',
  question: 'Who is late',
  stake: 'a coffee',
  closesAt: null,
  line: null,
  options: [
    { id: 'a', label: 'Yes' },
    { id: 'b', label: 'No' },
  ],
  createdByID: 'creator-1',
  createdByName: 'Maya',
  status: 'closed',
  winnerId: 'a',
  votes: [{ voterId: 'anon-1', name: 'Sam', optionId: 'a', at: 1 }],
  settledAt: 2,
  settlement: { version: 1, optionId: 'a', winners: [], recipients: [] },
  createdAt: 1,
};

// What createBet writes for rematchFields(settledBet, creator, 'old123').
const rematch = {
  schemaVersion: 2,
  type: 'money-line',
  typeLabel: 'Money Line',
  question: 'Who is late',
  stake: 'a coffee',
  closesAt: null,
  options: [
    { id: 'a', label: 'Yes' },
    { id: 'b', label: 'No' },
  ],
  line: null,
  rematchOf: { code: 'old123' },
  createdByID: 'creator-1',
  createdByName: 'Maya',
  code: 'new456',
  status: 'open',
  winnerId: null,
  votes: [],
  createdAt: 3,
};

function creator() {
  return testEnv.authenticatedContext('creator-1', PHONE).firestore();
}
function anon(uid = 'anon-1') {
  return testEnv.authenticatedContext(uid, ANON).firestore();
}

beforeAll(async () => {
  // Denied writes are expected here; keep the SDK from logging each one.
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('bets/old123').set(settledBet);
  });
});

describe('run it back', () => {
  test('a phone user creates a rematch with rematchOf', async () => {
    await assertSucceeds(creator().doc('bets/new456').set(rematch));
    const snap = await creator().doc('bets/new456').get();
    expect(snap.data().rematchOf).toEqual({ code: 'old123' });
    expect(snap.data().status).toBe('open');
  });

  test('the old bet stays settled', async () => {
    await assertSucceeds(creator().doc('bets/new456').set(rematch));
    const old = await creator().doc('bets/old123').get();
    expect(old.data()).toMatchObject({ status: 'closed', winnerId: 'a' });
  });

  test('a rematch still cannot carry a result or be made by a voter', async () => {
    await assertFails(creator().doc('bets/new456').set({ ...rematch, status: 'closed', winnerId: 'a' }));
    await assertFails(creator().doc('bets/new456').set({ ...rematch, settledAt: 2 }));
    await assertFails(anon('creator-1').doc('bets/new456').set(rematch));
  });
});
