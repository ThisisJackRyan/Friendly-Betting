'use client';

import { useEffect, useId, useState } from 'react';
import { formatUsNational } from './creatorSession';
import { RESULT_TEXT_COPY } from './resultTextCopy';
import { normalizeE164, saveResultText } from './resultTexts';

const storageKey = (code) => `fb.resultText.${code}`;

function readChoice(code) {
  try {
    return localStorage.getItem(storageKey(code)) || '';
  } catch (err) {
    return '';
  }
}

function isOffline(err) {
  if (err?.code === 'network') return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function saveError(err) {
  if (err?.code === 'invalid-phone') return RESULT_TEXT_COPY.invalid;
  if (isOffline(err)) return RESULT_TEXT_COPY.offline;
  return RESULT_TEXT_COPY.saveFailed;
}

function rememberChoice(code, value) {
  try {
    localStorage.setItem(storageKey(code), value);
  } catch (err) {
    // Private mode can block storage; the card just shows again next visit.
  }
}

// Optional and skippable. Voting never waits on this card, and a failed save
// never touches the recorded vote.
const ResultTextCard = ({ code }) => {
  const [choice, setChoice] = useState(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorId = useId();

  useEffect(() => {
    setChoice(readChoice(code));
  }, [code]);

  if (choice === null || choice === 'skipped') return null;

  if (choice === 'saved') {
    return (
      <div className="result-text-card">
        <p className="muted" role="status">{RESULT_TEXT_COPY.confirmed}</p>
      </div>
    );
  }

  const skip = () => {
    rememberChoice(code, 'skipped');
    setChoice('skipped');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const e164 = normalizeE164(phone);
    if (!e164) {
      setError(RESULT_TEXT_COPY.invalid);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await saveResultText(code, e164);
      rememberChoice(code, 'saved');
      setChoice('saved');
    } catch (err) {
      setError(saveError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="result-text-card" onSubmit={submit} noValidate>
      <h2>{RESULT_TEXT_COPY.heading}</h2>
      <label className="field">
        <span className="phone-field">
          <span className="phone-cc">+1</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            name="result-phone"
            aria-label={RESULT_TEXT_COPY.heading}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder={RESULT_TEXT_COPY.placeholder}
            value={phone}
            disabled={busy}
            onChange={(event) => {
              setError('');
              setPhone(formatUsNational(event.target.value));
            }}
          />
        </span>
      </label>
      {error && (
        <p id={errorId} className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="muted result-text-privacy">{RESULT_TEXT_COPY.privacy}</p>
      <button type="submit" className="cta press" disabled={busy}>
        {busy ? RESULT_TEXT_COPY.saving : RESULT_TEXT_COPY.button}
      </button>
      <button type="button" className="text-link result-text-skip" onClick={skip}>
        {RESULT_TEXT_COPY.skip}
      </button>
    </form>
  );
};

export default ResultTextCard;
