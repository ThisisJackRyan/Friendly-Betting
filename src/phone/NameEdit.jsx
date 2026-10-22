'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { NAME_EDIT_COPY, NAME_PLACEHOLDER } from './nameEditCopy';
import { cleanName, NAME_MAX } from './votes';

// A small add/edit name control under "You’re on ...". onSave(name) changes
// only the name on the voter's pick; when it throws, the old name stays and
// the form stays open with an error.
export default function NameEdit({ current = '', onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const toggle = useRef(null);
  const returnFocus = useRef(false);
  const inputId = useId();

  useEffect(() => {
    if (editing) input.current?.focus();
    else if (returnFocus.current) toggle.current?.focus();
    returnFocus.current = false;
  }, [editing]);

  const open = () => {
    setValue(current);
    setError('');
    setEditing(true);
  };
  const close = () => {
    returnFocus.current = true;
    setEditing(false);
    setError('');
  };

  const trimmed = cleanName(value);
  const save = async (event) => {
    event.preventDefault();
    if (saving || trimmed === current) return;
    setSaving(true);
    setError('');
    try {
      await onSave(trimmed);
      close();
    } catch {
      setError(NAME_EDIT_COPY.saveError);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="name-edit">
        <button
          ref={toggle}
          type="button"
          className="name-edit-toggle"
          aria-label={current ? NAME_EDIT_COPY.editLabel(current) : undefined}
          onClick={open}
        >
          {current ? NAME_EDIT_COPY.edit : NAME_EDIT_COPY.add}
        </button>
      </div>
    );
  }

  return (
    <form className="name-edit name-edit-open" onSubmit={save}>
      <label className="field" htmlFor={inputId}>
        <span className="field-label">{NAME_EDIT_COPY.label}</span>
        <input
          ref={input}
          id={inputId}
          value={value}
          placeholder={NAME_PLACEHOLDER}
          autoComplete="nickname"
          maxLength={NAME_MAX}
          disabled={saving}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !saving) close();
          }}
        />
      </label>
      <div className="name-edit-actions">
        <button type="submit" className="secondary press" disabled={saving || trimmed === current}>
          {saving ? NAME_EDIT_COPY.saving : NAME_EDIT_COPY.save}
        </button>
        <button type="button" className="name-edit-toggle" disabled={saving} onClick={close}>
          {NAME_EDIT_COPY.cancel}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
