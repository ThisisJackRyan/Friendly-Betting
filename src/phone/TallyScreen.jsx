'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FiChevronLeft } from 'react-icons/fi';
import { hydrateBet, settleBet, subscribeBet } from './api';
import { useIdentity } from './identity';
import {
  formatCloses,
  friendlyError,
  optionVoteLabel,
  questionOf,
  statusLabel,
  typeLabelOf,
  winnerLabel,
} from './model';
import Bars from './Bars';

const TallyScreen = () => {
  const params = useParams() || {};
  const betId = params.code || params.id;
  const router = useRouter();
  const user = useIdentity();
  const [bet, setBet] = useState(undefined);
  const [error, setError] = useState('');
  const [settling, setSettling] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Tally · Friendly';
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeBet(betId, (next, err) => {
      if (cancelled) return;
      if (err) {
        setError('Could not load this tally.');
        setBet(null);
        return;
      }
      if (!next) {
        setBet(null);
        return;
      }
      if (next.schemaVersion === 2 && Array.isArray(next.options)) {
        setBet(next);
        return;
      }
      hydrateBet(next).then((full) => {
        if (!cancelled) setBet(full);
      }).catch(() => {
        if (!cancelled) setBet(next);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [betId]);

  const confirmSettle = async (winnerId) => {
    setSaving(true);
    setError('');
    try {
      await settleBet(betId, winnerId);
      setSettling(false);
    } catch (err) {
      setError(friendlyError(err, 'Could not settle this bet.'));
    } finally {
      setSaving(false);
    }
  };

  const isCreator = Boolean(user && bet && user.uid === bet.createdByID);
  const canSettle = isCreator && bet && bet.status !== 'closed';
  const won = bet ? winnerLabel(bet) : '';

  return (
    <div className="phone screen-push">
      <div className="nav-row">
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => router.back()}>
          <FiChevronLeft size={28} />
        </button>
        <h1 className="nav-title">Tally</h1>
      </div>
      <div className="scroll">
        {bet === undefined && <p className="muted">Loading…</p>}
        {bet === null && <p className="muted">This bet is gone.</p>}
        {bet && (
          <>
            <div className="bet-card-top">
              <span className="chip">{typeLabelOf(bet)}</span>
              <span className={`status ${statusLabel(bet).toLowerCase()}`}>{statusLabel(bet)}</span>
            </div>
            <h2 className="question-xl">{questionOf(bet)}</h2>
            <div className="vote-meta">
              {bet.closesAt ? <p className="closes">Closes {formatCloses(bet.closesAt)}</p> : null}
              {won ? <p className="settled-line">Settled on {won}</p> : null}
            </div>
            <hr className="meta-rule" />
            <Bars bet={bet} highlightId={bet.winnerId} waiting />
            {error && <p className="form-error" role="alert">{error}</p>}
            {canSettle && !settling && (
              <button type="button" className="danger press" onClick={() => setSettling(true)}>
                Close & settle
              </button>
            )}
            {canSettle && settling && (
              <div className="settle">
                <p className="field-label">Who won?</p>
                {(bet.options || []).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="choice press"
                    disabled={saving}
                    onClick={() => confirmSettle(option.id)}
                  >
                    {optionVoteLabel(bet, option)}
                  </button>
                ))}
                <button type="button" className="text-link" onClick={() => setSettling(false)}>
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TallyScreen;
