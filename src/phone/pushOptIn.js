import { firebaseUser, pushAvailable, registerPushToken, unregisterPushToken } from './pushTokens';

// Push opt-in (docs/PUSH.md): when the soft sheet may show after the
// creator's first send, what its two buttons do, and the state the
// Notifications row and the background re-register read.
//
// Everything here is a no-op unless NEXT_PUBLIC_PUSH_ENABLED is 1 and this is
// the native app: no Preferences, no FirebaseMessaging, no register calls.
// Nothing here throws. Never log the token, the uid or a phone number.
//
// Persisted per uid, in Preferences on this install:
// - ASKED: 'granted' or 'denied', the OS answer to the sheet or the row.
//   Either one means the sheet never shows again for that uid. A soft
//   "Not now" is not persisted.
// - PREF: 'on' or 'off', the in-app choice. A background re-register only
//   happens when it is 'on', so a user who switched it off stays off.

const ASKED_PREFIX = 'fb.pushAsked.';
const PREF_PREFIX = 'fb.pushPref.';

// How long Create waits on the first-bet lookup before giving up (no sheet).
export const FIRST_BET_TIMEOUT_MS = 1500;
// How long Log out waits on unregister before signing out anyway.
export const SIGN_OUT_UNREGISTER_MS = 3000;

// In memory: once the sheet has shown (or was declined) this session, it does
// not show again until the app restarts.
let askedThisSession = false;

const PROMPTABLE = ['prompt', 'prompt-with-rationale'];

export function isPromptable(permission) {
  return PROMPTABLE.includes(permission);
}

export function isGranted(permission) {
  return permission === 'granted';
}

async function preferences() {
  const { Preferences } = await import('@capacitor/preferences');
  return Preferences;
}

async function messaging() {
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  return FirebaseMessaging;
}

async function readKey(key) {
  try {
    const { value } = await (await preferences()).get({ key });
    return value || '';
  } catch (err) {
    return '';
  }
}

async function writeKey(key, value) {
  try {
    await (await preferences()).set({ key, value });
  } catch (err) {
    // Nothing persisted: the sheet may ask again next session, never this one.
  }
}

export const readAsked = (uid) => readKey(`${ASKED_PREFIX}${uid}`);
export const readPref = (uid) => readKey(`${PREF_PREFIX}${uid}`);
const writeAsked = (uid, value) => writeKey(`${ASKED_PREFIX}${uid}`, value);
const writePref = (uid, value) => writeKey(`${PREF_PREFIX}${uid}`, value);

// The OS permission: 'granted', 'denied', 'prompt', 'prompt-with-rationale',
// or '' when it could not be read. Never asks.
export async function checkPushPermission() {
  if (!pushAvailable()) return '';
  try {
    const { receive } = await (await messaging()).checkPermissions();
    return receive || '';
  } catch (err) {
    return '';
  }
}

// Asks the OS. Only called from a tap: the sheet's "Turn on notifications"
// or the row's toggle while the permission is still promptable.
async function requestPushPermission() {
  try {
    const { receive } = await (await messaging()).requestPermissions();
    return receive || '';
  } catch (err) {
    return 'error';
  }
}

// Create asks this before it looks the first bet up, so with push off there
// is no extra query and the send goes to the tally as it always has.
export function firstBetCheckPossible() {
  return pushAvailable() && !askedThisSession;
}

// True only when `lookup` answers in time that the creator's bets are just
// this one. A failed or slow lookup is not a first bet (fail closed).
export async function checkFirstBet(lookup, uid, code, timeoutMs = FIRST_BET_TIMEOUT_MS) {
  if (!firstBetCheckPossible() || !uid || !code) return false;
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    return (await Promise.race([Promise.resolve(lookup(uid, code)), timeout])) === true;
  } catch (err) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// The whole show / suppress rule, from facts already gathered. A permission
// that is already 'granted' still shows the sheet when nothing is saved for
// this uid: Android 7 to 12 always report 'granted', and someone who allowed
// notifications at the OS level has still not chosen them in the app.
export function decideOptIn({ enabled, native, firstBet, hasUser, askedThisSession: asked, persisted, permission }) {
  if (!enabled || !native) return false;
  if (!firstBet) return false;
  if (!hasUser) return false;
  if (asked) return false;
  if (persisted === 'granted' || persisted === 'denied') return false;
  if (isGranted(permission)) return !persisted;
  return isPromptable(permission);
}

// Gathers those facts, in an order that touches nothing it doesn't need: no
// plugin call unless push is on, this is the first bet, and nothing in memory
// already says no. Any failure means no sheet.
export async function shouldOfferPushOptIn({ firstBet }) {
  if (!firstBet || askedThisSession || !pushAvailable()) return false;
  try {
    const user = await firebaseUser();
    if (!user) return false;
    const persisted = await readAsked(user.uid);
    if (persisted) return false;
    const permission = await checkPushPermission();
    return decideOptIn({
      enabled: true, native: true, firstBet: true, hasUser: true, askedThisSession, persisted, permission,
    });
  } catch (err) {
    return false;
  }
}

// The sheet is up: it will not show again this session, whatever the answer.
export function noteOptInShown() {
  askedThisSession = true;
}

// "Not now", Escape or the scrim. In memory only, so a later session can still
// turn notifications on from the Notifications row. Never asks the OS.
export function declinePushOptIn() {
  askedThisSession = true;
}

// Saves the OS answer and, on a grant, turns the in-app choice on and
// registers. Returns 'granted', 'denied', or '' for anything else.
async function afterAnswer(uid, answer) {
  if (answer === 'granted') {
    if (uid) {
      await writeAsked(uid, 'granted');
      await writePref(uid, 'on');
    }
    await registerPushToken();
    return 'granted';
  }
  if (answer === 'denied') {
    if (uid) await writeAsked(uid, 'denied');
    return 'denied';
  }
  // 'error' or a prompt that did not settle: nothing saved, nothing stuck.
  return '';
}

// "Turn on notifications": the only time the sheet asks the OS. With the
// permission already granted (Android 7 to 12, or allowed earlier in the OS)
// there is nothing to ask, so it saves the choice and registers. Never throws.
export async function acceptPushOptIn() {
  askedThisSession = true;
  if (!pushAvailable()) return '';
  try {
    const user = await firebaseUser();
    const answer = isGranted(await checkPushPermission()) ? 'granted' : await requestPushPermission();
    return await afterAnswer(user?.uid, answer);
  } catch (err) {
    return '';
  }
}

// The Notifications row's starting state for this uid. Null with push off,
// or when the permission could not be read (the row then renders nothing).
export async function readPushSettings(uid) {
  if (!pushAvailable() || !uid) return null;
  const [permission, pref] = await Promise.all([checkPushPermission(), readPref(uid)]);
  if (!permission) return null;
  return { permission, on: pref === 'on' };
}

// The row's toggle. Turning on with the permission granted registers; while
// it is still promptable the row is the user's opt-in path, so it asks (from
// the tap only). Never asks after a denial. Returns the new { permission, on }.
export async function setPushOn(uid, on) {
  if (!pushAvailable() || !uid) return null;
  try {
    if (!on) {
      await writePref(uid, 'off');
      await unregisterPushToken();
      return { permission: await checkPushPermission(), on: false };
    }
    let permission = await checkPushPermission();
    if (isPromptable(permission)) {
      askedThisSession = true;
      const answer = await afterAnswer(uid, await requestPushPermission());
      permission = answer || (await checkPushPermission());
      return { permission, on: answer === 'granted' };
    }
    if (!isGranted(permission)) return { permission, on: false };
    await writePref(uid, 'on');
    await registerPushToken();
    return { permission, on: true };
  } catch (err) {
    return null;
  }
}

// Back from Settings (App resume): if the permission is now granted and the
// user wants it (the in-app choice is on, or they went to Settings from the
// row to turn it on), save that and register. Never asks.
export async function resyncAfterResume(uid, { wantOn = false } = {}) {
  if (!pushAvailable() || !uid) return null;
  try {
    const permission = await checkPushPermission();
    let on = (await readPref(uid)) === 'on';
    if (isGranted(permission) && (on || wantOn)) {
      if (!on) {
        await writePref(uid, 'on');
        on = true;
      }
      await writeAsked(uid, 'granted');
      await registerPushToken();
    }
    return { permission, on };
  } catch (err) {
    return null;
  }
}

// On an auth change: register this install for the new user if their in-app
// choice is on and the OS already allows it. Never asks.
export async function syncPushForUser(uid) {
  if (!pushAvailable() || !uid) return false;
  try {
    const user = await firebaseUser();
    if (!user || user.uid !== uid) return false;
    if ((await readPref(uid)) !== 'on') return false;
    if (!isGranted(await checkPushPermission())) return false;
    const result = await registerPushToken();
    return Boolean(result?.ok);
  } catch (err) {
    return false;
  }
}

// Log out: drop this install's token from the signed-in user while their ID
// token still works. Bounded, and never throws, so logout is never blocked.
// The in-app choice stays, so signing back in registers again.
export async function unregisterBeforeSignOut(timeoutMs = SIGN_OUT_UNREGISTER_MS) {
  if (!pushAvailable()) return;
  let timer;
  try {
    const user = await firebaseUser();
    if (!user || (await readPref(user.uid)) !== 'on') return;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([unregisterPushToken(), timeout]);
  } catch (err) {
    // Logout goes ahead.
  } finally {
    clearTimeout(timer);
  }
}

// Opens this app's page in the system settings: its notification settings on
// Android, the app's own settings page on iOS (the only one Apple allows).
export async function openPushSettings() {
  if (!pushAvailable()) return false;
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import('capacitor-native-settings');
    await NativeSettings.open({ optionAndroid: AndroidSettings.AppNotification, optionIOS: IOSSettings.App });
    return true;
  } catch (err) {
    return false;
  }
}

// Tests only.
export function resetPushOptInForTests() {
  askedThisSession = false;
}
