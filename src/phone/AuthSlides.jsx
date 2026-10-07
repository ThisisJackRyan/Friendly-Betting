'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { FiChevronLeft } from 'react-icons/fi';
import { mountPhoneCheck, releasePhoneCheck, sendPhoneCode, verifyPhoneCode } from './creatorAuth';
import { SLIDE_MS } from './createMotion';
import {
  AUTH_COPY,
  codeSentCopy,
  formatUsNational,
  nationalDigits,
  phoneError,
  SEND_CODE_ERROR,
  toE164Us,
  VERIFY_CODE_ERROR,
} from './creatorSession';

export function useCreatorPhone() {
  const containerRef = useRef(null);
  const verifying = useRef(false);
  const sending = useRef(false);
  const attempted = useRef('');
  const [digitsRaw, setDigitsRaw] = useState('');
  const [e164, setE164] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(null);
  const [error, setErrorState] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [verifiedUser, setVerifiedUser] = useState(null);

  const setError = (message) => {
    setErrorState(message);
    setErrorCode('');
  };

  const showPhoneError = (err, fallback) => {
    const next = phoneError(err, fallback);
    setErrorState(next.message);
    setErrorCode(next.code);
  };

  const onNational = (value) => {
    setError('');
    setDigitsRaw(nationalDigits(value));
  };

  const send = async () => {
    if (sending.current) return false;
    const next = toE164Us(digitsRaw);
    if (!next) {
      setError('Enter a US phone number.');
      return false;
    }
    const container = containerRef.current;
    sending.current = true;
    setBusy('send');
    setError('');
    try {
      const id = await sendPhoneCode(next, container);
      setVerificationId(id);
      setE164(next);
      setOtp(['', '', '', '', '', '']);
      attempted.current = '';
      return true;
    } catch (err) {
      showPhoneError(err, SEND_CODE_ERROR);
      return false;
    } finally {
      sending.current = false;
      setBusy(null);
    }
  };

  const verify = async (code) => {
    if (verifiedUser) return verifiedUser;
    const token = (code || otp.join('')).replace(/\D/g, '');
    if (token.length !== 6) {
      setError('Enter the 6-digit code.');
      return null;
    }
    if (!verificationId) {
      setError('Send a new code.');
      return null;
    }
    if (verifying.current) return null;
    verifying.current = true;
    setBusy('verify');
    setError('');
    try {
      const nextUser = await verifyPhoneCode(verificationId, token);
      setVerifiedUser(nextUser);
      return nextUser;
    } catch (err) {
      attempted.current = '';
      showPhoneError(err, VERIFY_CODE_ERROR);
      return null;
    } finally {
      verifying.current = false;
      setBusy(null);
    }
  };

  const onOtp = (next, completed) => {
    setError('');
    setOtp(next);
    if (!completed || completed === attempted.current || verifying.current) return;
    attempted.current = completed;
    verify(completed);
  };

  useEffect(() => {
    const stopSubmit = (event) => {
      event.preventDefault();
    };
    document.addEventListener('submit', stopSubmit, true);
    return () => {
      document.removeEventListener('submit', stopSubmit, true);
      releasePhoneCheck();
    };
  }, []);

  return {
    containerRef,
    digitsRaw,
    formatted: formatUsNational(digitsRaw),
    e164,
    otp,
    busy,
    error,
    errorCode,
    setError,
    onNational,
    onOtp,
    send,
    verify,
    readyPhone: nationalDigits(digitsRaw).length === 10,
    readyCode: otp.every(Boolean),
    verifiedUser,
  };
}

export function PhoneAlert({ error, code }) {
  if (!error) return null;
  return (
    <>
      <p className="form-error" role="alert">
        {error}
      </p>
      {code ? <p className="muted phone-error-code">{code}</p> : null}
    </>
  );
}

let phoneSlot = null;
let phonePark = null;

function phoneSlotNode() {
  if (!phoneSlot) {
    phoneSlot = document.createElement('div');
    phoneSlot.className = 'recaptcha-slot';
  }
  return phoneSlot;
}

function parkPhoneSlot(slot) {
  if (!phonePark) {
    phonePark = document.createElement('div');
    phonePark.hidden = true;
  }
  if (!phonePark.isConnected && document.body) document.body.appendChild(phonePark);
  phonePark.appendChild(slot);
}

export function PersonCheck({ containerRef }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const slot = phoneSlotNode();
    host.appendChild(slot);
    containerRef.current = slot;
    Promise.resolve(mountPhoneCheck(slot)).catch(() => {
      // Send still tries. A failed check uses the same human sentence.
    });
    return () => {
      // Keep the solved iframe alive. Removing it reloads the page on iPhone.
      if (slot.isConnected) parkPhoneSlot(slot);
    };
  }, [containerRef]);

  return <div ref={hostRef} className="person-check" />;
}

export function PhoneBody({ formatted, onNational, busy, check }) {
  return (
    <>
      <label className="field" htmlFor="creator-phone">
        <span className="field-label">Phone</span>
        <span className="phone-field">
          <span className="phone-cc">+1</span>
          <input
            id="creator-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            name="phone"
            placeholder={AUTH_COPY.phonePlaceholder}
            value={formatted}
            disabled={busy === 'send'}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
            onChange={(event) => onNational(event.target.value)}
          />
        </span>
      </label>
      <p className="field-hint">{AUTH_COPY.textLine}</p>
      <p className="field-hint">{AUTH_COPY.bettorLine}</p>
      {check || null}
    </>
  );
}

export function CodeBody({ e164, otp, onOtp, onResend, onChangeNumber, busy, check }) {
  const refs = useRef([]);

  const write = (index, raw) => {
    const chars = String(raw || '').replace(/\D/g, '');
    if (!chars) {
      const cleared = otp.slice();
      cleared[index] = '';
      onOtp(cleared, '');
      return;
    }
    const next = otp.slice();
    chars
      .slice(0, 6 - index)
      .split('')
      .forEach((char, offset) => {
        next[index + offset] = char;
      });
    const completed = next.every(Boolean) ? next.join('') : '';
    onOtp(next, completed);
    if (!completed) {
      const focusAt = Math.min(index + chars.length, 5);
      refs.current[focusAt]?.focus();
    }
  };

  return (
    <>
      <div className="otp-row" role="group" aria-label="6-digit code">
        {otp.map((digit, index) => (
          <input
            key={`digit-${index}`}
            ref={(node) => {
              refs.current[index] = node;
            }}
            className="otp-cell"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${index + 1}`}
            value={digit}
            disabled={Boolean(busy)}
            onChange={(event) => write(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !otp[index] && index > 0) {
                event.preventDefault();
                const next = otp.slice();
                next[index - 1] = '';
                onOtp(next, '');
                refs.current[index - 1]?.focus();
              }
            }}
            onPaste={(event) => {
              const text = event.clipboardData?.getData('text') || '';
              if (!text) return;
              event.preventDefault();
              write(index, text);
            }}
          />
        ))}
      </div>
      <p className="field-hint">{codeSentCopy(e164)}</p>
      {check || null}
      <p className="otp-links">
        <button type="button" disabled={Boolean(busy)} onClick={onResend}>
          {busy === 'send' ? AUTH_COPY.sending : AUTH_COPY.resend}
        </button>
        <span className="otp-dot" aria-hidden="true">
          ·
        </span>
        <button type="button" disabled={Boolean(busy)} onClick={onChangeNumber}>
          {AUTH_COPY.change}
        </button>
      </p>
    </>
  );
}

export function SendButton({ busy, ready, onSend }) {
  return (
    <button
      type="button"
      className="cta press"
      disabled={busy === 'send'}
      aria-disabled={!ready && busy !== 'send' ? true : undefined}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSend();
      }}
    >
      {busy === 'send' ? AUTH_COPY.sending : AUTH_COPY.send}
    </button>
  );
}

export function VerifyButton({ busy, ready, onVerify }) {
  return (
    <button
      type="button"
      className="cta press"
      disabled={Boolean(busy)}
      aria-disabled={!ready && !busy ? true : undefined}
      onClick={onVerify}
    >
      {busy === 'verify' ? AUTH_COPY.verifying : AUTH_COPY.verify}
    </button>
  );
}

function paneClass(active, motion, hasMoved) {
  const names = ['create-pane', 'form-fill'];
  if (!active) names.push('is-leaving', `slide-${motion}`);
  else if (hasMoved) names.push('is-entering', `slide-${motion}`);
  return names.join(' ');
}

function AuthChrome({ title, onBack, children, cta }) {
  return (
    <>
      <div className="nav-row">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <FiChevronLeft size={28} />
        </button>
        <h1 className="nav-title">{title}</h1>
        <Link href="/" className="nav-home wordmark">
          Friendly
        </Link>
      </div>
      <div className="scroll">
        {title === AUTH_COPY.phoneTitle ? null : (
          <div className="page-intro auth-intro">
            <p className="eyebrow">YOUR FRIENDLY CLUBHOUSE</p>
            <h2>You’re one text away.</h2>
            <p className="intro-copy">Enter the six-digit code we sent to your phone.</p>
          </div>
        )}
        {children}
      </div>
      {cta ? <div className="cta-bar">{cta}</div> : null}
    </>
  );
}

export default function CreatorAuthFlow({ onCancel, renderDone }) {
  const phone = useCreatorPhone();
  const [step, setStep] = useState(1);
  const [leaving, setLeaving] = useState(null);
  const [motion, setMotion] = useState('forward');
  const [hasMoved, setHasMoved] = useState(false);
  const [doneUser, setDoneUser] = useState(null);
  const [host, setHost] = useState(null);
  const anchorRef = useRef(null);
  const advanced = useRef(false);
  const phoneRef = useRef(phone);
  phoneRef.current = phone;

  useEffect(() => {
    const node = anchorRef.current?.closest('.phone');
    if (node) setHost(node);
  }, []);

  useEffect(() => {
    if (leaving == null) return undefined;
    const id = window.setTimeout(() => setLeaving(null), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [leaving, step]);

  const go = (next) => {
    if (next === step || next < 1 || next > 3) return;
    setMotion(next > step ? 'forward' : 'back');
    setLeaving(step);
    setHasMoved(true);
    phoneRef.current.setError('');
    setStep(next);
  };

  const onSend = async () => {
    const sent = await phoneRef.current.send();
    if (sent) go(2);
  };

  const onResend = async () => {
    await phoneRef.current.send();
  };

  useEffect(() => {
    if (!phone.verifiedUser || advanced.current || !renderDone) return;
    advanced.current = true;
    setDoneUser(phone.verifiedUser);
    setMotion('forward');
    setLeaving(2);
    setHasMoved(true);
    setStep(3);
  }, [phone.verifiedUser, renderDone]);

  const onBack = (stepNumber) => {
    if (stepNumber <= 1) {
      if (onCancel) onCancel();
      return;
    }
    if (stepNumber === 3) {
      if (onCancel) onCancel();
      return;
    }
    go(stepNumber - 1);
  };

  const renderStep = (stepNumber) => {
    if (stepNumber === 3) {
      return renderDone ? renderDone(doneUser) : null;
    }
    if (stepNumber === 2) {
      return (
        <AuthChrome
          title={AUTH_COPY.codeTitle}
          onBack={() => onBack(2)}
          cta={
            <VerifyButton
              busy={phone.busy}
              ready={phone.readyCode}
              onVerify={() => phoneRef.current.verify()}
            />
          }
        >
          <CodeBody
            e164={phone.e164}
            otp={phone.otp}
            onOtp={phone.onOtp}
            onResend={onResend}
            onChangeNumber={() => go(1)}
            busy={phone.busy}
            check={step === 2 ? <PersonCheck containerRef={phone.containerRef} /> : null}
          />
          <PhoneAlert error={phone.error} code={phone.errorCode} />
        </AuthChrome>
      );
    }
    return (
      <AuthChrome
        title={AUTH_COPY.phoneTitle}
        onBack={() => onBack(1)}
        cta={<SendButton busy={phone.busy} ready={phone.readyPhone} onSend={onSend} />}
      >
        <PhoneBody
          formatted={phone.formatted}
          onNational={phone.onNational}
          busy={phone.busy}
          check={step === 1 ? <PersonCheck containerRef={phone.containerRef} /> : null}
        />
        <PhoneAlert error={phone.error} code={phone.errorCode} />
      </AuthChrome>
    );
  };

  const flow = (
    <div className="creator-auth create-flow">
      <div className="create-viewport">
        {leaving != null && (
          <div
            key={`leave-${leaving}`}
            className={paneClass(false, motion, hasMoved)}
            aria-hidden="true"
            inert
            data-step={leaving === 1 ? 'phone' : leaving === 2 ? 'code' : 'done'}
          >
            {renderStep(leaving)}
          </div>
        )}
        <div
          key={step}
          className={paneClass(true, motion, hasMoved)}
          data-step={step === 1 ? 'phone' : step === 2 ? 'code' : 'done'}
        >
          {renderStep(step)}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <span ref={anchorRef} hidden />
      {host ? createPortal(flow, host) : flow}
    </>
  );
}
