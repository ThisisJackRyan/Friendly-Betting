/**
 * Firestore rules tests. Run with `npm run test:rules` (needs the emulator;
 * excluded from `npm test`).
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

const PHONE = { phone_number: '+15551234567', firebase: { sign_in_provider: 'phone' } };
const OTHER_PHONE = { phone_number: '+15557654321', firebase: { sign_in_provider: 'phone' } };
const ANON = { firebase: { sign_in_provider: 'anonymous' } };

const openBet = {
  schemaVersion: 2,
  code: 'abc123',
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
  status: 'open',
  winnerId: null,
  votes: [{ voterId: 'anon-1', name: 'Sam', optionId: 'a', at: 1 }],
  createdAt: 1,
};

// Shape of a bets/{id} doc written by the old CRA app.
const legacyBet = {
  betID: 'ml-1',
  type: 'Money Line',
  bet: 'Who wins',
};

const settleFields = {
  status: 'closed',
  winnerId: 'a',
  settledAt: 2,
  settlement: { version: 1, optionId: 'a', winners: [], recipients: [] },
};

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
  await seed({
    'bets/abc123': openBet,
    'bets/legacy1': legacyBet,
    'bets/legacy2': { ...legacyBet, createdByID: '' },
    'bets/settled': { ...openBet, code: 'settled', ...settleFields },
    'bets/calledoff': { ...openBet, code: 'calledoff', calledOff: false },
    'bets/settledoff': { ...openBet, code: 'settledoff', ...settleFields, calledOff: true },
    'MoneyLineBets/ml-1': { bet: 'Who wins', contestant1: 'A', contestant2: 'B' },
  });
});

describe('reads', () => {
  test('anyone can read a bet by code', async () => {
    await assertSucceeds(guest().doc('bets/abc123').get());
    await assertSucceeds(anon().doc('bets/abc123').get());
    await assertSucceeds(otherPhone().doc('bets/abc123').get());
    await assertSucceeds(guest().doc('bets/legacy1').get());
    await assertSucceeds(anon().doc('bets/missing').get());
  });

  test('legacy type collections stay readable', async () => {
    await assertSucceeds(guest().doc('MoneyLineBets/ml-1').get());
    await assertSucceeds(anon().doc('OverUnderBets/x').get());
    await assertSucceeds(anon().doc('PropBets/x').get());
    await assertFails(creator().doc('MoneyLineBets/ml-1').update({ bet: 'x' }));
  });

  test('my bets query on createdByID == uid works for the creator only', async () => {
    await assertSucceeds(creator().collection('bets').where('createdByID', '==', 'creator-1').get());
    await assertFails(otherPhone().collection('bets').where('createdByID', '==', 'creator-1').get());
    await assertFails(guest().collection('bets').get());
  });
});

describe('create', () => {
  const fresh = { ...openBet, code: 'new1', votes: [] };

  test('a phone user creates a bet in their own name', async () => {
    await assertSucceeds(creator().doc('bets/new1').set(fresh));
  });

  test('createdByID must be the caller', async () => {
    await assertFails(otherPhone().doc('bets/new1').set(fresh));
  });

  test('anonymous and signed-out users cannot create', async () => {
    await assertFails(anon('creator-1').doc('bets/new1').set(fresh));
    await assertFails(guest().doc('bets/new1').set(fresh));
  });

  test('a bet cannot be created already settled', async () => {
    await assertFails(creator().doc('bets/new1').set({ ...fresh, ...settleFields }));
  });
});

describe('close & settle', () => {
  test('the phone-verified creator settles', async () => {
    await assertSucceeds(creator().doc('bets/abc123').update(settleFields));
  });

  test('anonymous and signed-out viewers cannot settle', async () => {
    await assertFails(anon().doc('bets/abc123').update(settleFields));
    await assertFails(guest().doc('bets/abc123').update(settleFields));
  });

  test('another phone user cannot settle', async () => {
    await assertFails(otherPhone().doc('bets/abc123').update(settleFields));
  });

  test('a matching uid without a verified phone cannot settle', async () => {
    await assertFails(anon('creator-1').doc('bets/abc123').update(settleFields));
    const noPhone = testEnv.authenticatedContext('creator-1', { firebase: { sign_in_provider: 'password' } });
    await assertFails(noPhone.firestore().doc('bets/abc123').update(settleFields));
  });

  test('closing without a winner or touching other fields is denied', async () => {
    await assertFails(creator().doc('bets/abc123').update({ status: 'closed' }));
    await assertFails(creator().doc('bets/abc123').update({ ...settleFields, votes: [] }));
    await assertFails(creator().doc('bets/abc123').update({ ...settleFields, createdByID: 'creator-9' }));
  });

  test('a bet with no creator uid cannot be closed or settled by anyone', async () => {
    const contexts = [creator(), otherPhone(), anon(), guest()];
    for (const db of contexts) {
      await assertFails(db.doc('bets/legacy1').update(settleFields));
      await assertFails(db.doc('bets/legacy2').update(settleFields));
      // A plain close with no winner is denied too.
      await assertFails(db.doc('bets/legacy1').update({ status: 'closed' }));
      await assertFails(db.doc('bets/legacy2').update({ status: 'closed' }));
    }
  });

  test('a settled result is immutable', async () => {
    await assertFails(creator().doc('bets/settled').update({ winnerId: 'b' }));
    await assertFails(creator().doc('bets/settled').update({ status: 'open' }));
    await assertFails(creator().doc('bets/settled').update({ settlement: null }));
    await assertFails(creator().doc('bets/settled').update({ settledAt: 3 }));
    await assertFails(anon().doc('bets/settled').update({ winnerId: 'b' }));
  });

});

describe('delete', () => {
  test('the phone-verified creator deletes their bet, votes and all', async () => {
    await assertSucceeds(creator().doc('bets/abc123').delete());
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      expect((await ctx.firestore().doc('bets/abc123').get()).exists).toBe(false);
    });
  });

  test('the creator can delete a settled bet too', async () => {
    await assertSucceeds(creator().doc('bets/settled').delete());
  });

  test('another phone user, an anonymous voter and a signed-out user cannot delete', async () => {
    for (const db of [otherPhone(), anon(), guest()]) {
      await assertFails(db.doc('bets/abc123').delete());
      await assertFails(db.doc('bets/settled').delete());
    }
  });

  test('a matching uid without a verified phone cannot delete', async () => {
    const sameUidAnon = testEnv.authenticatedContext('creator-1', ANON).firestore();
    await assertFails(sameUidAnon.doc('bets/abc123').delete());
  });

  test('a bet with no creator uid cannot be deleted by anyone', async () => {
    for (const db of [creator(), otherPhone(), anon(), guest()]) {
      await assertFails(db.doc('bets/legacy1').delete());
      await assertFails(db.doc('bets/legacy2').delete());
    }
  });

  test('a voter cannot delete the bet to wipe its votes', async () => {
    // anon-1 has a vote on the bet; deleting it would take every vote with it.
    await assertFails(anon('anon-1').doc('bets/abc123').delete());
    await assertFails(otherPhone().doc('bets/abc123').delete());
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().doc('bets/abc123').get();
      expect(snap.data().votes).toEqual(openBet.votes);
    });
  });

  test('legacy detail docs stay client read-only, even for the creator', async () => {
    await assertFails(creator().doc('MoneyLineBets/ml-1').delete());
  });
});

describe('votes', () => {
  const nextVotes = [
    ...openBet.votes,
    { voterId: 'anon-2', name: 'Lee', optionId: 'b', at: 3 },
  ];

  test('an anonymous voter can update votes on an open bet', async () => {
    await assertSucceeds(anon('anon-2').doc('bets/abc123').update({ votes: nextVotes }));
  });

  test('voters can still vote on legacy bets', async () => {
    await assertSucceeds(anon('anon-2').doc('bets/legacy1').update({ votes: nextVotes }));
  });

  test('a voter cannot change status or winnerId', async () => {
    const db = anon('anon-2');
    await assertFails(db.doc('bets/abc123').update({ votes: nextVotes, status: 'closed' }));
    await assertFails(db.doc('bets/abc123').update({ votes: nextVotes, winnerId: 'a' }));
    await assertFails(db.doc('bets/abc123').update(settleFields));
    await assertFails(db.doc('bets/abc123').update({ createdByID: 'anon-2' }));
  });

  test('signed-out users and settled bets take no votes', async () => {
    await assertFails(guest().doc('bets/abc123').update({ votes: nextVotes }));
    await assertFails(anon('anon-2').doc('bets/settled').update({ votes: nextVotes }));
  });
});

describe('creator edits (saveBet)', () => {
  const edit = {
    schemaVersion: 2,
    type: 'money-line',
    typeLabel: 'Money Line',
    question: 'Who is later',
    stake: 'two coffees',
    closesAt: null,
    options: openBet.options,
    line: null,
    createdByID: 'creator-1',
    createdByName: 'Maya',
  };

  test('the creator edits their own open bet', async () => {
    await assertSucceeds(creator().doc('bets/abc123').update(edit));
  });

  test('the creator cannot change createdByID', async () => {
    await assertFails(creator().doc('bets/abc123').update({ ...edit, createdByID: 'creator-9' }));
  });

  test('non-creators cannot edit', async () => {
    await assertFails(otherPhone().doc('bets/abc123').update({ ...edit, createdByID: 'creator-9' }));
    await assertFails(otherPhone().doc('bets/abc123').update({ question: 'Hijacked' }));
    await assertFails(anon().doc('bets/abc123').update({ question: 'Hijacked' }));
  });

  test('a settled bet cannot be edited', async () => {
    await assertFails(creator().doc('bets/settled').update({ question: 'Changed' }));
  });

  test('legacy bets without a creator uid cannot be edited', async () => {
    await assertFails(creator().doc('bets/legacy1').update({ bet: 'Changed' }));
  });
});

describe('calledOff (settle-only)', () => {
  const nextVotes = [...openBet.votes, { voterId: 'anon-2', name: 'Lee', optionId: 'b', at: 3 }];

  test('a bet cannot be created with calledOff', async () => {
    const fresh = { ...openBet, code: 'new1', votes: [] };
    await assertFails(creator().doc('bets/new1').set({ ...fresh, calledOff: true }));
    await assertFails(creator().doc('bets/new1').set({ ...fresh, calledOff: false }));
  });

  test('the creator cannot set calledOff with a plain edit', async () => {
    await assertFails(creator().doc('bets/abc123').update({ calledOff: true }));
    await assertFails(creator().doc('bets/abc123').update({ question: 'Changed', calledOff: false }));
  });

  test('the creator cannot change an existing calledOff with a plain edit', async () => {
    await assertFails(creator().doc('bets/calledoff').update({ calledOff: true }));
    await assertSucceeds(creator().doc('bets/calledoff').update({ question: 'Changed' }));
  });

  test('another phone user cannot set calledOff', async () => {
    await assertFails(otherPhone().doc('bets/abc123').update({ calledOff: true }));
    await assertFails(otherPhone().doc('bets/abc123').update({ ...settleFields, calledOff: true }));
  });

  test('a voter cannot set calledOff, with or without votes', async () => {
    await assertFails(anon('anon-2').doc('bets/abc123').update({ votes: nextVotes, calledOff: true }));
    await assertFails(anon('anon-2').doc('bets/abc123').update({ calledOff: true }));
    await assertFails(guest().doc('bets/abc123').update({ calledOff: true }));
  });

  test('the creator may include a bool calledOff in the settle write', async () => {
    await assertSucceeds(creator().doc('bets/abc123').update({ ...settleFields, calledOff: true }));
    await assertSucceeds(creator().doc('bets/calledoff').update({ ...settleFields, calledOff: true }));
  });

  test('the settle write still needs a winner, and calledOff must be a bool', async () => {
    await assertFails(creator().doc('bets/abc123').update({ status: 'closed', calledOff: true }));
    await assertFails(creator().doc('bets/abc123').update({ ...settleFields, winnerId: null, calledOff: true }));
    await assertFails(creator().doc('bets/abc123').update({ ...settleFields, calledOff: 'yes' }));
  });

  test('calledOff is immutable once settled', async () => {
    await assertFails(creator().doc('bets/settledoff').update({ calledOff: false }));
    await assertFails(creator().doc('bets/settled').update({ calledOff: true }));
    await assertFails(creator().doc('bets/settled').update({ ...settleFields, calledOff: true }));
    await assertFails(anon().doc('bets/settledoff').update({ calledOff: false }));
  });
});

// isOpen() refuses both called-off markers, so no vote lands on a called-off
// bet whichever form it takes.
describe('votes on called-off bets', () => {
  const nextVotes = [...openBet.votes, { voterId: 'anon-2', name: 'Lee', optionId: 'b', at: 3 }];

  beforeEach(async () => {
    await seed({
      'bets/off-status': { ...openBet, code: 'off-status', status: 'called-off' },
      'bets/off-both': { ...openBet, code: 'off-both', status: 'called-off', calledOff: true },
      'bets/off-flag-open': { ...openBet, code: 'off-flag-open', calledOff: true },
    });
  });

  test('denied: a vote on status called-off without the flag', async () => {
    await assertFails(anon('anon-2').doc('bets/off-status').update({ votes: nextVotes }));
  });

  test('denied: a vote on status called-off with calledOff: true', async () => {
    await assertFails(anon('anon-2').doc('bets/off-both').update({ votes: nextVotes }));
  });

  test('denied: a vote on an open-status bet with calledOff: true', async () => {
    await assertFails(anon('anon-2').doc('bets/off-flag-open').update({ votes: nextVotes }));
  });

  test('denied: a vote on a closed bet with calledOff: true', async () => {
    await assertFails(anon('anon-2').doc('bets/settledoff').update({ votes: nextVotes }));
  });

  test('denied: signed-out users still cannot vote on a called-off bet', async () => {
    await assertFails(guest().doc('bets/off-status').update({ votes: nextVotes }));
  });

  test('denied: the creator cannot edit a called-off bet', async () => {
    await assertFails(creator().doc('bets/off-flag-open').update({ question: 'Changed' }));
    await assertFails(creator().doc('bets/off-status').update({ question: 'Changed' }));
  });

  test('a calledOff: false flag is still an open bet', async () => {
    await assertSucceeds(anon('anon-2').doc('bets/calledoff').update({ votes: nextVotes }));
  });
});

describe('private result texts', () => {
  const numberPath = 'privateResultTexts/abc123/numbers/hash1';
  const number = { e164: '+15550001111', voterId: 'anon-1', optionId: 'a', createdAt: 1 };

  // Signed out, anonymous voter, another phone user, and the bet's creator.
  const contexts = () => [guest(), anon(), otherPhone(), creator()];

  beforeEach(async () => {
    await seed({ [numberPath]: number });
  });

  test('no client can read saved numbers', async () => {
    for (const db of contexts()) {
      await assertFails(db.doc(numberPath).get());
      await assertFails(db.collection('privateResultTexts/abc123/numbers').get());
    }
  });

  test('no client can write saved numbers', async () => {
    for (const db of contexts()) {
      await assertFails(db.doc('privateResultTexts/abc123/numbers/hash2').set(number));
      await assertFails(db.doc(numberPath).update({ e164: '+15559998888' }));
      await assertFails(db.doc(numberPath).delete());
      await assertFails(db.doc('privateResultTexts/abc123').delete());
    }
  });

  test('the creator still cannot touch saved numbers after deleting the bet', async () => {
    await assertSucceeds(creator().doc('bets/abc123').delete());
    await assertFails(creator().doc(numberPath).get());
    await assertFails(creator().doc(numberPath).delete());
  });
});

describe('pro entitlements', () => {
  const own = 'entitlements/creator-1';
  const pro = { plan: 'pro', source: 'mock', since: 1, expiresAt: 4102444800000 };

  beforeEach(async () => {
    await seed({ [own]: pro, 'entitlements/creator-9': { plan: 'founder', source: 'admin', since: 1, founderNumber: 7, expiresAt: null } });
  });

  test('a member reads their own entitlement, and a missing one reads as missing', async () => {
    await assertSucceeds(creator().doc(own).get());
    await assertSucceeds(anon('anon-5').doc('entitlements/anon-5').get());
  });

  test('another user cannot read it', async () => {
    await assertFails(otherPhone().doc(own).get());
    await assertFails(anon().doc(own).get());
  });

  test('a signed-out user cannot read it', async () => {
    await assertFails(guest().doc(own).get());
  });

  test('nobody can list entitlements, even signed in', async () => {
    await assertFails(creator().collection('entitlements').get());
    await assertFails(otherPhone().collection('entitlements').get());
    await assertFails(anon('anon-5').collection('entitlements').get());
    await assertFails(guest().collection('entitlements').get());
  });

  test('a query for only their own entitlement is still a list, and denied', async () => {
    await assertFails(creator().collection('entitlements').where('plan', '==', 'pro').get());
    await assertFails(creator().collection('entitlements').limit(1).get());
  });

  test('a member cannot grant themselves Pro or a founder spot', async () => {
    await testEnv.clearFirestore();
    await assertFails(creator().doc(own).set({ plan: 'pro', source: 'mock', since: 1, expiresAt: null }));
    await assertFails(creator().doc(own).set({ plan: 'founder', source: 'mock', since: 1, founderNumber: 1, expiresAt: null }));
    await assertFails(anon().doc('entitlements/anon-1').set({ plan: 'pro', source: 'admin', since: 1 }));
  });

  test('a member cannot change or remove their own entitlement', async () => {
    await assertFails(creator().doc(own).update({ expiresAt: null }));
    await assertFails(creator().doc(own).update({ expiresAt: 4102444800001 }));
    await assertFails(creator().doc(own).update({ plan: 'founder', founderNumber: 1 }));
    await assertFails(creator().doc(own).set({ ...pro, plan: 'founder' }));
    await assertFails(creator().doc(own).delete());
  });

  test('other users cannot write anyone else’s entitlement', async () => {
    for (const db of [otherPhone(), anon(), guest()]) {
      await assertFails(db.doc(own).set(pro));
      await assertFails(db.doc(own).update({ expiresAt: null }));
      await assertFails(db.doc(own).delete());
      await assertFails(db.doc('entitlements/someone-new').set(pro));
    }
  });
});

describe('founder counter', () => {
  const founders = 'meta/founders';

  beforeEach(async () => {
    await seed({ [founders]: { count: 42 }, 'meta/other': { secret: true } });
  });

  test('anyone can read the founder count, signed in or not', async () => {
    for (const db of [guest(), anon(), creator()]) {
      await assertSucceeds(db.doc(founders).get());
    }
  });

  test('no client can change, create or delete it', async () => {
    for (const db of [guest(), anon(), creator(), otherPhone()]) {
      await assertFails(db.doc(founders).update({ count: 0 }));
      await assertFails(db.doc(founders).set({ count: 600 }));
      await assertFails(db.doc(founders).delete());
    }
    await testEnv.clearFirestore();
    await assertFails(creator().doc(founders).set({ count: 0 }));
  });

  test('the rest of meta stays closed', async () => {
    await assertFails(guest().collection('meta').get());
    await assertFails(creator().doc('meta/other').get());
    await assertFails(creator().doc('meta/other').set({ secret: false }));
  });
});
