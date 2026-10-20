'use client';

import { useEffect } from 'react';
import { useRouter } from '../platform/navigation';
import { FiArrowUpRight, FiBarChart2, FiGrid, FiStar, FiTrendingUp } from 'react-icons/fi';
import { TYPE_META, TYPE_ORDER } from './model';
import { EARLY_ACCESS_TYPES, proEarlyTypesEnabled } from './proConfig';
import { useEntitlementState } from './useEntitlement';
import ProBadge from './ProBadge';

const TYPE_ICONS = {
  'money-line': FiTrendingUp,
  'over-under': FiBarChart2,
  prop: FiGrid,
};

const TYPE_EXAMPLES = {
  'money-line': '“Who wins tonight?”',
  'over-under': '“Over or under 90?”',
  prop: '“Who shows up last?”',
};

// Early-access types (proConfig) follow the regular ones, only with
// NEXT_PUBLIC_PRO_EARLY_TYPES=1 and only for a Pro member. `earlyTypes` is
// for tests.
export function visibleEarlyTypes({ isPro, earlyTypes = EARLY_ACCESS_TYPES }) {
  return proEarlyTypesEnabled() && isPro ? earlyTypes : [];
}

const TypePicker = ({ onPick, earlyTypes = EARLY_ACCESS_TYPES }) => {
  const router = useRouter();
  const { isPro } = useEntitlementState();
  const early = visibleEarlyTypes({ isPro, earlyTypes });

  useEffect(() => {
    if (onPick) return undefined;
    document.title = 'New bet · Friendly';
    return undefined;
  }, [onPick]);

  return (
    <div className="stack">
      {!onPick && (
        <>
          <p className="wordmark">Friendly</p>
          <h1 className="screen-title">New bet</h1>
        </>
      )}
      <p className="section-label">Pick a type</p>
      <div className="type-list">
        {TYPE_ORDER.map((id) => {
          const meta = TYPE_META[id];
          const Icon = TYPE_ICONS[id];
          return (
            <button
              key={id}
              type="button"
              className={`type-card press type-${id}`}
              onClick={() => {
                if (onPick) onPick(id);
                else router.push(`/new/${id}`);
              }}
            >
              <span className="type-card-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <span className="type-card-copy">
                <span className="type-card-title">{meta.label}</span>
                <span className="type-card-hint">{meta.hint}</span>
                <span className="type-card-example">{TYPE_EXAMPLES[id]}</span>
              </span>
              <FiArrowUpRight className="type-card-arrow" size={20} aria-hidden="true" />
            </button>
          );
        })}
        {early.map((type) => (
          <button
            key={type.id}
            type="button"
            className={`type-card press type-early type-${type.id}`}
            onClick={() => {
              if (onPick) onPick(type.id);
              else router.push(`/new/${type.id}`);
            }}
          >
            <span className="type-card-icon" aria-hidden="true">
              <FiStar size={22} />
            </span>
            <span className="type-card-copy">
              <span className="type-card-title">
                {type.label}
                <ProBadge badge={{ kind: 'pro' }} />
              </span>
              <span className="type-card-hint">{type.hint}</span>
              {type.example && <span className="type-card-example">{type.example}</span>}
            </span>
            <FiArrowUpRight className="type-card-arrow" size={20} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default TypePicker;
