'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiAward, FiRotateCcw, FiSlash, FiUsers, FiX, FiZap } from 'react-icons/fi';
import ProBadge from './ProBadge';
import { fetchFounderCount, requestMockPurchase } from './entitlementApi';
import { badgeFor } from './entitlement';
import { refreshEntitlement, useEntitlementState } from './useEntitlement';
import {
  PRO_COPY,
  PRO_ROW,
  founderOffer,
  proMockPurchaseEnabled,
  proPrivacyUrl,
  proTermsUrl,
} from './proConfig';

const BENEFIT_ICONS = [FiSlash, FiAward, FiRotateCcw, FiUsers, FiZap];

// How long the plan cards wait for the founder count before showing the Pro
// card alone.
export const FOUNDER_COUNT_TIMEOUT_MS = 8000;

// The Pro sheet (UX spec, Oct 20): slides up from the bottom, on top of the
// page that opened it, and is all of /pro. `highlight` is the benefit row
// (PRO_ROW) to tint: a locked feature opens it on its own row, Go Pro on
// row 1. onClose: the X, Maybe later, Escape or a tap on the scrim. onDone:
// Back to my bets on the success screen.
//
// Only rendered with the paywall on (proPaywallEnabled). Buying only works
// with NEXT_PUBLIC_PRO_MOCK_PURCHASE=1 (previews); otherwise the main button
// is a disabled Coming soon. Restore purchase reads the entitlement again.
export default function ProSheet({ highlight = PRO_ROW.noAds, onClose, onDone }) {
  const { entitlement, isPro } = useEntitlementState();
  const purchasable = proMockPurchaseEnabled();
  // undefined while loading, null if the count could not be read in time.
  const [founders, setFounders] = useState(undefined);
  const [picked, setPicked] = useState('');
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  // '', 'busy' or 'nothing'.
  const [restore, setRestore] = useState('');
  const [restored, setRestored] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    setMounted(true);
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setFounders(null);
    }, FOUNDER_COUNT_TIMEOUT_MS);
    fetchFounderCount()
      .then((count) => {
        if (!current) return;
        clearTimeout(timer);
        // A count after the timeout adds the Founder card but keeps Pro
        // picked, so the choice never changes under the user.
        if (timedOut) setPicked((value) => value || 'pro');
        setFounders(count);
      })
      .catch(() => {
        if (!current) return;
        clearTimeout(timer);
        setFounders(null);
      });
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, []);

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

  const offer = typeof founders === 'number' ? founderOffer(founders) : null;
  const founderOpen = Boolean(offer && !offer.soldOut);
  // The cards wait for the founder count only. A plan that loads later as Pro
  // still swaps in the success screen.
  const ready = founders !== undefined;
  const plan = founderOpen ? picked || 'founder' : 'pro';
  const success = isPro || restored;

  const buy = async () => {
    if (buying || !purchasable || !ready) return;
    setBuying(true);
    setError('');
    setRestore('');
    try {
      const result = await requestMockPurchase(plan);
      if (typeof result?.founderCount === 'number' && live.current) setFounders(result.founderCount);
      // Read the new plan now rather than wait for the listener.
      await refreshEntitlement().catch(() => false);
    } catch {
      if (live.current) setError(PRO_COPY.error);
    } finally {
      if (live.current) setBuying(false);
    }
  };

  const runRestore = async () => {
    if (restore === 'busy' || buying) return;
    setRestore('busy');
    setError('');
    try {
      const found = await refreshEntitlement();
      if (!live.current) return;
      setRestored(found);
      setRestore(found ? '' : 'nothing');
    } catch {
      if (!live.current) return;
      setRestore('');
      setError(PRO_COPY.error);
    }
  };

  const badge = badgeFor(entitlement) || { kind: 'pro' };
  // A Founder whose number is unknown gets the Pro lines.
  const founderNumber = badge.kind === 'founder' ? badge.number : undefined;
  let successLine = founderNumber ? PRO_COPY.ownedFounder(founderNumber) : PRO_COPY.owned;
  if (restored) successLine = founderNumber ? PRO_COPY.restoredFounder(founderNumber) : PRO_COPY.restored;

  let mainLabel = plan === 'founder' ? PRO_COPY.getFounder : PRO_COPY.getPro;
  if (buying) mainLabel = PRO_COPY.buying;
  if (!purchasable) mainLabel = PRO_COPY.comingSoon;

  const links = [
    <button key="restore" type="button" className="pro-sheet-link" disabled={restore === 'busy' || buying} onClick={runRestore}>
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

  const planCard = (id, label, price, note, seats) => (
    <label className={`pro-plan${plan === id ? ' is-picked' : ''}`}>
      <input
        type="radio"
        name="pro-plan"
        value={id}
        checked={plan === id}
        disabled={buying}
        onChange={() => setPicked(id)}
      />
      <span className="pro-plan-radio" aria-hidden="true" />
      <span className="pro-plan-text">
        <span className="pro-plan-label">{label}</span>
        <span className="pro-plan-note">{note}</span>
        {seats && <span className="pro-plan-seats">{seats}</span>}
      </span>
      <span className="pro-plan-price">{price}</span>
    </label>
  );

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
              <button type="button" className="cta press pro-sheet-main" onClick={() => onDone?.()}>
                {PRO_COPY.backToBets}
              </button>
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
                {ready ? (
                  <div className="pro-plans">
                    {offer?.soldOut && <p className="pro-sold-out">{PRO_COPY.founderSoldOut}</p>}
                    {planCard('pro', PRO_COPY.proLabel, PRO_COPY.proPrice, PRO_COPY.proNote)}
                    {founderOpen
                      && planCard(
                        'founder',
                        PRO_COPY.founderLabel,
                        PRO_COPY.founderPrice(offer),
                        PRO_COPY.founderNote,
                        PRO_COPY.founderSeats(offer),
                      )}
                  </div>
                ) : (
                  <div className="pro-plans" aria-busy="true">
                    {[0, 1].map((index) => (
                      <div key={index} className="pro-plan is-loading" aria-hidden="true">
                        <span className="pro-plan-radio" />
                        <span className="pro-plan-text">
                          <span className="pro-skeleton pro-skeleton-label" />
                          <span className="pro-skeleton pro-skeleton-note" />
                        </span>
                        <span className="pro-skeleton pro-skeleton-price" />
                      </div>
                    ))}
                  </div>
                )}
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
                disabled={!purchasable || !ready || buying}
                aria-busy={buying || undefined}
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
