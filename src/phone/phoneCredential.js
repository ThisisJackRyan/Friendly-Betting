const EXISTING_ACCOUNT = new Set([
  'auth/credential-already-in-use',
  'auth/email-already-in-use',
  'auth/account-exists-with-different-credential',
]);

export function shouldSignIntoExisting(error) {
  return EXISTING_ACCOUNT.has(error?.code);
}

export function phoneAuthMessage(error, fallback) {
  const code = error?.code || '';
  if (code === 'auth/invalid-phone-number' || code === 'auth/missing-phone-number') {
    return 'Check the number and try again.';
  }
  if (code === 'auth/invalid-verification-code' || code === 'auth/invalid-verification-id' || code === 'auth/missing-verification-code') {
    return 'That code didn\u2019t match.';
  }
  if (code === 'auth/code-expired' || code === 'auth/session-expired') {
    return 'That code expired. Resend it.';
  }
  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') {
    return 'Too many tries. Wait a moment.';
  }
  if (code === 'auth/captcha-check-failed' || code === 'auth/invalid-app-credential') {
    return 'Couldn\u2019t confirm this device. Try again.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Phone sign-in isn\u2019t available yet.';
  }
  return fallback;
}

// Prefer linkWithCredential so an anonymous creator keeps the uid already
// stored on bets.createdByID. If that phone already belongs to an account,
// sign into it instead.
export async function upgradeWithPhoneCredential(currentUser, credential, deps) {
  const link = deps.linkWithCredential;
  const signIn = deps.signInWithCredential;
  const fromError = deps.credentialFromError || (() => null);
  const linkable = Boolean(currentUser) && !currentUser.isLocal && !isCreatorUser(currentUser);

  if (linkable) {
    try {
      const result = await link(currentUser, credential);
      return result.user;
    } catch (error) {
      if (error?.code === 'auth/provider-already-linked') return currentUser;
      if (!shouldSignIntoExisting(error)) throw error;
      const existing = fromError(error) || credential;
      const result = await signIn(deps.auth, existing);
      return result.user;
    }
  }

  const result = await signIn(deps.auth, credential);
  return result.user;
}

function isCreatorUser(user) {
  const providers = user?.providerData || [];
  return providers.some((entry) => entry && entry.providerId === 'phone');
}
