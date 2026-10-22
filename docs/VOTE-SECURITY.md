# Vote security: one doc per voter

> **DO NOT DEPLOY the firestore.rules on this branch.** The per-voter vote rules
> and the append-only legacy `votes` rule are tested against the emulator only
> (`npm run test:rules`). They are phase 1 of a two-phase change with a required
> deploy order (below). Never run `firebase deploy` with them until the checklist
> at the end of this doc is done.

## The problem

Picks lived only in an array, `votes`, on `bets/{code}`. The live rule for a vote
was, roughly:

```
allow update: if request.auth != null && isOpen(resource.data)
  && changedKeys().hasOnly(['votes']);
```

Any signed-in user (voters use anonymous auth, so anyone with the link) could
rewrite the whole array on an open bet: change anyone's side or name, drop picks,
or add picks under other uids. The same rule is on `main` and `epic/ads-pro`.

## Data model

Each voter's pick is its own doc, `bets/{code}/votes/{uid}`, where the doc id is
the voter's auth uid:

| Field | Type | Written by |
| --- | --- | --- |
| `voterId` | string, == the doc id == `request.auth.uid` | `castVote` |
| `name` | string, trimmed, 0..30 UTF-16 units (`NAME_MAX`) | `castVote`, `renameVote` |
| `optionId` | string, one of the bet's sides | `castVote` |
| `at` | timestamp, `request.time` of the last side pick | `castVote` |

These are the fields the old array entries held (`{ voterId, name, optionId, at }`),
so every reader keeps the same vote shape. `at` replaces the array's order: the list
is ordered by `at`, and switching sides stamps a new `at`, so the voter moves to the
end exactly as the array's remove-and-push did. A rename keeps `at`, so the voter
keeps their place. No `createdAt`/`updatedAt` pair: nothing reads them.

The legacy `votes` array stays on the bet doc for old picks and older builds.

### One merged list

`mergeVotes(legacy, docs)` (`src/phone/votes.js`) is the one merge:

- a voter's doc wins over their array entry;
- a voter listed twice in the array counts once, at their last entry;
- ordered by `at` (array `at` is ms, doc `at` is a Timestamp); entries with no time
  (very old picks) keep their place ahead of timed ones; entries with no voterId are kept.

`withVotes(bet, docs)` puts that list on `bet.votes`, and every place that reads a
bet applies it, so screens and routes keep reading `bet.votes`:

| Reader | Where the merge happens |
| --- | --- |
| Tally, vote screen, results, winner card, share/result texts, settle preview, Results menu | `subscribeBet` (bet doc listener + `bets/{code}/votes` listener), used by `useLiveBet` and `ResultsMenu` |
| My bets list, Friends (head to head) | `subscribeMyBets`: one votes listener per bet in the list |
| `settleBet` (settlement snapshot), `undoSettle`, `callOffBet` (returned bet) | `readVoteDocs(code)` inside the transaction callback |
| `saveVoterNumber` (result-text save route) | `readBetWithVotes(db, code, tx)` (`src/server/betVotes.js`), in its transaction |
| `deliverResultTexts` (result-text send route) | `readBetWithVotes` |
| Delete route (`deleteBet` server) | deletes `bets/{code}/votes/*` in the same transaction |

`buildSettlement`, `tallyCounts`, `votersByOption`, `friendStats`, `voteFor`,
`settlementOf`, `buildReveal`, `voterWon` and the rest read the merged `bet.votes`
they are handed.

The subscriptions wait for both the bet doc and the votes listener before the first
callback, so the tally never shows the array alone and then jumps. A refused or
failed votes listen counts as "no vote docs" (rules from before this change deny
the subcollection).

**My bets cost.** A collection group query over `votes` would need a creator field
on every vote doc and a collection group rule; instead `subscribeMyBets` opens one
listener per listed bet. That is one extra listener (and one read per vote doc) per
bet. Fine at friendly-bet scale; if lists grow to hundreds, denormalize
`createdByID` onto vote docs and switch to a constrained collection group query.

## Client writes

- `castVote`: in a transaction, checks the bet (exists, voting open, a real side),
  then `set`s `bets/{code}/votes/{uid}` with `{ voterId, name, optionId, at: serverTimestamp() }`.
- `renameVote`: in a transaction, if the voter's doc exists, `update({ name })` only.
  If their pick is still only in the array, it creates their doc with the same side
  and the new name (a new `at`, so they move to the end of the names once).
- **Deploy-order fallback:** if either write is refused with `permission-denied`
  (live rules from before this change deny the subcollection), it is redone the old
  way, in the bet's `votes` array (`castLegacyVote`, `renameLegacyVote`). Any other
  error is thrown as before. Under the phase-1 rules the fallback only succeeds for a
  first pick (append); a refusal on both paths surfaces the refusal.
- **Remembered for the session:** a denied vote-doc read (listener, list or the
  rename's read of the voter's doc), or a denied vote-doc write whose array fallback
  then succeeds, sets `voteDocsDenied` in `api.js` for every bet. From then on no vote
  listener opens, reads answer no docs, and picks and renames go straight to the array,
  so the live rules log no more 403s. Neither signal can happen under the phase-1 rules
  (vote docs are readable by anyone, and they refuse the array write for anything they
  refuse as a doc), so behaviour there is unchanged. A session open across the rules
  deploy keeps using the array until a reload.
- `deleteBet` client fallback (no Admin credentials): deletes the vote docs and the
  bet in one transaction, listing the vote docs inside it. The rules only let the
  creator delete vote docs in a write that also deletes the bet.

## Rules

### Phase 1 (in `firestore.rules` on this branch, NOT DEPLOYED)

`match /bets/{code}/votes/{uid}`:

- `get, list: if true`, like the bet itself (`get: if true`). Only a query of one
  bet's votes; nothing allows a collection group query.
- `create`: `request.auth.uid == uid`, the bet is open (`isOpen`: not closed, not
  called off), `validVoteDoc` (keys exactly `voterId, name, optionId, at`;
  `voterId == uid`; `name` a string of size <= 30; `optionId` one of the bet's sides;
  `at` a timestamp), and `at == request.time`.
- `update`: same checks, and either `at == request.time` (a side pick) or `at` and
  `optionId` unchanged (a rename). A side change can't keep an old time.
- `delete`: only the bet's creator, and only when the same write deletes the bet
  (`!existsAfter(bet)`). Voters never delete a pick (the app has no un-vote).

Side validation (`isBetOption`) works like `hydrateBet`: a `schemaVersion: 2` bet
checks its `options` list (index by index up to 8; the app makes at most 4); a
CRA-era bet with `betID` and `type` uses `a`/`b` (Money Line), `over`/`under` (Over
Under) or `p0`.. up to the size of the `PropBets` doc's options (one extra `get()`).

Legacy `votes` array on `bets/{code}` (older builds):

```
allow update: if request.auth != null && isOpen(resource.data)
  && changedKeys().hasOnly(['votes'])
  && appendsOwnVote(resource.data);
```

`appendsOwnVote`: the new list is the old list plus exactly one entry at the end,
every old entry unchanged (`after[0:before.size()] == before`), and the new entry is
the caller's own (`voterId == request.auth.uid`, keys within `voterId, name,
optionId, at`, a valid side, a name of size <= 30, a number `at`).

Why append-only and not "append or modify your own entry": rules have no loops, so
"some index i holds my entry and everything else is unchanged" can only be written
by spelling out every index up to a fixed bound (a cap on the list, and hundreds of
expressions). Append-only is exact, small, and lets nobody touch anyone else's
entry. What it costs: an older build can still make a first pick, but its side
switch (remove-and-push) and rename (edit in place) are refused, shown with the
existing "Saving was blocked. Try again in a moment." line. Current builds never
need the array once phase 1 is live. A voter could append themselves twice; every
reader dedupes by voterId (last entry wins), and a voter could always add picks
under fresh anonymous uids anyway, so this adds nothing.

Also in phase 1: `createBet` must create a bet with no `votes` or an empty list, so
a creator can't seed picks in other people's names. The app always writes `votes: []`.

Settle, call-off, undo and creator edits are unchanged; the settlement snapshot is
still computed client-side by the creator, now from the merged votes.

### Phase 2 (docs only; deploy after phase 1 is settled)

Delete the legacy `castVote` update rule above, so no client may write `votes` at
all (`saveBet` already excludes it; create still requires it empty). Then run the
backfill with `--write` (and optionally `--clear-array`). Old builds lose even their
first-pick fallback, so phase 2 waits until they are gone (store minimum version).

## Deploy order

The app ships first, then the phase-1 rules. Both orders are safe for live voting:

**App first (recommended).** Web (Vercel) and the store builds ship with this change
while the old rules are still live. Every vote-doc read is refused, so it counts as no
docs; every vote-doc write is refused, so `castVote` and `renameVote` fall back to the
array exactly as today. Voting works as it does now, and the hole stays open until
the rules ship. Then deploy the phase-1 rules: current builds write their own doc;
older builds can make first picks only.

**Rules first.** Old builds everywhere: first picks append and work; switching sides
and renaming are refused until the new app ships. Nothing is split yet (no one writes
docs). Once the new app ships, it is the state above. Use this order only if the hole
has to close before the app can ship.

**Older builds once docs exist (either order).** An older build reads only the array.
After current builds start writing docs, an older build's tally misses those picks,
and an older-build creator who settles writes a settlement snapshot without them
(the result texts still read the merged votes for anyone the snapshot leaves out, but
the reveal shows the snapshot). Keep this window short: ship the web app first (it
updates on deploy), and deploy phase 1 once most store installs have the new build,
or set a minimum version.

## Migration

1. **Compatibility read path** (this PR): `mergeVotes` everywhere, so old picks in
   the array and new picks in docs read as one list. No data needs to move for the
   app to work.
2. **Backfill** (`scripts/backfill-votes.mjs`, Admin SDK, never run yet). Dry run by
   default; `--write` creates a doc for each array voter who has none (`create()`,
   so it never overwrites; a doc always wins), one transaction per bet; `--code` limits
   it to one bet. Names are capped at 30 like the app; `at` keeps the array's ms
   (an entry with no time gets the bet's `createdAt` plus its index, keeping order).
   Entries with no voterId can't become docs and are reported. Logs codes and
   counts only. Run after phase 1 is live: `node scripts/backfill-votes.mjs` (dry
   run), check the totals, then `--write`.
3. **Clear the arrays** (phase 2 only, optional): `--write --clear-array` also sets
   `votes: []` on bets where every entry now has a doc. Never before phase 2, or an
   older build could append again (harmless: the merge still reads it).

## Rollback

- **Rules:** do not roll back to the old rules wholesale once docs exist: the old
  rules deny reading `bets/{code}/votes`, so every pick made in a doc would vanish
  from every tally. Instead restore only the old array rule (any signed-in user may
  update `votes` on an open bet) and keep the `match /votes/{uid}` block. Current
  builds keep writing docs; older builds get their side switch and rename back.
- **App:** rolling the app back after phase 1 brings back builds that can't see vote
  docs and can only append. Prefer rolling forward. If a rollback is needed, first
  restore the old array rule as above, and expect picks made in docs to be missing
  from the rolled-back app until it is fixed forward.
- **Backfill:** `--write` only adds docs that mirror array entries, and the merge
  makes them read the same, so there is nothing to undo. Deleting the created docs
  (Admin) puts things back. `--clear-array` is the one step that removes data; it
  runs only in phase 2, after the docs exist.

## Name cap

`NAME_MAX = 30` (`src/phone/votes.js`), in UTF-16 units, which is what the rules'
`size()` and the inputs' `maxLength` count (an emoji is 2). `cleanName` trims, cuts
to 30 without splitting an emoji, and trims again: `castVote`, `renameVote`, the
vote screen's name input and the name edit form all use it, so an over-long name is
cut, never refused (no new copy). Both inputs have `maxLength={30}`. The rules
refuse a longer name on a vote doc and on a legacy array entry.

## Known gaps

- `settleBet` reads the vote docs in its transaction callback, but a new vote doc
  doesn't conflict with the transaction (it doesn't touch the bet doc). A pick that
  lands in the milliseconds between that read and the settle commit is not in the
  settlement snapshot. Before this change the same pick was in the array, which the
  transaction did protect.
- The rules don't check `closesAt` (same as before); the app stops picks after it.
- The settlement snapshot is still whatever the creator's client computes (same as before).

## Checklist before deploying phase 1

- [ ] App with this change live on web, and in the stores long enough (or a minimum version set).
- [ ] Merge `firestore.rules` line by line with the rules live in the console (docs/DEVELOPMENT.md).
- [ ] `npm run test:rules` green.
- [ ] Deploy the rules; vote, switch sides and rename on a test bet from a current build; first pick from an older build.
- [ ] Backfill dry run, check totals, then `--write`.
- [ ] Later, phase 2: remove the legacy array rule, then optionally `--clear-array`.
