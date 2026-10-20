import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export const AD_THANKS_LINE = 'Thanks for watching. Ads keep this app free.';

// The thank-you after an interstitial. A fixed full-screen layer on
// document.body, so nothing under it moves. A tap anywhere continues; with
// autoContinueMs it also continues by itself. onContinue runs inside the tap's
// click handler, so a caller can open navigator.share from it.
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

export default function AdThanks({ onContinue, autoContinueMs = 0, label }) {
  const button = useRef(null);
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
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [autoContinueMs]);

  const view = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ad-thanks-line"
      style={thanksLayerStyle}
      data-testid="ad-thanks"
      onClick={() => finish.current()}
    >
      <p id="ad-thanks-line" style={line}>{AD_THANKS_LINE}</p>
      {/* The button's click bubbles to the layer, which continues once. */}
      <button ref={button} type="button" className="cta press" style={continueButtonStyle}>
        {label}
      </button>
    </div>
  );
  return typeof document === 'undefined' ? view : createPortal(view, document.body);
}
