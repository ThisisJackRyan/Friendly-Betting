import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TYPE_META, TYPE_ORDER } from './model';

const TypePicker = () => {
  const navigate = useNavigate();

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
              onClick={() => navigate(`/new/${id}`)}
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
