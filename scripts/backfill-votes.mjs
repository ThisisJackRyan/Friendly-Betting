#!/usr/bin/env node
// One-off backfill: copies each voter's pick from the legacy `votes` array on
// bets/{code} into their own doc at bets/{code}/votes/{uid}
// (docs/VOTE-SECURITY.md, "Migration"). Admin SDK, so it bypasses the rules.
//
// DRY RUN BY DEFAULT: it reads and reports, and writes nothing unless --write
// is given. Idempotent: a voter who already has a doc is skipped (the doc
// wins), and docs are made with create(), which never overwrites. Each bet is
// one transaction.
//
//   node scripts/backfill-votes.mjs                    # dry run, every bet
//   node scripts/backfill-votes.mjs --code abc123      # dry run, one bet
//   node scripts/backfill-votes.mjs --write            # make the vote docs
//   node scripts/backfill-votes.mjs --write --clear-array
//       # phase 2 only (client writes to `votes` already refused): also empty
//       # the array on bets where every entry now has a doc
//
// Credentials: FIREBASE_SERVICE_ACCOUNT (JSON or base64, as the server uses)
// or GOOGLE_APPLICATION_CREDENTIALS. FIRESTORE_EMULATOR_HOST points it at the
// emulator. Logs bet codes and counts only, never names or numbers.
import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { FieldPath, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { planBackfill } = require('./backfill-votes-plan.cjs');

const PAGE = 300;

function args(argv) {
  const out = { write: false, clearArray: false, code: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--write') out.write = true;
    else if (argv[i] === '--clear-array') out.clearArray = true;
    else if (argv[i] === '--code') out.code = argv[(i += 1)];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (out.clearArray && !out.write) throw new Error('--clear-array needs --write.');
  return out;
}

function credential() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return applicationDefault();
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return cert(JSON.parse(json));
}

function app() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-friendly-betting' }, 'backfill-votes');
  }
  return initializeApp({ credential: credential() }, 'backfill-votes');
}

async function backfillBet(db, code, { write, clearArray }) {
  const betRef = db.doc(`bets/${code}`);
  const votesRef = db.collection(`bets/${code}/votes`);
  const run = async (tx) => {
    const snap = tx ? await tx.get(betRef) : await betRef.get();
    if (!snap.exists) return null;
    const listed = tx ? await tx.get(votesRef) : await votesRef.get();
    const plan = planBackfill(snap.data(), new Set(listed.docs.map((item) => item.id)), { clearArray });
    if (tx) {
      plan.creates.forEach(({ id, voterId, name, optionId, atMs }) => {
        tx.create(votesRef.doc(id), { voterId, name, optionId, at: Timestamp.fromMillis(atMs) });
      });
      if (plan.clear) tx.update(betRef, { votes: [] });
    }
    return plan;
  };
  return write ? db.runTransaction(run) : run(null);
}

async function* betCodes(db, code) {
  if (code) {
    yield code;
    return;
  }
  let after = null;
  for (;;) {
    let page = db.collection('bets').orderBy(FieldPath.documentId()).select().limit(PAGE);
    if (after) page = page.startAfter(after);
    const snap = await page.get();
    for (const item of snap.docs) yield item.id;
    if (snap.size < PAGE) return;
    after = snap.docs[snap.docs.length - 1].id;
  }
}

async function main() {
  const options = args(process.argv.slice(2));
  const db = getFirestore(app());
  const totals = { bets: 0, touched: 0, created: 0, cleared: 0, noVoterId: 0, badOptionId: 0, hasDoc: 0, duplicate: 0, failed: 0 };
  console.log(options.write ? 'WRITING vote docs.' : 'Dry run: nothing is written. Pass --write to write.');
  for await (const code of betCodes(db, options.code)) {
    totals.bets += 1;
    try {
      const plan = await backfillBet(db, code, options);
      if (!plan) continue;
      Object.keys(plan.skipped).forEach((key) => { totals[key] += plan.skipped[key]; });
      totals.created += plan.creates.length;
      if (plan.clear) totals.cleared += 1;
      if (plan.creates.length || plan.clear) {
        totals.touched += 1;
        console.log(`${code}: ${plan.creates.length} vote doc(s)${plan.clear ? ', array cleared' : ''}`);
      }
    } catch (err) {
      totals.failed += 1;
      console.warn(`${code}: failed (${err?.code || err?.message || 'error'})`);
    }
  }
  console.log(JSON.stringify(totals));
  if (totals.failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exitCode = 1;
});
