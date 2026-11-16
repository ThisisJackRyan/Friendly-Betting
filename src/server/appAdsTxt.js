import { GOOGLE_TEST_PUBLISHER } from '../ads/config';

// Builds the body of https://www.friendly-bets.com/app-ads.txt (docs/ADS.md).
// The IAB app-ads.txt format is the ads.txt v1.1 format: one record per line,
// `#` starts a comment.

// Google's certification authority ID for AdMob. A fixed constant published by
// Google, the same for every AdMob account. Not a publisher ID.
export const GOOGLE_TAG_ID = 'f08c47fec0942fa0';

// ads.txt v1.1 section 3.2.1: a file with no authorized sellers must still
// carry one well-formed record so crawlers can tell it apart from an error
// page. This is the spec's reserved placeholder (RFC 6761 example.com). It
// authorizes nobody.
export const PLACEHOLDER_RECORD = 'placeholder.example.com, placeholder, DIRECT, placeholder';

// Checked in this order. The first valid ID wins.
export const PUBLISHER_ENV_VARS = ['ADMOB_PUBLISHER_ID', 'NEXT_PUBLIC_ADMOB_PUBLISHER_ID'];

// AdMob publisher IDs are `pub-` plus 16 digits. The AdMob console also shows
// them as `ca-app-pub-...`; that prefix is accepted and dropped.
const PUBLISHER_ID = /^(?:ca-app-)?(pub-\d{16})$/;
const TEST_PUBLISHER = GOOGLE_TEST_PUBLISHER.replace(/^ca-app-/, '');

// Returns `pub-...` or null. Never returns Google's test publisher.
export function normalizePublisherId(value) {
  if (typeof value !== 'string') return null;
  const match = PUBLISHER_ID.exec(value.trim());
  if (!match || match[1] === TEST_PUBLISHER) return null;
  return match[1];
}

export function publisherIdFromEnv(env = process.env) {
  for (const name of PUBLISHER_ENV_VARS) {
    const id = normalizePublisherId(env[name]);
    if (id) return id;
  }
  return null;
}

export function appAdsTxt(env = process.env) {
  const id = publisherIdFromEnv(env);
  if (id) return `google.com, ${id}, DIRECT, ${GOOGLE_TAG_ID}\n`;
  return [
    '# Friendly Bets has no authorized ad sellers yet.',
    PLACEHOLDER_RECORD,
    '',
  ].join('\n');
}
