'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiChevronRight } from 'react-icons/fi';
import { useModalBackground } from '../platform/modalBackground';
import ConfirmDialog from './ConfirmDialog';
import PushSettingsRow from './PushSettingsRow';
import { ACCOUNT_COPY, accountPhone } from './accountCopy';

// A downward drag past this many pixels closes the sheet.
const SWIPE_CLOSE_PX = 80;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The Account sheet from the person icon on My bets (AccountMenu). Closes on
// a swipe down, a tap on the scrim, or Escape; focus stays inside and goes
// back to the icon on close. A member (`phone` set) gets the Signed in line,
// Log out (behind the Log out? confirm) and the quiet Delete account row; an
// anonymous app user gets the title and Notifications only.
// `pushUid` is whose Notifications setting the row shows ('' for none).
export default function AccountSheet({ member, phone = '', pushUid = '', onClose, onLogOut, onDeleteAccount }) {
  const titleId = useId();
  const sheetRef = useRef(null);
  const logOutRef = useRef(null);
  const drag = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useModalBackground(sheetRef, mounted);

  useEffect(() => {
    if (mounted) sheetRef.current?.focus();
  }, [mounted]);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep focus inside the sheet.
    const items = [...sheetRef.current.querySelectorAll(FOCUSABLE)].filter((node) => node !== sheetRef.current);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === sheetRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Swipe down: the sheet follows the finger and closes past the threshold.
  // Only from the top of the sheet's scroll, so a scroll is never a close.
  const onTouchStart = (event) => {
    if (sheetRef.current?.scrollTop > 0) return;
    drag.current = { y: event.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (event) => {
    if (!drag.current) return;
    const dy = Math.max(0, event.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    setOffset(dy);
  };
  const onTouchEnd = () => {
    if (!drag.current) return;
    const { dy } = drag.current;
    drag.current = null;
    setOffset(0);
    if (dy > SWIPE_CLOSE_PX) onClose();
  };

  const cancelLogOut = () => {
    setConfirming(false);
    // Once the sheet is no longer inert.
    window.setTimeout(() => logOutRef.current?.focus(), 0);
  };

  if (!mounted) return null;

  return createPortal(
    <div className="push-sheet-layer account-sheet-layer">
      <div className="push-sheet-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="push-sheet account-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={confirming || undefined}
        style={offset ? { transform: `translateY(${offset}px)`, transition: 'none' } : undefined}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <span className="account-sheet-handle" aria-hidden="true" />
        <h2 id={titleId} className="push-sheet-title account-sheet-title">{ACCOUNT_COPY.title}</h2>
        {member && phone && <p className="account-sheet-phone">{ACCOUNT_COPY.signedInAs(accountPhone(phone))}</p>}
        <div className="account-sheet-rows">
          <PushSettingsRow uid={pushUid} />
          {member && (
            <button ref={logOutRef} type="button" className="account-row press" onClick={() => setConfirming(true)}>
              {ACCOUNT_COPY.logOut}
            </button>
          )}
        </div>
        {member && (
          <button type="button" className="account-delete-row press" onClick={onDeleteAccount}>
            <span>{ACCOUNT_COPY.deleteRow}</span>
            <FiChevronRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title={ACCOUNT_COPY.logOutTitle}
          copy={ACCOUNT_COPY.logOutBody}
          confirmLabel={ACCOUNT_COPY.logOutConfirm}
          confirmClassName="dialog-primary"
          cancelLabel={ACCOUNT_COPY.logOutCancel}
          cancelClassName="dialog-keep dialog-cancel"
          onConfirm={onLogOut}
          onCancel={cancelLogOut}
        />
      )}
    </div>,
    document.body,
  );
}
