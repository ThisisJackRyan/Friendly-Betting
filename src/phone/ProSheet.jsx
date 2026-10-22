'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiAward, FiRotateCcw, FiSlash, FiUsers, FiX, FiZap } from 'react-icons/fi';
import { useModalBackground } from '../platform/modalBackground';
import { isNativeApp } from '../platform/runtime';
import ProBadge from './ProBadge';
import { leaveForBilling } from './billingRedirect';
import { requestBillingPortal, requestCheckout, requestMockPurchase } from './entitlementApi';
import { badgeFor } from './entitlement';
import { refreshEntitlement, useEntitlementState } from './useEntitlement';
import {
  PRO_COPY,
  PRO_ROW,
  STRIPE_COPY,
  proMockPurchaseEnabled,
  proPrivacyUrl,
  proTermsUrl,
  stripeWebProEnabled,
} from './proConfig';

const BENEFIT_ICONS = [FiSlash, FiAward, FiRotateCcw, FiUsers, FiZap];

// Restoring… stays up at least this long, so an answer that comes back at
// once (a read the rules deny straight away) still shows the tap did
// something instead of flashing past.
export const RESTORE_MIN_BUSY_MS = 600;

// Back from Stripe Checkout, the webhook may land a moment after the member
// does: the plan is read again this often, this many times, before the sheet
// gives up waiting (Restore purchase still works after that).
export const CONFIRM_EVERY_MS = 2500;
export const CONFIRM_TRIES = 8;

// The Pro sheet (UX spec, Oct 20): slides up from the bottom, on top of the
// page that opened it, and is all of /pro. `highlight` is the benefit row
// (PRO_ROW) to tint: a locked feature opens it on its own row, Go Pro on
// row 1. onClose: the X, Maybe later, Escape or a tap on the scrim. onDone:
// Back to my bets on the success screen.
//
// Only rendered with the paywall on (proPaywallEnabled). On the web with
// NEXT_PUBLIC_STRIPE_WEB_PRO=1, Get Pro goes to Stripe Checkout
// (docs/STRIPE-WEB-PRO.md) and a Stripe member gets Manage subscription;
// otherwise buying only works with NEXT_PUBLIC_PRO_MOCK_PURCHASE=1
// (previews), and without either the main button is a disabled Coming soon.
// Restore purchase reads the entitlement again. `confirming`: back from a
// paid Checkout, waiting for the plan to arrive.
export default function ProSheet({ highlight = PRO_ROW.noAds, onClose, onDone, confirming = false }) {
  const { entitlement, isPro } = useEntitlementState();
  const stripeCheckout = stripeWebProEnabled() && !isNativeApp();
  const purchasable = stripeCheckout || proMockPurchaseEnabled();
  const [buying, setBuying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState('');
  // '', 'busy' or 'nothing'.
  const [restore, setRestore] = useState('');
  const [restored, setRestored] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef(null);
  const live = useRef(true);
  const restoreHold = useRef(null);

  useEffect(() => {
    live.current = true;
    setMounted(true);
    return () => {
      live.current = false;
      clearTimeout(restoreHold.current);
    };
  }, []);

  // The page behind is inert while the sheet is up (unless the sheet sits
  // inside it), and focus goes back to the opener when it closes.
  useModalBackground(dialogRef, mounted);

  // Back from Checkout: read the plan again until it shows up, or give up.
  useEffect(() => {
    if (!confirming || !stripeCheckout) return undefined;
    let stopped = false;
    let timer;
    let tries = 0;
    setWaiting(true);
    const check = async () => {
      tries += 1;
      const found = await refreshEntitlement().catch(() => false);
      if (stopped) return;
      if (found || tries >= CONFIRM_TRIES) setWaiting(false);
      else timer = setTimeout(check, CONFIRM_EVERY_MS);
    };
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [confirming, stripeCheckout]);

  // Back from Checkout with the browser's back button: the page may come back
  // from the cache still showing Getting you set…
  useEffect(() => {
    if (!stripeCheckout) return undefined;
    const onShow = (event) => {
      if (!event.persisted) return;
      setBuying(false);
      setManaging(false);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [stripeCheckout]);

  useEffect(() => {
    // Focus starts on the sheet itself, so Tab reaches the X first.
    if (mounted) dialogRef.current?.focus();
  }, [mounted]);

  const close = () => {
    if (!buying) onClose?.();
  };

  useEffect(() => {
    if (!mounted) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !buying) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mounted, buying, onClose]);

  if (!mounted) return null;

  // A plan that loads later as Pro swaps in the success screen.
  const success = isPro || restored;

  // Leaves for the member's Stripe customer portal. True once leaving.
  const openPortal = async () => {
    const { url } = await requestBillingPortal();
    return leaveForBilling(url);
  };

  // Stripe Checkout: the sheet stays on Getting you set… while the page
  // leaves. Already Pro (found by the server) shows the success screen; a
  // subscription that is still open goes to the portal instead of a second
  // one.
  const checkout = async () => {
    try {
      const { url } = await requestCheckout();
      if (leaveForBilling(url)) return;
      if (live.current) setError(PRO_COPY.error);
    } catch (err) {
      let handled = false;
      if (err?.code === 'already-pro') handled = await refreshEntitlement().catch(() => false);
      if (err?.code === 'already-subscribed') {
        handled = await openPortal().catch(() => false);
        if (handled) return;
      }
      if (!handled && live.current) setError(PRO_COPY.error);
    }
    if (live.current) setBuying(false);
  };

  const manage = async () => {
    if (managing) return;
    setManaging(true);
    setError('');
    const left = await openPortal().catch(() => false);
    if (left || !live.current) return;
    setManaging(false);
    setError(PRO_COPY.error);
  };

  const buy = async () => {
    if (buying || waiting || !purchasable) return;
    setBuying(true);
    setError('');
    setRestore('');
    if (stripeCheckout) {
      await checkout();
      return;
    }
    try {
      await requestMockPurchase('pro');
      // Read the new plan now rather than wait for the listener.
      await refreshEntitlement().catch(() => false);
    } catch {
      if (live.current) setError(PRO_COPY.error);
    } finally {
      if (live.current) setBuying(false);
    }
  };

  // Restoring… from the tap until the answer; Nothing to restore and the
  // error wait out RESTORE_MIN_BUSY_MS. A restored plan swaps in the success
  // screen at once.
  const runRestore = async () => {
    if (restore === 'busy' || buying) return;
    setRestore('busy');
    setError('');
    const started = Date.now();
    const held = () => new Promise((resolve) => {
      const left = RESTORE_MIN_BUSY_MS - (Date.now() - started);
      if (left <= 0) resolve();
      else restoreHold.current = setTimeout(resolve, left);
    });
    try {
      const found = await refreshEntitlement();
      if (!found) await held();
      if (!live.current) return;
      setRestored(found);
      setRestore(found ? '' : 'nothing');
    } catch {
      await held();
      if (!live.current) return;
      setRestore('');
      setError(PRO_COPY.error);
    }
  };

  const badge = badgeFor(entitlement) || { kind: 'pro' };
  const successLine = restored ? PRO_COPY.restored : PRO_COPY.owned;

  let mainLabel = PRO_COPY.getPro;
  if (buying || waiting) mainLabel = PRO_COPY.buying;
  if (!purchasable) mainLabel = PRO_COPY.comingSoon;
  // Manage subscription: on the web, for a member with a Stripe customer.
  const manageable = stripeCheckout && Boolean(entitlement?.stripeCustomerId);

  const links = [
    <button
      key="restore"
      type="button"
      className="pro-sheet-link"
      disabled={restore === 'busy' || buying}
      aria-busy={restore === 'busy' || undefined}
      onClick={runRestore}
    >
      {restore === 'busy' ? PRO_COPY.restoring : PRO_COPY.restore}
    </button>,
  ];
  if (proTermsUrl()) {
    links.push(
      <a key="terms" className="pro-sheet-link" href={proTermsUrl()} target="_blank" rel="noopener noreferrer">
        {PRO_COPY.terms}
      </a>,
    );
  }
  if (proPrivacyUrl()) {
    links.push(
      <a key="privacy" className="pro-sheet-link" href={proPrivacyUrl()} target="_blank" rel="noopener noreferrer">
        {PRO_COPY.privacy}
      </a>,
    );
  }

  const sheet = (
    <div className="pro-sheet-layer">
      <div className="pro-sheet-scrim" aria-hidden="true" onClick={close} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`pro-sheet${success ? ' is-success' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pro-sheet-title"
      >
        {/* Not verbatim from the spec: the X's accessible name. */}
        <button
          type="button"
          className="overlay-close pro-sheet-close"
          aria-label="Close"
          disabled={buying}
          onClick={close}
        >
          <FiX size={22} aria-hidden="true" />
        </button>
        {success ? (
          <div className="pro-sheet-success">
            <div className="pro-sheet-success-badge">
              <ProBadge badge={badge} />
            </div>
            <h2 id="pro-sheet-title" className="pro-sheet-success-line">
              {successLine}
            </h2>
            <div className="pro-sheet-footer">
              {manageable && error && (
                <p className="form-error pro-sheet-error" role="alert">
                  {error}
                </p>
              )}
              <button type="button" className="cta press pro-sheet-main" onClick={() => onDone?.()}>
                {PRO_COPY.backToBets}
              </button>
              {manageable && (
                <button
                  type="button"
                  className="pro-sheet-later pro-sheet-manage"
                  disabled={managing}
                  aria-busy={managing || undefined}
                  onClick={manage}
                >
                  {STRIPE_COPY.manage}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="pro-sheet-scroll">
              <div className="pro-sheet-hero">
                <span className="pro-sheet-badge">{PRO_COPY.pro}</span>
                <h2 id="pro-sheet-title" className="pro-sheet-headline">
                  {PRO_COPY.headline}
                </h2>
                <p className="pro-sheet-line">{PRO_COPY.line}</p>
              </div>
              <div className="pro-sheet-body">
                <ul className="pro-benefits">
                  {PRO_COPY.benefits.map((text, index) => {
                    const Icon = BENEFIT_ICONS[index];
                    return (
                      <li key={text} className={index + 1 === highlight ? 'is-highlighted' : undefined}>
                        <Icon size={24} aria-hidden="true" />
                        {text}
                      </li>
                    );
                  })}
                </ul>
                <div className="pro-price">
                  <p className="pro-price-amount">{PRO_COPY.proPrice}</p>
                  <p className="pro-price-note">{PRO_COPY.proNote}</p>
                </div>
                <p className="pro-fine-print">{PRO_COPY.finePrint}</p>
                <p className="pro-sheet-links">
                  {links.map((link, index) => (
                    <Fragment key={link.key}>
                      {index > 0 && (
                        <span className="pro-sheet-dot" aria-hidden="true">
                          ·
                        </span>
                      )}
                      {link}
                    </Fragment>
                  ))}
                </p>
              </div>
            </div>
            <div className="pro-sheet-footer">
              {error && (
                <p className="form-error pro-sheet-error" role="alert">
                  {error}
                </p>
              )}
              {restore === 'nothing' && (
                <p className="pro-sheet-note" role="status">
                  {PRO_COPY.nothingToRestore}
                </p>
              )}
              <button
                type="button"
                className="cta press pro-sheet-main"
                disabled={!purchasable || buying || waiting}
                aria-busy={buying || waiting || undefined}
                onClick={buy}
              >
                {mainLabel}
              </button>
              <button type="button" className="pro-sheet-later" disabled={buying} onClick={close}>
                {PRO_COPY.later}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
