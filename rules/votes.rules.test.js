/**
 * Per-voter vote docs (bets/{code}/votes/{uid}) and the phase-1 rule for the
 * legacy `votes` array (docs/VOTE-SECURITY.md). Run with `npm run test:rules`.
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

async function read(docPath) {
  let data;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(docPath).get();
    data = snap.exists ? snap.data() : null;
  });
  return data;
}

// What castVote writes to the voter's own doc.
const pick = (uid, optionId = 'a', name = 'Lee') => ({
  voterId: uid, name, optionId, at: FieldValue.serverTimestamp(),
});
// A vote doc already saved (seeded), with a fixed time.
const saved = (uid, optionId = 'a', name = 'Lee') => ({
  voterId: uid, name, optionId, at: Timestamp.fromMillis(1000),
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
    'bets/abc123': openBet,
    'bets/abc123/votes/anon-2': saved('anon-2', 'b', 'Lee'),
    'bets/settled': { ...openBet, code: 'settled', ...settleFields },
    'bets/settled/votes/anon-2': saved('anon-2', 'b'),
    'bets/off': { ...openBet, code: 'off', status: 'closed', calledOff: true, settledAt: 2 },
    'bets/off/votes/anon-2': saved('anon-2', 'b'),
    'bets/offstatus': { ...openBet, code: 'offstatus', status: 'called-off' },
    'bets/closed': { ...openBet, code: 'closed', status: 'closed' },
    'bets/ml': { betID: 'ml-1', type: 'Money Line', bet: 'Who wins', createdByID: 'creator-1' },
    'bets/ou': { betID: 'ou-1', type: 'Over Under', bet: 'Points', createdByID: 'creator-1' },
    'bets/prop': { betID: 'pr-1', type: 'Prop', bet: 'Who scores', createdByID: 'creator-1' },
    'PropBets/pr-1': { bet: 'Who scores', options: ['Ann', 'Ben', 'Cal'] },
    'bets/four': {
      ...openBet,
      code: 'four',
      options: ['p0', 'p1', 'p2', 'p3'].map((id) => ({ id, label: id })),
      votes: [],
    },
  });
});

describe('vote docs: the owner', () => {
  test('casts a pick on an open bet', async () => {
    await assertSucceeds(anon('anon-3').doc('bets/abc123/votes/anon-3').set(pick('anon-3')));
    expect(await read('bets/abc123/votes/anon-3')).toMatchObject({ voterId: 'anon-3', optionId: 'a', name: 'Lee' });
  });

  test('changes sides with a fresh server time', async () => {
    await assertSucceeds(anon('anon-2').doc('bets/abc123/votes/anon-2').set(pick('anon-2', 'a')));
  });

  test('renames their own pick, keeping side and time', async () => {
    await assertSucceeds(anon('anon-2').doc('bets/abc123/votes/anon-2').update({ name: 'Leo' }));
    expect(await read('bets/abc123/votes/anon-2')).toMatchObject({ name: 'Leo', optionId: 'b' });
    await assertSucceeds(anon('anon-2').doc('bets/abc123/votes/anon-2').update({ name: '' }));
  });

  test('cannot change sides while keeping the old time', async () => {
    await assertFails(anon('anon-2').doc('bets/abc123/votes/anon-2').update({ optionId: 'a' }));
  });

  test('cannot backdate or postdate a pick', async () => {
    await assertFails(anon('anon-3').doc('bets/abc123/votes/anon-3').set({ ...pick('anon-3'), at: Timestamp.fromMillis(5) }));
    await assertFails(anon('anon-2').doc('bets/abc123/votes/anon-2').update({ at: Timestamp.fromMillis(5) }));
  });

  test('may vote on the four-option bets the app makes', async () => {
    for (const id of ['p0', 'p1', 'p2', 'p3']) {
      await assertSucceeds(anon('anon-3').doc('bets/four/votes/anon-3').set(pick('anon-3', id)));
    }
    await assertFails(anon('anon-3').doc('bets/four/votes/anon-3').set(pick('anon-3', 'p4')));
  });

  test('cannot delete their own pick', async () => {
    await assertFails(anon('anon-2').doc('bets/abc123/votes/anon-2').delete());
  });
});

describe('vote docs: someone else', () => {
  test('another voter cannot create a pick under someone else\'s uid', async () => {
    await assertFails(anon('anon-1').doc('bets/abc123/votes/anon-3').set(pick('anon-3')));
    await assertFails(anon('anon-1').doc('bets/abc123/votes/anon-3').set(pick('anon-1')));
  });

  test('another voter cannot change someone\'s side or name', async () => {
    const db = anon('anon-1');
    await assertFails(db.doc('bets/abc123/votes/anon-2').set(pick('anon-2', 'a', 'Lee')));
    await assertFails(db.doc('bets/abc123/votes/anon-2').update({ name: 'Loser' }));
    await assertFails(db.doc('bets/abc123/votes/anon-2').update({ optionId: 'a', at: FieldValue.serverTimestamp() }));
    await assertFails(db.doc('bets/abc123/votes/anon-2').delete());
    expect(await read('bets/abc123/votes/anon-2')).toMatchObject({ name: 'Lee', optionId: 'b' });
  });

  test('the creator and other phone users cannot change or delete a pick on a live bet', async () => {
    await assertFails(creator().doc('bets/abc123/votes/anon-2').update({ name: 'X' }));
    await assertFails(creator().doc('bets/abc123/votes/anon-2').delete());
    await assertFails(otherPhone().doc('bets/abc123/votes/anon-2').update({ name: 'X' }));
    await assertFails(otherPhone().doc('bets/abc123/votes/anon-2').delete());
  });

  test('signed out cannot vote', async () => {
    await assertFails(guest().doc('bets/abc123/votes/anon-3').set(pick('anon-3')));
  });
});

describe('vote docs: closed bets', () => {
  test.each(['settled', 'off', 'offstatus', 'closed'])('no new pick, side change or rename on %s', async (code) => {
    await assertFails(anon('anon-3').doc(`bets/${code}/votes/anon-3`).set(pick('anon-3')));
    await assertFails(anon('anon-2').doc(`bets/${code}/votes/anon-2`).set(pick('anon-2', 'a')));
    await assertFails(anon('anon-2').doc(`bets/${code}/votes/anon-2`).update({ name: 'Leo' }));
  });

  test('no pick on a bet that does not exist', async () => {
    await assertFails(anon('anon-3').doc('bets/missing/votes/anon-3').set(pick('anon-3')));
  });
});

describe('vote docs: fields', () => {
  const db = () => anon('anon-3');
  const ref = () => db().doc('bets/abc123/votes/anon-3');

  test('the side must be one of the bet\'s options', async () => {
    await assertFails(ref().set(pick('anon-3', 'c')));
    await assertFails(ref().set(pick('anon-3', '')));
    await assertFails(ref().set({ ...pick('anon-3'), optionId: 1 }));
  });

  test('no extra or missing keys', async () => {
    await assertFails(ref().set({ ...pick('anon-3'), won: true }));
    await assertFails(ref().set({ ...pick('anon-3'), phone: '+15551234567' }));
    const { name: _name, ...noName } = pick('anon-3');
    await assertFails(ref().set(noName));
    const { at: _at, ...noTime } = pick('anon-3');
    await assertFails(ref().set(noTime));
  });

  test('voterId must be the caller', async () => {
    await assertFails(ref().set({ ...pick('anon-3'), voterId: 'anon-1' }));
  });

  test('names are strings of at most 30 characters', async () => {
    await assertSucceeds(ref().set(pick('anon-3', 'a', 'x'.repeat(30))));
    await assertFails(ref().set(pick('anon-3', 'a', 'x'.repeat(31))));
    await assertFails(ref().set(pick('anon-3', 'a', 7)));
    await assertFails(anon('anon-2').doc('bets/abc123/votes/anon-2').update({ name: 'y'.repeat(31) }));
  });

  // size() counts UTF-16 units, as cleanName and maxLength do: an emoji is 2.
  test('a name of 15 emoji fits, 16 do not', async () => {
    await assertSucceeds(ref().set(pick('anon-3', 'a', '🎉'.repeat(15))));
    await assertFails(ref().set(pick('anon-3', 'a', '🎉'.repeat(16))));
  });

  test('legacy bets take their fixed sides', async () => {
    await assertSucceeds(anon('anon-3').doc('bets/ml/votes/anon-3').set(pick('anon-3', 'b')));
    await assertFails(anon('anon-3').doc('bets/ml/votes/anon-3').set(pick('anon-3', 'over')));
    await assertSucceeds(anon('anon-3').doc('bets/ou/votes/anon-3').set(pick('anon-3', 'under')));
    await assertFails(anon('anon-3').doc('bets/ou/votes/anon-3').set(pick('anon-3', 'a')));
    await assertSucceeds(anon('anon-3').doc('bets/prop/votes/anon-3').set(pick('anon-3', 'p2')));
    await assertFails(anon('anon-3').doc('bets/prop/votes/anon-3').set(pick('anon-3', 'p3')));
  });
});

describe('vote docs: reads', () => {
  test('anyone with the link reads one bet\'s picks, like the bet', async () => {
    await assertSucceeds(guest().doc('bets/abc123/votes/anon-2').get());
    await assertSucceeds(guest().collection('bets/abc123/votes').get());
    await assertSucceeds(anon('anon-9').collection('bets/settled/votes').get());
    await assertSucceeds(creator().collection('bets/abc123/votes').get());
  });

  test('no collection group query across every bet\'s picks', async () => {
    await assertFails(guest().collectionGroup('votes').get());
    await assertFails(anon('anon-2').collectionGroup('votes').where('voterId', '==', 'anon-2').get());
    await assertFails(creator().collectionGroup('votes').get());
  });
});

describe('vote docs: deleting the bet', () => {
  test('the creator deletes the picks in the same batch as the bet', async () => {
    const db = creator();
    const batch = db.batch();
    batch.delete(db.doc('bets/abc123/votes/anon-2'));
    batch.delete(db.doc('bets/abc123'));
    await assertSucceeds(batch.commit());
    expect(await read('bets/abc123/votes/anon-2')).toBeNull();
  });

  test('another phone user or a voter cannot, even in a batch with the bet', async () => {
    for (const db of [otherPhone(), anon('anon-2')]) {
      const batch = db.batch();
      batch.delete(db.doc('bets/abc123/votes/anon-2'));
      batch.delete(db.doc('bets/abc123'));
      await assertFails(batch.commit());
    }
  });
});

describe('legacy votes array (phase 1)', () => {
  const lee = { voterId: 'anon-2', name: 'Lee', optionId: 'b', at: 3 };

  test('an older build appends its own first pick', async () => {
    await assertSucceeds(anon('anon-2').doc('bets/abc123').update({ votes: [...openBet.votes, lee] }));
    await assertSucceeds(anon('anon-2').doc('bets/ml').update({ votes: [lee] }));
  });

  test('nobody can append a pick in someone else\'s name', async () => {
    await assertFails(anon('anon-3').doc('bets/abc123').update({ votes: [...openBet.votes, lee] }));
  });

  test('B cannot rewrite A\'s side or name, or drop A', async () => {
    const db = anon('anon-2');
    await assertFails(db.doc('bets/abc123').update({ votes: [{ ...openBet.votes[0], optionId: 'b' }] }));
    await assertFails(db.doc('bets/abc123').update({ votes: [{ ...openBet.votes[0], name: 'Loser' }] }));
    await assertFails(db.doc('bets/abc123').update({ votes: [{ ...openBet.votes[0], name: 'Loser' }, lee] }));
    await assertFails(db.doc('bets/abc123').update({ votes: [lee] }));
    await assertFails(db.doc('bets/abc123').update({ votes: [] }));
    expect((await read('bets/abc123')).votes).toEqual(openBet.votes);
  });

  test('A cannot rewrite their own entry in place either (older-build rename or switch)', async () => {
    const db = anon('anon-1');
    await assertFails(db.doc('bets/abc123').update({ votes: [{ ...openBet.votes[0], name: 'Sammy' }] }));
    await assertFails(db.doc('bets/abc123').update({ votes: [{ ...openBet.votes[0], optionId: 'b', at: 9 }] }));
  });

  test('the appended entry is validated like a vote doc', async () => {
    const db = anon('anon-2');
    const add = (entry) => db.doc('bets/abc123').update({ votes: [...openBet.votes, entry] });
    await assertFails(add({ ...lee, optionId: 'c' }));
    await assertFails(add({ ...lee, name: 'x'.repeat(31) }));
    await assertFails(add({ ...lee, extra: true }));
    await assertFails(add({ ...lee, at: 'now' }));
    await assertFails(db.doc('bets/abc123').update({ votes: [...openBet.votes, lee, { ...lee, at: 4 }] }));
  });

  test('no appends on closed or called-off bets', async () => {
    for (const code of ['settled', 'off', 'offstatus', 'closed']) {
      await assertFails(anon('anon-2').doc(`bets/${code}`).update({ votes: [...openBet.votes, lee] }));
    }
  });

  test('a bet cannot be created with votes already in it', async () => {
    const fresh = { ...openBet, code: 'new1' };
    await assertFails(creator().doc('bets/new1').set(fresh));
    await assertSucceeds(creator().doc('bets/new1').set({ ...fresh, votes: [] }));
    const { votes: _votes, ...noVotes } = fresh;
    await assertSucceeds(creator().doc('bets/new2').set({ ...noVotes, code: 'new2' }));
  });
});

describe('settling still works with vote docs', () => {
  test('the creator settles, and votes close with it', async () => {
    await assertSucceeds(creator().doc('bets/abc123').update({ ...settleFields, settledAt: FieldValue.serverTimestamp() }));
    await assertFails(anon('anon-2').doc('bets/abc123/votes/anon-2').update({ name: 'Late' }));
  });
});
