'use client';

import { useEffect, useState } from 'react';
import { FiChevronLeft } from 'react-icons/fi';
import { useRouter } from '../platform/navigation';
import NotFound from './NotFound';
import ProBadge from './ProBadge';
import { fetchFounderCount, requestMockPurchase } from './entitlementApi';
import { useEntitlementState } from './useEntitlement';
import { badgeFor } from './entitlement';
import { PRO_COPY, founderOffer, proMockPurchaseEnabled, proPaywallEnabled } from './proConfig';

// /pro. Off (a 404) unless NEXT_PUBLIC_PRO_PAYWALL=1. The buttons only buy
// anything with NEXT_PUBLIC_PRO_MOCK_PURCHASE=1, on a preview, through the
// mock purchase route; otherwise they stay disabled under "Coming soon".
// Real store billing is not built yet (docs/PRO.md).
export default function Paywall() {
  const router = useRouter();
  const { entitlement, isPro } = useEntitlementState();
  const enabled = proPaywallEnabled();
  const purchasable = proMockPurchaseEnabled();
  // undefined while loading, null if the count could not be read.
  const [founders, setFounders] = useState(undefined);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (enabled) document.title = `${PRO_COPY.title} · Friendly`;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    fetchFounderCount()
      .then((count) => live && setFounders(count))
      .catch(() => live && setFounders(null));
    return () => {
      live = false;
    };
  }, [enabled]);

  if (!enabled) return <NotFound />;

  const offer = typeof founders === 'number' ? founderOffer(founders) : null;

  const buy = async (plan) => {
    if (busy || !purchasable) return;
    setBusy(plan);
    setError('');
    try {
      const result = await requestMockPurchase(plan);
      if (typeof result?.founderCount === 'number') setFounders(result.founderCount);
    } catch {
      setError(PRO_COPY.error);
    } finally {
      setBusy('');
    }
  };

  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/');
  };

  return (
    <div className="phone screen-push paywall-screen">
      <div className="nav-row">
        <button type="button" className="icon-btn" aria-label="Back" onClick={close}>
          <FiChevronLeft size={28} />
        </button>
        <h1 className="nav-title">{PRO_COPY.title}</h1>
      </div>
      <div className="scroll">
        <section className="paywall" aria-label={PRO_COPY.title}>
          <h2 className="screen-title">{PRO_COPY.title}</h2>
          <ul className="paywall-lines">
            <li>{PRO_COPY.free}</li>
            <li>{PRO_COPY.noAds}</li>
            {offer && <li>{offer.soldOut ? PRO_COPY.founderSoldOut : PRO_COPY.founder(offer)}</li>}
            <li>{PRO_COPY.bettors}</li>
          </ul>
          {isPro ? (
            <p className="paywall-owned">
              <ProBadge badge={badgeFor(entitlement)} />
              {PRO_COPY.owned}
            </p>
          ) : (
            <div className="paywall-actions">
              <button
                type="button"
                className="cta press"
                disabled={!purchasable || Boolean(busy)}
                onClick={() => buy('pro')}
              >
                {PRO_COPY.getPro}
              </button>
              {offer && !offer.soldOut && (
                <button
                  type="button"
                  className="secondary press"
                  disabled={!purchasable || Boolean(busy)}
                  onClick={() => buy('founder')}
                >
                  {PRO_COPY.getFounder}
                </button>
              )}
              {!purchasable && <p className="paywall-soon">{PRO_COPY.comingSoon}</p>}
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="text-link" onClick={close}>
            {PRO_COPY.notNow}
          </button>
        </section>
      </div>
    </div>
  );
}
