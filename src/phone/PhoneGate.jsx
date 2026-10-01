'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FiChevronLeft } from 'react-icons/fi';
import { isCreator } from './creator';
import { confirmPhoneCode, sendPhoneCode } from './phoneAuth';
import { phoneAuthMessage } from './phoneCredential';
import { maskPhone, nationalFromInput, phoneFieldValue, toE164 } from './phoneNumber';

const COPY = {
  lead: 'We\'ll text a code.',
  note: 'Friends still vote with one tap \u2014 no account.',
  send: 'Send code',
  sending: 'Sending\u2026',
  verify: 'Verify',
  verifying: 'Verifying\u2026',
  resend: 'Resend',
  change: 'Change number',
  phoneTitle: 'Phone',
  codeTitle: 'Code',
};

function sentCopy(e164) {
  return `Code sent to ${maskPhone(e164)}.`;
}

function CodeBoxes({ digits, onDigits, disabled }) {
  const refs = useRef([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const focusAt = (index) => {
    const box = refs.current[Math.min(Math.max(index, 0), 5)];
    box?.focus();
  };

  const writeFrom = (index, raw) => {
    const incoming = String(raw || '').replace(/\D/g, '');
    if (!incoming) {
      onDigits((current) => {
        const next = current.slice();
        next[index] = '';
        return next;
      });
      return;
    }
    if (incoming.length === 1) {
      onDigits((current) => {
        const next = current.slice();
        next[index] = incoming;
        return next;
      });
      if (index < 5) focusAt(index + 1);
      return;
    }
    onDigits((current) => {
      const next = current.slice();
      incoming.slice(0, 6 - index).split('').forEach((digit, offset) => {
        next[index + offset] = digit;
      });
      return next;
    });
    focusAt(Math.min(index + incoming.length, 5));
  };

  return (
    <div className="code-boxes" role="group" aria-label="Verification code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          className="code-box"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1} of 6`}
          value={digit}
          maxLength={1}
          disabled={disabled}
          onChange={(event) => writeFrom(index, event.target.value)}
          onPaste={(event) => {
            const text = event.clipboardData?.getData('text') || '';
            if (!text) return;
            event.preventDefault();
            writeFrom(index, text);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digits[index] && index > 0) {
              event.preventDefault();
              onDigits((current) => {
                const next = current.slice();
                next[index - 1] = '';
                return next;
              });
              focusAt(index - 1);
            }
            if (event.key === 'ArrowLeft' && index > 0) {
              event.preventDefault();
              focusAt(index - 1);
            }
            if (event.key === 'ArrowRight' && index < 5) {
              event.preventDefault();
              focusAt(index + 1);
            }
          }}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}

const PhoneGate = ({
  onVerified,
  onBack,
  onHomeClick,
  layout = 'screen',
}) => {
  const containerRef = useRef(null);
  const phoneRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const node = document.createElement('div');
    node.className = 'phone-recaptcha';
    document.body.appendChild(node);
    containerRef.current = node;
    return () => {
      node.remove();
      if (containerRef.current === node) containerRef.current = null;
    };
  }, []);
  const [phase, setPhase] = useState('number');
  const [national, setNational] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [verificationId, setVerificationId] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const node = rootRef.current;
    if (!node || node.closest('[aria-hidden="true"]')) return undefined;
    document.title = `${phase === 'code' ? COPY.codeTitle : COPY.phoneTitle} · Friendly`;
    return undefined;
  }, [phase]);

  useEffect(() => {
    if (phase === 'number') phoneRef.current?.focus();
  }, [phase]);

  const deliver = async (e164) => {
    setSending(true);
    setError('');
    try {
      const id = await sendPhoneCode(e164, containerRef.current);
      setVerificationId(id);
      setSentTo(e164);
      setDigits(['', '', '', '', '', '']);
      setPhase('code');
    } catch (err) {
      setError(phoneAuthMessage(err, 'Couldn\u2019t send a code. Try again.'));
    } finally {
      setSending(false);
    }
  };

  const onSend = () => {
    const e164 = toE164(national);
    if (!e164) {
      setError('Add a 10-digit US number.');
      return;
    }
    deliver(e164);
  };

  const onResend = () => {
    if (!sentTo || sending || verifying) return;
    deliver(sentTo);
  };

  const onChangeNumber = () => {
    setPhase('number');
    setDigits(['', '', '', '', '', '']);
    setVerificationId('');
    setError('');
  };

  const onVerify = async () => {
    const code = digits.join('');
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setVerifying(true);
    setError('');
    try {
      const next = await confirmPhoneCode(verificationId, code);
      if (!isCreator(next)) {
        setError('Couldn\u2019t verify that code. Try again.');
        return;
      }
      onVerified(next);
    } catch (err) {
      setError(phoneAuthMessage(err, 'Couldn\u2019t verify that code. Try again.'));
    } finally {
      setVerifying(false);
    }
  };

  const handleBack = () => {
    if (phase === 'code') {
      onChangeNumber();
      return;
    }
    if (onBack) onBack();
  };

  const body = phase === 'number' ? (
    <>
      <p className="phone-lead">{COPY.lead}</p>
      <p className="phone-note">{COPY.note}</p>
      <label className="field" htmlFor="creator-phone">
        <input
          id="creator-phone"
          ref={phoneRef}
          inputMode="tel"
          autoComplete="tel"
          aria-label="Phone number"
          value={phoneFieldValue(national)}
          onChange={(event) => {
            setError('');
            setNational(nationalFromInput(event.target.value));
            const input = event.target;
            requestAnimationFrame(() => {
              const end = input.value.length;
              try {
                input.setSelectionRange(end, end);
              } catch (err) {
                // Some input modes reject a selection range.
              }
            });
          }}
          onFocus={(event) => {
            const end = event.target.value.length;
            try {
              event.target.setSelectionRange(end, end);
            } catch (err) {
              // Some mobile keyboards reject a selection range.
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSend();
            }
          }}
        />
      </label>
    </>
  ) : (
    <>
      <p className="phone-sent">{sentCopy(sentTo)}</p>
      <CodeBoxes digits={digits} onDigits={setDigits} disabled={verifying || sending} />
    </>
  );

  const primary = phase === 'number' ? (
    <button
      type="button"
      className="cta press"
      disabled={sending}
      onClick={onSend}
    >
      {sending ? COPY.sending : COPY.send}
    </button>
  ) : (
    <button
      type="button"
      className="cta press"
      disabled={verifying || sending}
      onClick={onVerify}
    >
      {verifying ? COPY.verifying : COPY.verify}
    </button>
  );

  const secondary = phase === 'code' ? (
    <p className="auth-switch">
      <button
        type="button"
        className="auth-text"
        disabled={sending || verifying}
        onClick={onResend}
      >
        {sending ? COPY.sending : COPY.resend}
      </button>
      <span className="auth-dot" aria-hidden="true">{' \u00b7 '}</span>
      <button
        type="button"
        className="auth-text"
        disabled={verifying}
        onClick={onChangeNumber}
      >
        {COPY.change}
      </button>
    </p>
  ) : null;

  const alert = error ? <p className="form-error" role="alert">{error}</p> : null;

  if (layout === 'plain') {
    return (
      <div className="phone-gate" ref={rootRef}>
        <p className="wordmark">Friendly</p>
        {body}
        {alert}
        {primary}
        {secondary}
      </div>
    );
  }

  return (
    <>
      <div className="nav-row" ref={rootRef}>
        <button type="button" className="icon-btn" aria-label="Back" onClick={handleBack}>
          <FiChevronLeft size={28} />
        </button>
        <h1 className="nav-title">{phase === 'code' ? COPY.codeTitle : COPY.phoneTitle}</h1>
        {onHomeClick ? (
          <Link href="/" className="nav-home wordmark" onClick={onHomeClick}>
            Friendly
          </Link>
        ) : null}
      </div>
      <div className="scroll">
        {body}
        {alert}
      </div>
      <div className="cta-bar">
        {primary}
        {secondary}
      </div>
    </>
  );
};

export default PhoneGate;
