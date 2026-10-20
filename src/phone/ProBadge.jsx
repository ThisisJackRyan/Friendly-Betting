import { PRO_COPY } from './proConfig';

export function badgeLabel(badge) {
  if (!badge) return '';
  if (badge.kind !== 'founder') return PRO_COPY.pro;
  return badge.number ? PRO_COPY.founderNumber(badge.number) : PRO_COPY.founderBadge;
}

// A small pill after the member's own name. `badge` comes from badgeFor().
export default function ProBadge({ badge }) {
  if (!badge) return null;
  return <span className={`pro-badge pro-badge-${badge.kind}`}>{badgeLabel(badge)}</span>;
}
