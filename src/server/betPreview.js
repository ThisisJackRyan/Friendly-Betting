import { adminDb } from './firebaseAdmin';
import { validCode } from './http';
import { questionOf } from '../phone/model';

// Server only. The link preview for /b/{code} shows the bet's question and
// nothing else: no stakes, no names, no sides or picks.
export const PREVIEW_FALLBACK_TITLE = 'Vote · Friendly';
export const PREVIEW_DESCRIPTION = 'Pick your side on Friendly Bets.';

// The bet's question on one line, or '' for a bad code, a missing bet, or any
// read failure (admin not configured included). Never throws, never logs.
export async function previewQuestion(code) {
  if (!validCode(code)) return '';
  try {
    const snap = await adminDb().collection('bets').doc(code).get();
    if (!snap.exists) return '';
    return questionOf(snap.data()).replace(/\s+/g, ' ');
  } catch (err) {
    return '';
  }
}

export async function voteMetadata(code) {
  const question = await previewQuestion(code);
  const title = question || PREVIEW_FALLBACK_TITLE;
  return {
    title,
    description: PREVIEW_DESCRIPTION,
    openGraph: { title, description: PREVIEW_DESCRIPTION, type: 'website', siteName: 'Friendly Bets' },
    twitter: { card: 'summary_large_image', title, description: PREVIEW_DESCRIPTION },
  };
}
