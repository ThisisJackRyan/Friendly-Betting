import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export const AD_THANKS_LINE = 'Thanks for watching. That keeps Friendly free.';

// The thank-you after an interstitial. A fixed full-screen layer on
// document.body, so nothing under it moves. A tap anywhere continues; with
// autoContinueMs it also continues by itself. onContinue runs inside the tap's
// click handler, so a caller can open navigator.share from it. With no label
// there is no visible button: a transparent control covers the layer, named
// by the thank-you line, so it still takes focus and Enter or Space.
export const thanksLayerStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 24,
  padding: 'calc(env(safe-area-inset-top) + 24px) calc(env(safe-area-inset-right) + 24px) calc(env(safe-area-inset-bottom) + 24px) calc(env(safe-area-inset-left) + 24px)',
  boxSizing: 'border-box',
  background: 'var(--page, #f6f7f2)',
  color: 'var(--ink, #203b2e)',
  fontFamily: 'inherit',
  textAlign: 'center',
  cursor: 'pointer',
};

const line = {
  margin: 0,
  maxWidth: 320,
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1.3,
  letterSpacing: '-0.01em',
};

export const continueButtonStyle = {
  minHeight: 44,
  minWidth: 44,
  width: 'min(320px, 100%)',
  gap: 8,
};

export const coverButtonStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
};

export default function AdThanks({ onContinue, autoContinueMs = 0, label }) {
  const button = useRef(null);
  const layer = useRef(null);
  const done = useRef(false);
  const finish = useRef(onContinue);
  finish.current = () => {
    if (done.current) return;
    done.current = true;
    onContinue?.();
  };

  useEffect(() => {
    button.current?.focus();
    const timer = autoContinueMs > 0 ? setTimeout(() => finish.current(), autoContinueMs) : null;
    // While it is up, focus stays on its one button: Tab, a click on the
    // page under it, or a script can't move focus behind the layer.
    const keep = (event) => {
      if (layer.current && !layer.current.contains(event.target)) button.current?.focus();
    };
    document.addEventListener('focusin', keep);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('focusin', keep);
    };
  }, [autoContinueMs]);

  const view = (
    <div
      ref={layer}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ad-thanks-line"
      style={thanksLayerStyle}
      data-testid="ad-thanks"
      onClick={() => finish.current()}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        event.preventDefault();
        button.current?.focus();
      }}
    >
      <p id="ad-thanks-line" style={line}>{AD_THANKS_LINE}</p>
      {/* The button's click bubbles to the layer, which continues once. */}
      {label ? (
        <button ref={button} type="button" className="cta press" style={continueButtonStyle}>
          {label}
        </button>
      ) : (
        <button ref={button} type="button" aria-label={AD_THANKS_LINE} style={coverButtonStyle} />
      )}
    </div>
  );
  return typeof document === 'undefined' ? view : createPortal(view, document.body);
}
