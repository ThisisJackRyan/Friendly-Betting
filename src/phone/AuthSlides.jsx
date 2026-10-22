'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from '../platform/Link';
import { FiChevronLeft } from 'react-icons/fi';
import { mountPhoneCheck, releasePhoneCheck, sendPhoneCode, verifyPhoneCode } from './creatorAuth';
import { SLIDE_MS } from './createMotion';
import { isNativeApp } from '../platform/runtime';
import {
  AUTH_COPY,
  codeSentCopy,
  formatUsNational,
  nationalDigits,
  PERSON_CHECK_CANCELLED,
  PHONE_INVALID_ERROR,
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
  // Verify reads these, not state, so a stale render never confirms an old
  // code or confirms twice. Only a successful send replaces the id.
  const verificationIdRef = useRef('');
  const verifiedRef = useRef(null);
  const [digitsRaw, setDigitsRaw] = useState('');
  const [e164, setE164] = useState('');
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
      setError(PHONE_INVALID_ERROR);
      return false;
    }
    const container = containerRef.current;
    sending.current = true;
    setBusy('send');
    setError('');
    try {
      const id = await sendPhoneCode(next, container);
      verificationIdRef.current = id;
      setE164(next);
      setOtp(['', '', '', '', '', '']);
      attempted.current = '';
      return true;
    } catch (err) {
      // A closed check just puts the button back.
      if (err?.code !== PERSON_CHECK_CANCELLED) {
        // Code and message only. Never the number, the id, or the SMS code.
        console.warn('[phone-auth] send failed', err?.code, err?.message);
        showPhoneError(err, SEND_CODE_ERROR);
      }
      return false;
    } finally {
      sending.current = false;
      setBusy(null);
    }
  };

  const verify = async (code) => {
    if (verifiedRef.current) return verifiedRef.current;
    const token = (code || otp.join('')).replace(/\D/g, '');
    if (token.length !== 6) {
      setError('Enter the 6-digit code.');
      return null;
    }
    const id = verificationIdRef.current;
    if (!id) {
      setError('Send a new code.');
      return null;
    }
    // One confirm at a time. A second confirm of the same code reads as expired.
    if (verifying.current) return null;
    verifying.current = true;
    setBusy('verify');
    setError('');
    try {
      const nextUser = await verifyPhoneCode(id, token);
      if (verifiedRef.current) return verifiedRef.current;
      // A success is a real sign-in, so it stands even if Resend ran meanwhile.
      verifiedRef.current = nextUser;
      setVerifiedUser(nextUser);
      return nextUser;
    } catch (err) {
      // Already in, or this code belongs to a send that Resend replaced.
      if (verifiedRef.current) return verifiedRef.current;
      if (id !== verificationIdRef.current) return null;
      // Code and message only. Never the number, the id, or the SMS code.
      console.warn('[phone-auth] verify failed', err?.code, err?.message);
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
    // Off screen but still rendered. Resend runs the invisible check from
    // here, and it does not run reliably under display: none.
    phonePark.setAttribute('aria-hidden', 'true');
    Object.assign(phonePark.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
    });
  }
  if (!phonePark.isConnected && document.body) document.body.appendChild(phonePark);
  phonePark.appendChild(slot);
}

export function PersonCheck({ containerRef }) {
  const hostRef = useRef(null);

  // A layout effect, so the cleanup parks the slot before React detaches the
  // step. A passive cleanup runs after, when the slot is already gone.
  useLayoutEffect(() => {
    if (isNativeApp()) return undefined;
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

  return isNativeApp() ? null : <div ref={hostRef} className="person-check" />;
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

// A whole code that landed next to the old digit (an autofill that appends
// instead of replacing): the old digit plus 6 more. The code is the 6 without
// it; read as the old digit first when it could be either end.
function withoutOldDigit(value, prev) {
  const digits = value.replace(/\D/g, '');
  if (!prev || digits.length !== prev.length + 6) return value;
  if (digits.startsWith(prev)) return digits.slice(prev.length);
  if (digits.endsWith(prev)) return digits.slice(0, 6);
  return value;
}

// The text a change put into a cell that held `prev`. A filled cell normally
// has its digit selected, so the value is just the new text; when it was not
// (iOS can leave the caret before the digit), the value is the old digit plus
// the new text in either order, and the caret marks where the new text ends.
function insertedText(target, nativeEvent, prev) {
  const value = String(target.value || '');
  const type = nativeEvent?.inputType || '';
  if (!prev || value.length <= prev.length) return value;
  if (type === 'insertReplacementText' || type === 'insertFromPaste') return withoutOldDigit(value, prev);
  const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : value.length;
  const begin = end - (value.length - prev.length);
  if (begin >= 0 && value.slice(0, begin) + value.slice(end) === prev) return value.slice(begin, end);
  if (value.replace(/\D/g, '').length >= 6) return withoutOldDigit(value, prev);
  if (value.startsWith(prev)) return value.slice(prev.length);
  if (value.endsWith(prev)) return value.slice(0, value.length - prev.length);
  return value;
}

function selectCell(node) {
  if (!node) return;
  try {
    node.select();
  } catch {
    // Selection is a convenience; typing still replaces the digit.
  }
}

export function CodeBody({ e164, otp, onOtp, onResend, onChangeNumber, busy, error = '', check }) {
  const refs = useRef([]);
  // The latest code, so events that land before a re-render build on each
  // other instead of on the code from the last render.
  const otpRef = useRef(otp);
  const shown = useRef(otp);
  if (shown.current !== otp) {
    shown.current = otp;
    otpRef.current = otp;
  }
  const lastBusy = useRef(busy);

  const focusCell = (index) => {
    const node = refs.current[index];
    if (!node) return;
    node.focus();
    selectCell(node);
  };

  const commit = (next, focusAt) => {
    otpRef.current = next;
    const completed = next.every(Boolean) ? next.join('') : '';
    onOtp(next, completed);
    if (!completed && focusAt != null) focusCell(Math.max(0, Math.min(focusAt, 5)));
  };

  // Digits from `raw` go in from `index`. A whole code (6 or more digits, as
  // autofill or a paste gives) always fills from the first box.
  const fill = (index, raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return false;
    if (digits.length >= 6) {
      commit(digits.slice(0, 6).split(''), 5);
      return true;
    }
    const next = otpRef.current.slice();
    const placed = digits.slice(0, 6 - index).split('');
    placed.forEach((char, offset) => {
      next[index + offset] = char;
    });
    commit(next, index + placed.length);
    return true;
  };

  const clear = (index, focusAt) => {
    const next = otpRef.current.slice();
    next[index] = '';
    commit(next, focusAt);
  };

  const onChange = (index, event) => {
    const prev = otpRef.current[index] || '';
    const value = String(event.target.value || '');
    if (!value) {
      if (prev) clear(index, null);
      return;
    }
    // Anything without a digit leaves the cell as it was.
    fill(index, insertedText(event.target, event.nativeEvent, prev));
  };

  // Backspace takes off the last digit in the code, wherever focus is, so
  // repeated presses clear right to left and never leave a digit behind.
  // Focus follows the box it cleared.
  const backspace = () => {
    const last = otpRef.current.map(Boolean).lastIndexOf(true);
    if (last < 0) focusCell(0);
    else clear(last, last);
  };

  const onKeyDown = (event) => {
    if (event.key !== 'Backspace') return;
    event.preventDefault();
    backspace();
  };

  // Some Android keyboards send Backspace as key 'Unidentified' (keyCode
  // 229), which onKeyDown can't tell apart. Their beforeinput still says
  // deleteContentBackward, even in an empty box where no change follows. A
  // real Backspace key already stopped it in onKeyDown. If the keyboard won't
  // let it be stopped, a filled box empties itself through onChange.
  const onBeforeInput = (index, event) => {
    if (event.inputType !== 'deleteContentBackward') return;
    if (event.cancelable) {
      event.preventDefault();
      backspace();
    } else if (!otpRef.current[index]) {
      backspace();
    }
  };
  const beforeInput = useRef(onBeforeInput);
  beforeInput.current = onBeforeInput;
  // React's onBeforeInput only reports typed text, so this is a native listener.
  useEffect(() => {
    const nodes = refs.current.slice();
    const handlers = nodes.map((node, index) => {
      const handler = (event) => beforeInput.current(index, event);
      node?.addEventListener('beforeinput', handler);
      return handler;
    });
    return () => nodes.forEach((node, index) => node?.removeEventListener('beforeinput', handlers[index]));
  }, []);

  // A failed verify had the boxes disabled; put focus back in the last one so
  // the code can be fixed right away.
  useEffect(() => {
    const was = lastBusy.current;
    lastBusy.current = busy;
    if (was === 'verify' && !busy && error) focusCell(5);
  }, [busy, error]);

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
            onFocus={(event) => selectCell(event.currentTarget)}
            onClick={(event) => selectCell(event.currentTarget)}
            onChange={(event) => onChange(index, event)}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              const text = event.clipboardData?.getData('text') || '';
              if (!text) return;
              event.preventDefault();
              fill(index, text);
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
        <div className="page-intro auth-intro">
          <p className="eyebrow">YOUR FRIENDLY CLUBHOUSE</p>
          <h2>
            {title === AUTH_COPY.phoneTitle
              ? 'Welcome to your side of the bet.'
              : 'You’re one text away.'}
          </h2>
          <p className="intro-copy">
            {title === AUTH_COPY.phoneTitle
              ? 'Sign in with your phone to see your bets, follow the picks, and settle the score.'
              : 'Enter the six-digit code we sent to your phone.'}
          </p>
        </div>
        {children}
      </div>
      {cta ? <div className="cta-bar">{cta}</div> : null}
    </>
  );
}

// phoneFooter, if given, sits under the Send code button on the phone step.
export default function CreatorAuthFlow({ onCancel, renderDone, phoneFooter = null }) {
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
            error={phone.error}
          />
          <PhoneAlert error={phone.error} code={phone.errorCode} />
        </AuthChrome>
      );
    }
    return (
      <AuthChrome
        title={AUTH_COPY.phoneTitle}
        onBack={() => onBack(1)}
        cta={(
          <>
            <SendButton busy={phone.busy} ready={phone.readyPhone} onSend={onSend} />
            {phoneFooter}
          </>
        )}
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
