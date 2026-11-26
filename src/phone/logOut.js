import { signOutCreator } from './creatorAuth';

// Log out lives in the Account sheet (AccountMenu), but My bets owns the live
// bets listener that has to close first: once Auth goes null an open query
// fails with permission-denied, which would flash the load error. Screens
// register { before, failed } here; logOut runs every `before` synchronously,
// signs out, and tells every `failed` if that did not work.
const hooks = new Set();

export function onLogOut(hook) {
  hooks.add(hook);
  return () => hooks.delete(hook);
}

export async function logOut() {
  [...hooks].forEach((hook) => hook.before?.());
  try {
    await signOutCreator();
  } catch (err) {
    [...hooks].forEach((hook) => hook.failed?.(err));
    throw err;
  }
}
