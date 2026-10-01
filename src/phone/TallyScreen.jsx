'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FiChevronLeft } from 'react-icons/fi';
import { hydrateBet, settleBet, subscribeBet } from './api';
import { useIdentity } from './identity';
import {
  choiceLabels,
  formatCloses,
  formatSms,
  friendlyError,
  optionVoteLabel,
  questionOf,
  statusLabel,
  typeLabelOf,
  winnerLabel,
} from './model';
import { voteUrl } from './routes';
import { shareMessage } from './share';
import Bars from './Bars';

const TALLY_LOAD_MS = 450;

const SHARE_NOTE = {
  shared: 'Pick who gets it.',
  sms: 'Opening Messages.',
  copied: 'Copied \u2014 paste into a text.',
  aborted: 'Saved. Text when you\u2019re ready.',
  manual: 'Copy the message below.',
};

function TallyLoading() {
  return (
    <div className="tally-load" role="status" aria-label="Loading">
      <p className="tally-load-mark">Friendly</p>
      <div className="tally-load-bars" aria-hidden="true">
        <span className="tally-load-bar" />
        <span className="tally-load-bar" />
        <span className="tally-load-bar" />
      </div>
    </div>
  );
}

const TallyScreen = () => {
  const params = useParams() || {};
  const betId = params.code || params.id;
  const router = useRouter();
  const user = useIdentity();
  const [bet, setBet] = useState(undefined);
  const [error, setError] = useState('');
  const [settling, setSettling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [message, setMessage] = useState('');
  const [shareState, setShareState] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    document.title = 'Tally · Friendly';
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBet(undefined);
    setError('');
    setMinElapsed(false);
    const minTimer = window.setTimeout(() => {
      if (!cancelled) setMinElapsed(true);
    }, TALLY_LOAD_MS);
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
      window.clearTimeout(minTimer);
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

  const onShare = async () => {
    if (!bet || sharing) return;
    const text = formatSms({
      name: bet.createdByName,
      question: questionOf(bet),
      choices: choiceLabels(bet),
      stake: bet.stake,
      url: voteUrl(bet.code || betId),
    });
    setMessage(text);
    setSharing(true);
    try {
      const result = await shareMessage(text);
      setShareState(result);
    } finally {
      setSharing(false);
    }
  };

  const isCreator = Boolean(user && bet && user.uid === bet.createdByID);
  const canSettle = isCreator && bet && bet.status !== 'closed';
  const won = bet ? winnerLabel(bet) : '';
  const reveal = minElapsed && bet !== undefined;
  const shareNote = SHARE_NOTE[shareState];

  return (
    <div className="phone screen-push">
      <div className="nav-row">
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => router.back()}>
          <FiChevronLeft size={28} />
        </button>
        <h1 className="nav-title">Tally</h1>
      </div>
      <div className="scroll">
        {!reveal && <TallyLoading />}
        {reveal && bet === null && <p className="muted">This bet is gone.</p>}
        {reveal && bet && (
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
            <div className="tally-share">
              {message && shareState === 'manual' && (
                <p className="manual-message">{message}</p>
              )}
              {shareNote ? <p className="share-note">{shareNote}</p> : null}
              <button
                type="button"
                className="cta press"
                disabled={sharing}
                onClick={onShare}
              >
                Share
              </button>
            </div>
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
