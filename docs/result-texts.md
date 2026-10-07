# Result texts ("text me who won")

Optional field on the vote page. After a voter's pick is recorded, they can leave a
number to get one SMS when the bet is settled. Off by default.

## Storage

`privateResultTexts/{code}/numbers/{sha256(e164)}` with `{ e164, voterId, optionId, createdAt }`.

- Written and read only by the Admin SDK in `app/api/bets/[code]/result-texts/*`.
- The public `bets/{code}` doc is never written by this feature, so numbers never reach
  the tally, share card, OG image or any client read.
- The doc id is a hash, so saving the same number twice keeps one doc.
- US (+1) numbers only. One number per voter per bet (a new number replaces theirs), and at
  most 50 numbers per bet (409 `too-many`).
- The side is read from the voter's recorded vote on the server, never from the request.
- At settle, each doc is claimed by deleting it in a transaction, then texted. A number is
  texted at most once and deleted before the text goes out.

## Firestore rules

`firestore.rules` in the repo includes this deny rule (the Admin SDK bypasses rules):

```
match /privateResultTexts/{code}/{document=**} {
  allow read, write: if false;
}
```

That file is not auto-deployed. Prod rules live in the Firebase console: per the
`firestore.rules` header, review it against the live console rules before deploying.

Any catch-all `match /{document=**}` allow rule in the console would expose these numbers.
It must not exist.

## Config

- `FIREBASE_SERVICE_ACCOUNT`: service-account JSON string (or base64 of it). Server only.
  Without it the routes return 503 `not-configured`.
- `NEXT_PUBLIC_RESULT_TEXTS=1`: shows the card and fires the send call after settling.
  Leave unset until the SMS provider and the service account are configured.

## SMS provider

`sendResultSms` in `src/server/sms.js` is a `TODO(notify)` hook that throws
`sms-not-configured`. Until it is wired, settling still deletes the saved numbers and
counts them as failed. Messages are GSM-7 and fit one segment (the title is shortened
with `...` if needed).
