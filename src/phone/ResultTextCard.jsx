'use client';

import { useEffect, useState } from 'react';
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

function rememberChoice(code, value) {
  try {
    localStorage.setItem(storageKey(code), value);
  } catch (err) {
    // Private mode can block storage; the card just shows again next visit.
  }
}

// Optional and skippable. Voting never waits on this card.
const ResultTextCard = ({ code }) => {
  const [choice, setChoice] = useState(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      setError(err?.code === 'invalid-phone' ? RESULT_TEXT_COPY.invalid : RESULT_TEXT_COPY.saveFailed);
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
            placeholder={RESULT_TEXT_COPY.placeholder}
            value={phone}
            disabled={busy}
            onChange={(event) => setPhone(formatUsNational(event.target.value))}
          />
        </span>
      </label>
      <p className="muted result-text-privacy">{RESULT_TEXT_COPY.privacy}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
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
