import { PRO_COPY } from './proConfig';

export function badgeLabel(badge) {
  return badge ? PRO_COPY.pro : '';
}

// A small pill after the member's own name. `badge` comes from badgeFor().
export default function ProBadge({ badge }) {
  if (!badge) return null;
  return <span className="pro-badge">{badgeLabel(badge)}</span>;
}
