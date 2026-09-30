'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TYPE_META, TYPE_ORDER } from './model';

const TypePicker = () => {
  const router = useRouter();

  useEffect(() => {
    document.title = 'New bet · Friendly';
  }, []);

  return (
    <div className="stack">
      <p className="wordmark">Friendly</p>
      <h1 className="screen-title">New bet</h1>
      <div className="type-list">
        {TYPE_ORDER.map((id) => {
          const meta = TYPE_META[id];
          return (
            <button
              key={id}
              type="button"
              className="type-card press"
              onClick={() => router.push(`/new/${id}`)}
            >
              <span className="type-card-title">{meta.label}</span>
              <span className="type-card-hint">{meta.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TypePicker;
