export function isCreator(user) {
  if (!user || user.isLocal) return false;
  const providers = user.providerData || [];
  return providers.some((entry) => entry && entry.providerId === 'phone');
}

export function settleBlock(user, bet) {
  if (!bet) return 'This bet is gone.';
  if (!isCreator(user)) return 'Sign in with your phone to settle.';
  if (user.uid !== bet.createdByID) return 'Only the creator can settle this bet.';
  if (bet.status === 'closed') return 'This bet is already settled.';
  return '';
}
