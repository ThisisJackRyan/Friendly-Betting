// Shared by the vote card and the API route, so nothing here loads the client
// Firebase SDK at import time.
export function normalizeE164(input) {
  const raw = String(input || '').trim();
  const digits = raw.replace(/\D/g, '');
  let e164 = '';
  // A leading + is already international, even with 10 digits (+49 30 123456).
  if (raw.startsWith('+')) e164 = digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  else if (digits.length === 10) e164 = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith('1')) e164 = `+${digits}`;
  if (!e164) return '';
  if (e164.startsWith('+1')) {
    const national = e164.slice(2);
    // NANP area codes and exchanges never start with 0 or 1.
    if (national.length !== 10 || /[01]/.test(national[0]) || /[01]/.test(national[3])) return '';
  }
  return e164;
}

// Off until the SMS provider and Admin credentials are configured.
export function resultTextsEnabled() {
  return process.env.NEXT_PUBLIC_RESULT_TEXTS === '1';
}

export async function saveResultText(code, phone) {
  // The voter's existing anonymous user. Never sign in or create one here.
  const { auth } = await import('../Config/firebase-config');
  const user = auth?.currentUser;
  if (!user) throw new Error('Still connecting. Try again.');
  const token = await user.getIdToken();
  const res = await fetch(`/api/bets/${encodeURIComponent(code)}/result-texts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ phone }),
  });
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  const invalid = res.status === 400 && body?.error === 'invalid-phone';
  const err = new Error(invalid ? 'That phone number is not valid.' : 'Could not save that number.');
  err.code = invalid ? 'invalid-phone' : 'save-failed';
  throw err;
}

export function requestResultTexts(code) {
  if (!resultTextsEnabled()) return;
  try {
    const sent = fetch(`/api/bets/${encodeURIComponent(code)}/result-texts/send`, { method: 'POST' });
    if (sent && typeof sent.catch === 'function') sent.catch(() => {});
  } catch (err) {
    // Texts are a bonus. Settling never waits on or fails because of them.
  }
}
