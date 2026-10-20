# Undo a settle, and Call off (F8)

> **DO NOT DEPLOY the firestore.rules on this branch.** The undo, call-off and
> called-off vote rules are tested against the emulator only
> (`npm run test:rules`). Never run `firebase deploy` with them. Before they go
> live, someone has to do the checklist at the end of this doc.

## What the creator sees

- **Undo.** For 30s after Close & settle saves, the creator's tally shows `Undo`
  and a seconds countdown (`30s` ... `1s`) under the reveal. A tap reopens the bet: no
  winner, no settlement, Close & settle and Call off are back, and friends can pick
  again. Then it is gone. Only on the tally (`/t/`), only for the creator, only for a
  settle with a winner.
- **Call off.** An open bet shows a quiet `Call off` under Close & settle (creator only,
  hidden while the settle picker is open). It asks first (`Call off this bet?`,
  `Nobody wins this one.`, `Call off bet` / `Keep it`), then shows the existing called-off
  reveal. A call-off has no undo: the confirm is its safety step.

## Data

| Write | Fields |
| --- | --- |
| settle (`settleBet`) | `status: 'closed'`, `winnerId`, `settlement`, `settledAt: serverTimestamp()` |
| call off (`callOffBet`) | `status: 'closed'`, `calledOff: true`, `settledAt: serverTimestamp()` (no winner, no settlement) |
| undo (`undoSettle`) | `status: 'open'`, `winnerId: null`, delete `settledAt`, `settlement`, `calledOff` |

`settledAt` is now a Firestore Timestamp from the server. Older settles hold a number
(`Date.now()`). Readers go through `settledAtMs()` (`src/phone/undoSettle.js`), so both
work; `notificationFor` (the Results menu) is the only one that reads it. A number
settledAt can never be undone.

Until the server time comes back in the snapshot, `settledAt` reads `null`; the
countdown then runs from the moment this screen's settle saved.

## The window

- Screen: 30s (`UNDO_WINDOW_MS`), measured from the server `settledAt` and clamped so the
  client clock never shows more than 30s (and never more than 30s from this screen's own
  settle).
- Rules: `request.time < settledAt + 35s` (`UNDO_RULES_WINDOW_MS`). The extra 5s lets a
  tap near the end land. `undoSettle` refuses past 35s client-side too ("Too late to
  undo.").
- The rules can trust `settledAt` because the settle and call-off writes must set it to
  `request.time`. A made-up timestamp is denied, so nobody can stretch the window.

## Ads

Unchanged: the settle saves, then maybe the interstitial and the thank-you, then the
reveal. Undo appears with the reveal, so time spent on an ad comes out of the 30s. An ad
already shown stays counted; undoing and settling again goes through the usual caps.
Undo and Call off never show an ad.

## Result texts

Before F8 the texts went out the moment a bet settled, so an undo could have followed a
wrong result. Now `deliverResultTexts` (`src/server/resultTexts.js`) waits until the
rules' 35s window has passed (the send route allows up to 60s), re-reads the bet and
then texts:

- undone meanwhile: the bet is open, nobody is texted, the numbers stay;
- undone and settled again: this call stands down and the new settle's own call sends;
- call-off, or an older number settledAt: no wait, sent right away.

The app still calls the send route right after the settle, as before, so nothing waits on
the creator keeping the screen open. Voters can't save a number during the window
(the bet is finished); after an undo they can again.

## Rules (firestore.rules)

- `isCalledOff(bet)`: `calledOff == true` or `status == 'called-off'`.
- `isOpen(bet)` now also refuses called-off bets, so votes (and creator edits) are denied
  on both forms.
- Settle: also denied on a called-off bet; `settledAt` must be `request.time`, a number
  (older builds), or absent.
- Call off: creator only, bet open, only result fields, `status 'closed'`,
  `calledOff == true`, no winner, no settlement, `settledAt == request.time`.
- Undo: creator only, settled and not called off, `settledAt` is a timestamp under 35s
  old, only result fields, and the bet is left open (`status 'open'`, no winner, no
  `settledAt`, `settlement` or `calledOff`).

Tests: `rules/undoCallOff.rules.test.js` and the called-off vote block in
`rules/firestore.rules.test.js`.

## Before anyone deploys these rules

1. Review `firestore.rules` against the live console rules (see its header).
2. Deploy the app (web and native builds that write `serverTimestamp()`) before or with
   the rules. Older builds keep working: they write a number settledAt, which the rules
   still accept for a settle (it just can't be undone).
3. Deploy the send route with `maxDuration = 60` before texts are turned on.
