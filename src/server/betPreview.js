import { adminDb } from './firebaseAdmin';
import { validCode } from './http';
import { questionOf } from '../phone/model';
import { isCalledOff, isClosed, isSettled } from '../phone/betStatus';
import { winningSide } from '../phone/settlement';
import { CLOSED_CARD_COPY, LINK_STATUS, closedTitle, withStatus } from '../phone/closedCopy';
import { PROD_ORIGIN } from '../platform/origin';

// Server only. The link preview for /b/{code} shows the bet's question and,
// once the bet is closed, its status: the winning side, called off, or picks
// in. Never stakes, names, picks or counts.
export const PREVIEW_FALLBACK_TITLE = 'Friendly Bets';
export const PREVIEW_DESCRIPTION = 'Pick your side on Friendly Bets.';
export const CARD_ALT = 'Friendly Bets';

const EMPTY = { question: '', status: 'open', side: '' };

// What the card shows for a bet doc: { question, status, side }, status one
// of 'open', 'settled', 'calledOff' or 'closed' (picks in, no result yet:
// past its close time, or closed without a winner). Always from the bet's
// own data, never from a link's ?s=.
export function previewOf(bet, now = Date.now()) {
  if (!bet) return EMPTY;
  const question = questionOf(bet).replace(/\s+/g, ' ').trim();
  if (isCalledOff(bet)) return { question, status: 'calledOff', side: '' };
  const side = isSettled(bet) ? String(winningSide(bet)).replace(/\s+/g, ' ').trim() : '';
  if (side) return { question, status: 'settled', side };
  // A settle whose side can't be read shows as picks in, not a blank winner.
  if (isSettled(bet) || isClosed(bet, now)) return { question, status: 'closed', side: '' };
  return { question, status: 'open', side: '' };
}

// The bet's preview (previewOf), or the empty open one for a bad code, a
// missing bet, or any read failure (admin not configured included). Never
// throws, never logs.
export async function previewBet(code) {
  if (!validCode(code)) return EMPTY;
  try {
    const snap = await adminDb().collection('bets').doc(code).get();
    if (!snap.exists) return EMPTY;
    return previewOf(snap.data());
  } catch (err) {
    return EMPTY;
  }
}

// The bet's question on one line, or '' (see previewBet).
export async function previewQuestion(code) {
  return (await previewBet(code)).question;
}

// The origin preview URLs (og:image included) resolve against: the deployment's
// own URL on preview and development deploys, so their cards come from their
// own code, and the production origin everywhere else.
export function previewOrigin(env = process.env) {
  if (env.VERCEL_ENV !== 'production' && env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return PROD_ORIGIN;
}

// og tags for a closed bet, or null for an open one (or no question). The
// image is the /b/ card with ?s={status}, and og:url is the page with the
// same ?s=, so a status change gets a fresh unfurl and a fresh card cache
// entry. The card itself still reads the status from the bet.
export function closedPreviewTags(code, preview, page = 'b') {
  const copy = CLOSED_CARD_COPY[preview?.status];
  if (!copy || !preview.question) return null;
  const status = LINK_STATUS[preview.status];
  const path = encodeURIComponent(code);
  const title = closedTitle(copy.hero(preview.side), preview.question);
  const description = copy.description;
  const image = {
    url: withStatus(`/b/${path}/opengraph-image`, status),
    width: 1200,
    height: 630,
    type: 'image/png',
    alt: CARD_ALT,
  };
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Friendly Bets',
      url: withStatus(`/${page}/${path}`, status),
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export async function voteMetadata(code) {
  const preview = await previewBet(code);
  const closed = closedPreviewTags(code, preview, 'b');
  if (closed) return closed;
  const title = preview.question || PREVIEW_FALLBACK_TITLE;
  return {
    title,
    description: PREVIEW_DESCRIPTION,
    openGraph: { title, description: PREVIEW_DESCRIPTION, type: 'website', siteName: 'Friendly Bets' },
    twitter: { card: 'summary_large_image', title, description: PREVIEW_DESCRIPTION },
  };
}

// /t/{code}, the link in the result SMS. An open bet keeps the tally's plain
// title and no card, as before; a closed one gets the closed og tags, with
// the /b/ card as its image. The page title stays the tally's.
export async function tallyMetadata(code, pageTitle) {
  const closed = closedPreviewTags(code, await previewBet(code), 't');
  if (!closed) return { title: pageTitle };
  return { title: pageTitle, openGraph: closed.openGraph, twitter: closed.twitter };
}
