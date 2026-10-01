'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FiBarChart2, FiGrid, FiTrendingUp } from 'react-icons/fi';
import { TYPE_META, TYPE_ORDER } from './model';

const TYPE_ICONS = {
  'money-line': FiTrendingUp,
  'over-under': FiBarChart2,
  prop: FiGrid,
};

const TypePicker = ({ onPick }) => {
  const router = useRouter();

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
              className="type-card press"
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
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TypePicker;
