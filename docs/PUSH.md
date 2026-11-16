# Push notifications

Status: **infra, opt-in UX, settle and call-off sends, and the first-pick send, behind a flag that is off.** The app has the soft opt-in sheet and a Notifications row on My bets, both hidden unless the flag is on in the native app. A settle (after its undo window) and a call-off push the result to the bet's voters, a friend's first pick tells the bet's creator, and the Android app creates its one notification channel at start. The closing-soon cron is a later PR. Nothing is sent while the flag is off, and it is off.

## The flag

`NEXT_PUBLIC_PUSH_ENABLED`. Only the exact value `1` turns it on; unset, empty, `0`, `true` and anything else are off. It is read by both builds: Next inlines it for the web and API routes, and `mobile/vite.config.mjs` defines it for the app from the shell or the repo-root `.env*` files (the shell wins). It is unset in the repo. Helper: `pushEnabled()` in `src/phone/pushConfig.js`.

It is a **build-time** flag. Like every `NEXT_PUBLIC_*` var, its value is inlined when each bundle is built: the Next server and API bundle, the web client, and the mobile Vite build. Changing the Vercel env does nothing until the next build. Turning it on or off takes a redeploy of the server (and web client) and a new native build for the app; an app already installed keeps the value it was built with.

With the flag off (and always on the web):

- the client plumbing does nothing (no permission, no token read, no Preferences read, no fetch);
- the opt-in sheet and the Notifications row never render, and the opt-in module (`src/phone/pushOptIn.js`) makes no plugin, Preferences or register calls; Create does no first-bet lookup, and the tally's share sheet opens after Create exactly as before;
- `POST`, `DELETE` and `OPTIONS /api/push/tokens` answer a plain 404 with no CORS headers, as if the route did not exist;
- `sendToUser` returns `{ skipped: 'disabled' }` without touching Firestore or FCM;
- settle and call-off do not post to `/api/bets/{code}/push`, and that route answers a plain 404 (no CORS) without checking auth, reading the bet, a token or calling Messaging;
- a pick does not post to `/api/bets/{code}/push/pick` (no ID token is read), and that route answers the same plain 404;
- no Android notification channel is created.

To stop server sends, set the flag off and redeploy the server: the send helper and the token route then go quiet even for installed apps built with it on (their register calls get a 404). Installed apps still run their own client plumbing until a new native build ships with the flag off.

## What this infra adds

| Piece | Where |
| --- | --- |
| Flag and validators | `src/phone/pushConfig.js` (`pushEnabled`, `MAX_PUSH_DEVICES`, `validDeviceId`, `validPushToken`, `validPushPlatform`) |
| Client plumbing | `src/phone/pushTokens.js`: `getPushDeviceId`, `getPushToken`, `registerPushToken`, `unregisterPushToken` |
| Opt-in logic | `src/phone/pushOptIn.js`: when the sheet shows, what its buttons do, the row's state, re-register on auth changes, unregister before log out |
| Opt-in copy | `src/phone/pushCopy.js` (UX final, Nov 16 2026; asserted verbatim in `pushCopy.test.js`) |
| Opt-in UI | `src/phone/PushOptInSheet.jsx` (on the tally), `src/phone/PushSettingsRow.jsx` (on My bets), `src/phone/PushSync.jsx` (mounted in `mobile/App.jsx`) |
| Token route | `app/api/push/tokens/route.js` (`POST` and `DELETE /api/push/tokens`) |
| Token storage | `src/server/pushTokens.js` (`saveDeviceToken`, `removeDeviceToken`) |
| Server send helper | `src/server/pushSend.js`: `sendToUser(uid, payload, { collapseKey, threadId, channelId, code })` |
| Settle and call-off send | `src/server/pushEvents.js` (`deliverBetPush`), `app/api/bets/[code]/push/route.js`, client `src/phone/betPush.js` (`requestBetPush`) |
| First-pick send | `src/server/pushEvents.js` (`deliverPickPush`), `app/api/bets/[code]/push/pick/route.js`, client `src/phone/betPush.js` (`requestPickPush`), called from `castVote` in `src/phone/api.js` |
| Android channel | `src/phone/pushChannel.js` (`ensurePushChannel`, called by `PushSync`); id `PUSH_CHANNEL_ID` in `pushConfig.js` |
| Admin Messaging | `adminMessaging()` in `src/server/firebaseAdmin.js`, lazy like `adminDb()` / `adminAuth()` |
| Device owners | `privatePushDevices/{deviceId}` (`{ uid, updatedAt }`), written by `saveDeviceToken` / `removeDeviceToken` |
| Rules | `privatePushTokens`, `privatePushDevices` and `privatePushSends` deny all client access in `firestore.rules` |
| Plugins | `@capacitor-firebase/messaging` v8, `@capacitor/preferences` (per-install device id, opt-in state) and `capacitor-native-settings` v8 (Open Settings) |
| Native | Android `POST_NOTIFICATIONS`; iOS `UIBackgroundModes: remote-notification`; FCM auto-init off on both; `AppDelegate.swift` forwards the APNs token to the plugin |

### Client plumbing

Every function is a no-op unless the flag is on **and** `Capacitor.isNativePlatform()`. Register and unregister also need a real Firebase user (anonymous counts); the local fallback uid cannot register. None of them asks for notification permission: the opt-in sheet or the Notifications row asks first, in context, then calls `registerPushToken()`. They never throw; they return `{ ok: true }` or `{ ok: false, skipped | error }`. They never log the token, uid or a phone number.

- `getPushDeviceId()`: a UUID kept in Preferences under `fb.pushDeviceId`. Stable per install, never the raw token.
- `getPushToken()`: `FirebaseMessaging.getToken()`.
- `registerPushToken()`: `POST /api/push/tokens` with `{ deviceId, token, platform }` and `Authorization: Bearer <ID token>`.
- `unregisterPushToken()`: `DELETE /api/push/tokens` with `{ deviceId }`.

The app calls the production origin (`apiUrl`), so the route uses the existing CORS allowlist in `src/server/http.js`.

### Token route

`POST` / `DELETE /api/push/tokens` (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `Cache-Control: no-store`).

- 404 when the flag is off (before auth or the database).
- 401 without a valid Bearer ID token. The uid comes from the token, never the body.
- 400 for a bad body: `deviceId` must be 8 to 128 of `A-Z a-z 0-9 _ -`; `token` non-empty, at most 4096 printable characters, no spaces; `platform` is `ios` or `android`.
- 429 after 20 register or unregister calls per uid in 10 minutes (`PUSH_RATE_LIMIT`, `PUSH_RATE_WINDOW_MS`). A rejected call writes nothing. The window lives on `privatePushTokens/{uid}`, so it holds across serverless instances.
- 503 when `FIREBASE_SERVICE_ACCOUNT` is not set.
- 200 `{ ok: true }` otherwise. The response never echoes the token, device id or uid; errors log at most an error code.

Writes (one Admin transaction each):

- `privatePushTokens/{uid}/devices/{deviceId}`: `token`, `platform`, `createdAt`, `updatedAt` (epoch ms). Re-posting the same device keeps `createdAt` and moves `updatedAt` (a refreshed token replaces the old one). The same token under another device id of that uid is dropped (a reinstall). At most 10 devices per uid; the oldest `updatedAt` is evicted.
- `privatePushDevices/{deviceId}`: `uid`, `updatedAt` (epoch ms). Which uid owns that install now. Read and written in the same transaction as the device doc.
- `DELETE` removes that device doc. A missing doc is still a 200.

Account switch. An unregister before sign-out can fail (offline, app killed), which would leave the token under the old uid. The owner record fixes that server-side:

- Register: if `privatePushDevices/{deviceId}` names a different uid, that uid's `privatePushTokens/{priorUid}/devices/{deviceId}` is deleted in the same transaction (its other devices and its rate window are left alone). The owner record is then set to the caller's uid. Same uid or no record: the record is just upserted.
- Unregister: deletes the caller's device doc as before (still charged to the rate window). The owner record is cleared only if it names the caller. A missing record, or one that already names another uid, is left alone, so a late unregister from the old account never wipes the new owner's mapping.
- There is no backfill: devices registered before owner records existed get one on their next register. Until then a leftover under an old uid is cleaned up by `sendToUser` when FCM reports the token dead, as before.

The opt-in UX still unregisters before log out (`signOutCreator`) and re-registers on auth changes (`PushSync`) for a uid whose in-app choice is on. If an anonymous session signs in to an existing phone account, the old uid's doc can keep the token until the new uid registers (the owner record then drops the old one) or a send gets an unregistered error; anonymous uids never reach the sheet or the row, so in practice they hold no token.

### Server send helper

`sendToUser(uid, { title, body, data }, { collapseKey, threadId, channelId, code })` loads that uid's device docs and calls `adminMessaging().sendEach(...)`, one message per device. Settle and call-off call it through `deliverBetPush`, and the first pick through `deliverPickPush` (both below); the closing cron does not exist yet.

- Title and body come from the caller; this module has no user-facing copy. `data` values are sent as strings.
- `collapseKey` sets Android `collapseKey` and `notification.tag` (a newer notification replaces the shown one) and the iOS `apns-collapse-id` header. `threadId` sets `aps.thread-id`. Bet sends pass the bet code for both, so a later event on the same bet replaces the earlier notification instead of stacking.
- `channelId` sets Android `notification.channelId`. Bet sends pass `bet_updates` (`PUSH_CHANNEL_ID`). `betPushOptions(code)` in `pushEvents.js` returns all four options; the first-pick send uses it too, and the closing-soon send should.
- On `messaging/registration-token-not-registered` or `messaging/invalid-registration-token`, it deletes that device doc (only if it still holds the dead token).
- Never throws for setup problems. If `adminDb()` / `adminMessaging()` throw (for example `admin-not-configured` when `FIREBASE_SERVICE_ACCOUNT` is missing or invalid), or the first device read fails on a bad credential, it returns `{ sent: 0, failed: 0, removed: 0, skipped: 'admin-not-configured' }` without calling FCM or writing anything. Any other device read failure returns `skipped: 'read-failed'`. Either way it logs only a safe error code, so a settle caller can ignore the result.
- Returns counts only: `{ sent, failed, removed }`. Logs at most error codes and, if the caller passes a valid one, the bet code. Never a token, uid or phone number. Payloads must never contain phone numbers.
- Tests mock Messaging; nothing calls live FCM.

### Rules

`privatePushTokens/{uid}/**`, `privatePushDevices/**` and `privatePushSends/**` are `allow read, write: if false`, like `privateResultTexts`, including for the owner uid (and for the uid named in an owner record). Only the Admin SDK in the push API routes touches them. Emulator tests: `rules/firestore.rules.test.js` ("push tokens, device owners and send claims"). `firestore.rules` is **not auto-deployed**; see the caveat at the top of that file.

### Native

- Android: `POST_NOTIFICATIONS` in `AndroidManifest.xml` (Android 13+ asks only when the app requests it). `firebase_messaging_auto_init_enabled` is `false`, so no FCM token is created until the app asks for one.
- iOS: `UIBackgroundModes` → `remote-notification` and `FirebaseMessagingAutoInitEnabled` = `NO` in `Info.plist`. `AppDelegate.swift` forwards `didRegisterForRemoteNotificationsWithDeviceToken`, the failure callback and `didReceiveRemoteNotification` to the plugin. `App.entitlements` is unchanged: the Push Notifications entitlement is added in Xcode (below).
- SPM: the messaging plugin uses `packageOptions.symlink` in `capacitor.config.json`, like the authentication plugin, to avoid a package identity collision. `npx cap sync` regenerates `Package.swift` and the Gradle includes.
- Android notification channel: see "Android notification channel" below.

## Opt-in UX

Copy is UX final (Nov 16 2026) and lives in `src/phone/pushCopy.js`. Native only, flag on only, and only for a real Firebase user.

### The sheet (after the creator's first send)

"Want to know when friends pick?" / "We’ll ping you when picks come in and when it’s settled." / **Turn on notifications** (the green 56px `.cta`) / Not now (a muted text button).

- **When.** Only on the live tally right after Create sent the creator's first bet. After the save, and only with push on, Create asks `isOnlyBetBy(uid, code)` in `src/phone/firstBet.js` (a two-doc `createdByID` query) whether the new bet is their only one, waiting at most 1.5 s. It writes a sibling of the fresh-bet note (`friendly.freshBetFirst` in `freshBet.js`) only on a yes; an error or timeout means no sheet. The tally takes both notes on its first mount.
- **Never** at launch, on a reload, on a tally opened any other way, on the vote page or an invite link (`/b/{code}`), after a voter's pick, after a second or later create, on the web, with the flag off, without a real Firebase user, when the OS permission is denied or could not be read (`FirebaseMessaging.checkPermissions()`), when a grant or a denial is saved for this uid (`fb.pushAsked.{uid}`), when an in-app choice is already saved for this uid (`fb.pushPref.{uid}`, `on` or `off`, for example from the Notifications row), or once it has shown this session.
- **Already granted.** Android 7 to 12 (minSdk is 24) always report `granted`, and some users allow notifications at the OS level before their first bet. The sheet still shows in that case if nothing is saved for this uid (neither `fb.pushAsked.{uid}` nor `fb.pushPref.{uid}`), so the in-app choice gets made and a token gets saved. Its primary button then registers without an OS prompt.
- **Order.** The sheet shows first; the share sheet that opens itself after Create waits until the sheet closes, then opens as before. With no sheet the share opens exactly as it always has.
- **Not now** (also Escape and the scrim): closes the sheet, never calls the OS, and suppresses the sheet for the rest of the session (in memory). Not saved, so a later session can still use the Notifications row.
- **Turn on notifications**: if `checkPermissions()` already says `granted`, it does not call `requestPermissions()`; it saves the grant, turns the in-app choice on and calls `registerPushToken()`. Otherwise `FirebaseMessaging.requestPermissions()`. On `granted` it saves the grant, turns the in-app choice on and calls `registerPushToken()`. On `denied` it saves the denial and closes; there is no follow-up dialog (the Notifications row is the way to Settings). If the call throws, nothing is saved, the sheet closes, and the share follows.

State is kept per uid in Preferences: `fb.pushAsked.{uid}` (`granted` or `denied`, the OS answer) and `fb.pushPref.{uid}` (`on` or `off`, the in-app choice). Another account signing in on the same install does not inherit either. Anything saved in either key for this uid means the choice was already made, so the sheet does not show. Every path that saves `fb.pushPref.{uid}` while the OS permission is granted (the sheet's grant, the row's toggle on or off, the resume resync) also saves `fb.pushAsked.{uid}` as `granted`, so the two keys agree. Turning the row off never saves `denied`: the OS may still allow notifications; only the in-app choice is off.

### The Notifications row (My bets, above Log out)

"Notifications" / "Picks, results, and closing reminders." and a switch. Only on the signed-in My bets list, never on the phone gate.

- **Permission granted:** the switch registers (on) or unregisters (off) and saves the in-app choice, plus the grant (`fb.pushAsked.{uid}` = `granted`).
- **Still promptable** (the user never saw the sheet, for example they already had bets): turning it on asks the OS from that tap, then registers on a grant. Loading the row never asks.
- **Permission unreadable:** if `checkPermissions()` fails, the row renders nothing.
- **Otherwise (denied):** the helper becomes "Turned off in your phone’s settings." with a muted **Open Settings** link, and the switch is off and disabled; it never asks again (iOS and Android 13+ will not). Open Settings uses `capacitor-native-settings`: the app's notification settings on Android, the app's own Settings page on iOS (the only one Apple allows).
- **On App resume** the row reads the permission again. If it is now granted and the in-app choice is on, or the user went to Settings from this row, it turns on and registers.

### Register and unregister

- After a grant (sheet or row): `registerPushToken()`.
- `PushSync` (mounted once in `mobile/App.jsx`) re-registers on each auth change when that uid's in-app choice is on and the OS permission is already granted. It never asks.
- On an FCM token refresh (`FirebaseMessaging` `tokenReceived`), `PushSync` re-registers the new token for the signed-in user through the same `syncPushForUser(uid)` checks (in-app choice on, permission already granted), so the server never keeps a stale token. Nothing when signed out or on the local fallback. It never asks, swallows every error, never blocks the channel or the auth sync, never logs the token, and removes the listener on unmount. With the flag off or on the web the listener is never added.
- Log out (`signOutCreator`) calls `unregisterPushToken()` first, while the user's ID token still works, for a uid whose choice is on. It waits at most 3 s and never blocks the logout. The in-app choice stays, so signing back in registers again.

## Settle and call-off send

### Copy (UX final, Nov 16 2026)

In `src/phone/pushCopy.js` (`PUSH_NOTIFICATION_COPY`), asserted verbatim in `pushCopy.test.js` and `pushEvents.test.js`. Every title is the bet question (the settlement snapshot's `question`, else `questionOf(bet)`), so notifications group by bet; only the body changes.

| Event | Title | Body |
| --- | --- | --- |
| Settled with a winner | `{question}` | `{side} won. See who called it.` (`{side}` is `settlement.optionLabel`, the winning option's vote label, for example `Over won. See who called it.`) |
| Called off | `{question}` | `This bet was called off. Nobody won this one.` |

The first-pick bodies are below. The closing-soon bodies are approved too and land with their send PR.

Payload `data` (strings only): `code`, `route` = `/b/{code}`, `event` = `settle` or `calloff`. No phone numbers, tokens, uids or names. Options: `collapseKey` and `threadId` = the bet code, `channelId` = `bet_updates`.

### Who gets it

- **Settle:** the voters on `settlement.recipients` (the snapshot taken in the settle transaction) who also have a pick (a truthy `optionId`) in the live votes (the bet's `votes` array merged with `bets/{code}/votes/*`, via `readBetWithVotes`). The creator's client writes the snapshot and the rules do not check what is inside it, so a listed uid that never voted is dropped. This is an intersection: a live voter missing from the snapshot is not added. Minus the creator and the settler (settle is creator-only, so they are the same uid; a `settledBy` uid, if a later build writes one, is skipped too). A voter without a uid is skipped. Winners and losers get the same body.
- **Call-off:** voters with a pick in the live votes (the bet's `votes` array merged with `bets/{code}/votes/*`, via `readBetWithVotes`), minus the creator. There is no settlement snapshot on a call-off. The in-app inbox skips called-off bets; push does not.
- A recipient with no registered device just gets nothing.

### Trigger: fire-and-forget POST plus a server-side wait

After `settleBet` or `callOffBet` commits, the client calls `requestBetPush(code)`, right next to `requestResultTexts(code)`: a fire-and-forget `POST /api/bets/{code}/push` with no body and `Authorization: Bearer <ID token>` (the current Firebase user's `getIdToken()`). With no signed-in user, or if getting the token fails, it does not post. It is never awaited, every error is caught, and with the flag off it does not post at all. It runs from any client the creator is signed in on (a web settle still pings the voters' phones), and it is independent of the result-texts flag. It never logs the token or the uid.

The route (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `maxDuration = 60`, CORS from `src/server/http.js`) checks, in order:

- A malformed code: 404.
- Flag off: a plain 404 with no CORS, before auth or the database (same as `/api/push/tokens`).
- No Bearer ID token, or one `verifyIdToken` rejects: 401, before the database.
- More than 10 POSTs from one uid in 10 minutes on this server instance (`src/server/betPushLimit.js`, in memory only): 429 `{ error: 'rate-limited' }`.
- Reads only the bet doc `bets/{code}` (no votes). A missing bet: 200 `{ sent: 0, failed: 0, skipped: 'not-found' }`. A uid that is not the bet's `createdByID` (the only uid the rules let settle or call off): 403 `{ error: 'forbidden' }`, with no vote read, no wait and no send.

Then it calls `deliverBetPush`:

1. Flag off: returns `{ skipped: 'disabled' }` before the database (the route never gets here with the flag off).
2. Reads the bet with its votes. While a run for the same `code` + `settledAt` is in flight on this instance, a repeat returns `{ skipped: 'in-flight' }` at once, so a double POST does not start two 35s waits.
3. **Settle:** waits `undoHoldMs(bet)` (until 35s after the server `settledAt`, the rules' undo window), then re-reads the bet. Still inside a window (it was undone and settled again), or no longer settled (undone): nobody is sent and no claim is written. A later settle has a new `settledAt`, so its own POST is a new event and may send. **Call-off:** no undo exists (`undoHoldMs` is 0), so it sends right away.
4. An event older than 10 minutes (`MAX_EVENT_AGE_MS`) or with no `settledAt` sends nobody, so a stray POST cannot ping voters about a bet settled long ago (for example before the flag was on). A settle with no winning side label sends nobody (`{ skipped: 'no-winner' }`), so the body never reads " won. See who called it.".
5. Claims `privatePushSends/{eventId}` in a transaction, with `eventId` = `settle:{code}:{settledAtMs}` or `calloff:{code}:{settledAtMs}`. An existing claim means already sent: `{ skipped: 'already-sent' }`. The claim holds only `{ code, at }`.
6. Sends to each recipient through `sendToUser`, one at a time; a failure or throw for one is caught and counted, and the rest still go. If nothing reached any device and something failed (or the Admin SDK was not set up), the claim is deleted so a retry can send. Recipients who simply have no device are not a failure.
7. Answers counts only: `{ sent, failed }` (plus `skipped` when it did nothing). 503 when `FIREBASE_SERVICE_ACCOUNT` is missing, 500 on any other read failure; logs at most the bet code and an error code.

Only the creator can trigger it: anyone else holding the code (it travels in SMS) gets a 401 or 403 before any vote read or the 35s wait. The body is ignored, the server picks the recipients, it only acts on a bet already settled past its undo window or called off, and each event is claimed once. Logs hold at most the bet code and an error code; the ID token and uid are never logged or echoed. The 429 throttle is per instance, so across instances it only slows a misbehaving client; the creator check and the claim are what bound the sends.

Why this trigger. It is the pattern result texts already ship (`deliverResultTexts`, same 35s hold, same re-read). The alternatives are worse on Vercel today: a check on next read would hold the ping until someone opens the bet, which defeats the point; a Vercel cron has a granularity of minutes, needs `vercel.json` and `CRON_SECRET` (planned only for closing-soon, PR 5), and would have to scan for settled bets; Firestore triggers would need Cloud Functions, which this project does not deploy.

**Tradeoff (same as result texts):** the wait lives inside one function invocation. If the function dies mid-wait (a crash, a deploy, a platform timeout), or the client's POST never reaches the server (offline right after settling, app killed), that settle sends no push, and nothing retries it later. Nothing is claimed in that case, so a later POST for the same settle (for example a settle retry with the same winner, which posts again) can still send within the 10-minute limit. Call-offs do not wait, so they only miss on a lost POST or a crash mid-send.

## First-pick vote send

### Copy (UX final, Nov 16 2026)

In `src/phone/pushCopy.js` (`PUSH_NOTIFICATION_COPY.firstPickNamed` and `firstPickUnnamed`), asserted verbatim in `pushCopy.test.js` and `pushEvents.test.js`. The title is the bet question (`questionOf(bet)`), like every bet push.

| Event | Title | Body |
| --- | --- | --- |
| A friend's first pick, named | `{question}` | `{name} picked {side}.` |
| A friend's first pick, no name | `{question}` | `A friend picked {side}.` |

`{side}` is the picked option's vote label (`optionVoteLabel`, so an over-under line is included, for example `Over 7.5`), the same label settle uses. `{name}` is the voter's recorded name after `cleanName`, then made one line for the body only (control characters such as newlines and tabs become spaces, whitespace runs collapse, ends trimmed; the stored name is unchanged); an empty result gets the unnamed body. A pick whose side has no label sends nothing (`{ skipped: 'no-side' }`), so the body never reads "A friend picked .".

Payload `data` (strings only): `code`, `route` = `/b/{code}`, `event` = `pick`. No phone numbers, tokens, uids or names in `data` (the name is only in the body, which is the copy). Options: `betPushOptions(code)`, so `collapseKey` and `threadId` are the bet code and `channelId` is `bet_updates`. Picks on the same bet collapse: the newest replaces the one shown.

### Who gets it

The bet's creator (`createdByID`) only, once per friend per bet, on that friend's first pick. Never on a side change, a re-pick or a rename, and never about the creator's own pick. A creator with no registered device gets nothing.

Prefs are honored the same way as settle: `sendToUser` only delivers to registered device tokens, and the app unregisters its token when the in-app choice is off, so a creator who turned notifications off gets nothing. There is no server-side pref document and no new Firestore field.

### Trigger: fire-and-forget POST after the pick commits

`castVote` in `src/phone/api.js` (both the vote-doc path and the legacy `votes` array fallback) decides inside its transaction whether the write is a first pick: the voter had no recorded pick (a truthy `optionId`) in the live votes before the write, meaning the bet's `votes` array merged with their own vote doc (the doc path reads it in the transaction; vote docs are readable by anyone). A voter who only had a legacy array entry and now writes a vote doc is re-picking, not picking for the first time. The creator's own pick never counts. After the commit, and only for a first pick, it calls `requestPickPush(code)`: a fire-and-forget `POST /api/bets/{code}/push/pick` with no body and `Authorization: Bearer <ID token>` (the current Firebase user's `getIdToken()`; anonymous users count). With the flag off, no `auth.currentUser`, the local fallback identity (`isLocal`, no Firebase account), no `getIdToken`, an empty token or a failing one, it does not post. It is never awaited, every error is caught (and `castVote` wraps the call too, like `notifyAfterClose`), so a pick never waits on it and never fails because of it. `renameVote` never posts. It never logs the token or the uid.

The route (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, no `maxDuration`: there is no undo wait; CORS from `src/server/http.js`, which allows the `Authorization` header) checks, in order:

- A malformed code: 404 with CORS.
- Flag off: a plain 404 with no CORS, before auth or the database (same as the settle route).
- No Bearer ID token, or one `verifyIdToken` rejects: 401, before the database. Nothing is logged.
- The same per-uid, per-instance throttle as the settle route (`allowBetPush` in `src/server/betPushLimit.js`, shared with it): 429 `{ error: 'rate-limited' }`.
- One read of the bet with its votes (`readBetWithVotes`). A missing bet: 200 `{ sent: 0, failed: 0, skipped: 'not-found' }`.
- The caller is the creator: 200 `{ sent: 0, failed: 0, skipped: 'self' }`, before any claim or send.
- The caller has no recorded pick on this bet: 403 `{ error: 'forbidden' }`, no claim, no send.

Then it calls `deliverPickPush`:

1. Flag off: `{ skipped: 'disabled' }` before the database (the route never gets here with the flag off).
2. Takes the caller's recorded vote from the live votes: the side and the name come from there, never from the request.
3. A vote whose `at` is more than 10 minutes old (`MAX_EVENT_AGE_MS`) sends nothing and claims nothing (`{ skipped: 'stale' }`), so a stray POST cannot ping the creator about an old pick. A vote with no `at` (just written) still sends; the claim is the main guard.
4. A bet that is no longer open (settled, closed or called off, `isFinished`) sends nothing and claims nothing (`{ skipped: 'not-open' }`). Votes are only written while a bet is open, so this is a POST that landed after a settle; with no claim, a POST after an undone settle can still send.
5. Claims `privatePushSends/pick:{code}:{voterUid}` in a transaction (the existing deny-all collection; no rules change). An existing claim means already sent: `{ skipped: 'already-sent' }`, whatever the vote says now, and the per-bet count does not change. The claim holds only `{ code, at }`.
6. Per-bet cap, in the same transaction: at most 10 pick pushes per bet in any rolling 10 minutes (`PICK_PUSH_BET_LIMIT`, `PICK_PUSH_BET_WINDOW_MS`). The send times live in `privatePushSends/pickcount:{code}` as `{ code, sends: [ms, ...] }` (same deny-all collection; no rules change); times older than the window are dropped. Past the cap the voter's claim is still written, so that voter never sends later, even after the window resets, but the count is not bumped and nothing is sent: `{ skipped: 'bet-capped' }`. This stops one link holder from buzzing the creator once per fresh anonymous uid.
7. Sends to the creator through `sendToUser`. If nothing reached a device and it failed, threw, or the Admin SDK was not set up or could not read devices (`admin-not-configured`, `read-failed`), the claim is deleted and this send is taken back out of the per-bet count, so a retry can send. A creator with no device is not a failure: the claim stays and the cap slot stays used.
8. Answers counts only: `{ sent, failed }` (plus `skipped` when it did nothing). 503 when `FIREBASE_SERVICE_ACCOUNT` is missing, 500 on any other failure; logs at most the bet code and an error code.

The body is ignored, so a patched client cannot choose the recipient, the name or the side: the server sends the live vote to the creator. Only a uid with a recorded pick on the bet gets past the 403, and the claim bounds it to one push per voter per bet. The per-bet cap bounds it to 10 per bet per 10 minutes however many uids pick. Logs hold at most the bet code and an error code; the ID token, uid, name and phone are never logged or echoed.

**Tradeoffs (same shape as settle):** if the voter's POST never reaches the server (offline right after picking, app killed) or the function dies mid-send, that first pick sends no push, and nothing retries it later. If a first pick's POST was lost and the same voter later changes sides, this app does not post again (a side change is not a first pick), so nothing goes out. If some later POST does arrive for that voter while nothing is claimed (a first pick whose send failed and released the claim, or a POST from another client), it notifies with whatever side and name the live vote holds then, within the 10-minute limit. The server never trusts the client's idea of "first": the claim is what makes it once only.

## Android notification channel

UX final (Nov 16 2026), in `src/phone/pushCopy.js` (`PUSH_CHANNEL_COPY`):

- Name: `Bet updates`
- Description: `Picks, results, and closing reminders on your bets.`
- Id: `bet_updates` (`PUSH_CHANNEL_ID` in `src/phone/pushConfig.js`; not user-facing; never rename it, Android keeps the user's channel settings under the id).
- Importance: default (sound, no heads-up). Android fixes importance at creation, so changing it later needs a new id.

`ensurePushChannel()` (`src/phone/pushChannel.js`) calls `FirebaseMessaging.createChannel` once at app start from `PushSync`. Android only (SDK 26+; iOS has no channels); with the flag off or on the web, `PushSync` renders nothing and no plugin or Preferences call is made. It never asks for permission, never blocks the auth sync, and swallows every error (FCM's default channel still delivers). Creating an existing channel only updates its name and description, so running every launch is safe. Every bet push sets `android.notification.channelId` to this id.

## Later PRs

1. **Closing-soon cron**: once per bet, to the creator and voters who have not picked; needs `vercel.json` and `CRON_SECRET`.

It ships with the flag off. Its bodies (already approved) arrive with that PR.

## What Jack must do himself

None of this is in the repo, and none of it goes in a PR.

1. Upload the APNs auth key (`.p8`) in the Firebase console for `friendly-betting-fb47e` (Project settings → Cloud Messaging → Apple app configuration). iOS phone auth already needs it. Confirm it before any TestFlight build with the flag on.
2. In Xcode, on the App target: add **Push Notifications** and **Background Modes → Remote notifications**. These capabilities live in the Xcode project and entitlements, not in this PR.
3. Keep `GoogleService-Info.plist` at `ios/App/App/` and `google-services.json` at `android/app/` on your machine only. Both are gitignored. Never commit them or attach them to a PR. (Build code that reads them is fine.)
4. Confirm both native apps (`com.friendlybetting.app` on iOS and Android) are registered in `friendly-betting-fb47e` and that Cloud Messaging is enabled (Firebase Cloud Messaging API (V1) on).
5. Android SHA-1 / SHA-256 fingerprints stay a Jack-only console step.
6. Nothing merges to `main`, and no rules deploy, without Jack's own go. `firestore.rules` is not auto-deployed: review it line by line against the live console rules before anyone runs `firebase deploy --only firestore:rules`.
7. Turn the flag on in a preview first (Vercel env plus the native build env, then redeploy and rebuild: the flag is build-time), then production only after the steps above are done on the machine that cuts the TestFlight and Play builds.
