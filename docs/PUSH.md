# Push notifications

Status: **infra only, behind a flag that is off.** There is no UI, no permission prompt and no send wired to any bet event. Nothing in the app calls this code yet.

## The flag

`NEXT_PUBLIC_PUSH_ENABLED`. Only the exact value `1` turns it on; unset, empty, `0`, `true` and anything else are off. It is read by both builds: Next inlines it for the web and API routes, and `mobile/vite.config.mjs` defines it for the app from the shell or the repo-root `.env*` files (the shell wins). It is unset in the repo. Helper: `pushEnabled()` in `src/phone/pushConfig.js`.

It is a **build-time** flag. Like every `NEXT_PUBLIC_*` var, its value is inlined when each bundle is built: the Next server and API bundle, the web client, and the mobile Vite build. Changing the Vercel env does nothing until the next build. Turning it on or off takes a redeploy of the server (and web client) and a new native build for the app; an app already installed keeps the value it was built with.

With the flag off:

- the client plumbing does nothing (no permission, no token read, no Preferences read, no fetch);
- `POST`, `DELETE` and `OPTIONS /api/push/tokens` answer a plain 404 with no CORS headers, as if the route did not exist;
- `sendToUser` returns `{ skipped: 'disabled' }` without touching Firestore or FCM.

To stop server sends, set the flag off and redeploy the server: the send helper and the token route then go quiet even for installed apps built with it on (their register calls get a 404). Installed apps still run their own client plumbing until a new native build ships with the flag off.

## What this infra adds

| Piece | Where |
| --- | --- |
| Flag and validators | `src/phone/pushConfig.js` (`pushEnabled`, `MAX_PUSH_DEVICES`, `validDeviceId`, `validPushToken`, `validPushPlatform`) |
| Client plumbing (no UI) | `src/phone/pushTokens.js`: `getPushDeviceId`, `getPushToken`, `registerPushToken`, `unregisterPushToken` |
| Token route | `app/api/push/tokens/route.js` (`POST` and `DELETE /api/push/tokens`) |
| Token storage | `src/server/pushTokens.js` (`saveDeviceToken`, `removeDeviceToken`) |
| Server send helper | `src/server/pushSend.js`: `sendToUser(uid, payload, { collapseKey, threadId, code })` |
| Admin Messaging | `adminMessaging()` in `src/server/firebaseAdmin.js`, lazy like `adminDb()` / `adminAuth()` |
| Device owners | `privatePushDevices/{deviceId}` (`{ uid, updatedAt }`), written by `saveDeviceToken` / `removeDeviceToken` |
| Rules | `privatePushTokens`, `privatePushDevices` and `privatePushSends` deny all client access in `firestore.rules` |
| Plugins | `@capacitor-firebase/messaging` v8 and `@capacitor/preferences` (per-install device id) |
| Native | Android `POST_NOTIFICATIONS`; iOS `UIBackgroundModes: remote-notification`; FCM auto-init off on both; `AppDelegate.swift` forwards the APNs token to the plugin |

### Client plumbing

Every function is a no-op unless the flag is on **and** `Capacitor.isNativePlatform()`. Register and unregister also need a real Firebase user (anonymous counts); the local fallback uid cannot register. None of them asks for notification permission: the opt-in PR asks first, in context, then calls `registerPushToken()`. They never throw; they return `{ ok: true }` or `{ ok: false, skipped | error }`. They never log the token, uid or a phone number.

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
- There is no backfill: devices registered before owner records existed get one on their next register. Until then a leftover under an old uid is cleaned up by `sendToUser` when FCM reports the token dead, as before. The opt-in PR should still re-register on auth changes and unregister before sign-out.

### Server send helper

`sendToUser(uid, { title, body, data }, { collapseKey, threadId, code })` loads that uid's device docs and calls `adminMessaging().sendEach(...)`, one message per device. It is not called from vote, settle, call-off or any cron yet.

- Title and body come from the caller; this module has no user-facing copy. `data` values are sent as strings.
- `collapseKey` sets Android `collapseKey` and `notification.tag` (a newer notification replaces the shown one) and the iOS `apns-collapse-id` header. `threadId` sets `aps.thread-id`. Later pick sends pass the bet code for both, so a busy bet replaces instead of stacking.
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
- No Android notification channel is created, so there are no `TODO_UX_` strings in this PR. FCM's default channel applies until a later PR adds one with approved copy.

## Later PRs

1. **Opt-in UX** (copy first, then review): soft sheet right after the creator's first send only, never at launch or on the web; system prompt only after "Notify me"; no re-ask in the same session after a decline; a quiet Notifications row; register only after a grant; re-register on auth changes.
2. **Settle and call-off send**: `POST /api/bets/{code}/push`, server-chosen recipients, `privatePushSends/{eventId}` claims, after the 35s undo window for settle.
3. **First-pick vote send** to the creator, collapsed per bet (`collapseKey` / `threadId` = bet code).
4. **Closing-soon cron**: once per bet, to the creator and voters who have not picked; needs `vercel.json` and `CRON_SECRET`.

All of these ship with the flag off. Notification titles and bodies arrive with those PRs, after UX approval.

## What Jack must do himself

None of this is in the repo, and none of it goes in a PR.

1. Upload the APNs auth key (`.p8`) in the Firebase console for `friendly-betting-fb47e` (Project settings → Cloud Messaging → Apple app configuration). iOS phone auth already needs it. Confirm it before any TestFlight build with the flag on.
2. In Xcode, on the App target: add **Push Notifications** and **Background Modes → Remote notifications**. These capabilities live in the Xcode project and entitlements, not in this PR.
3. Keep `GoogleService-Info.plist` at `ios/App/App/` and `google-services.json` at `android/app/` on your machine only. Both are gitignored. Never commit them or attach them to a PR. (Build code that reads them is fine.)
4. Confirm both native apps (`com.friendlybetting.app` on iOS and Android) are registered in `friendly-betting-fb47e` and that Cloud Messaging is enabled (Firebase Cloud Messaging API (V1) on).
5. Android SHA-1 / SHA-256 fingerprints stay a Jack-only console step.
6. Nothing merges to `main`, and no rules deploy, without Jack's own go. `firestore.rules` is not auto-deployed: review it line by line against the live console rules before anyone runs `firebase deploy --only firestore:rules`.
7. Turn the flag on in a preview first (Vercel env plus the native build env, then redeploy and rebuild: the flag is build-time), then production only after the steps above are done on the machine that cuts the TestFlight and Play builds.
