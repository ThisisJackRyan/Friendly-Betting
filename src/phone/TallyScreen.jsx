'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FiChevronLeft } from 'react-icons/fi';
import { hydrateBet, settleBet, subscribeBet } from './api';
import { isCreator } from './creator';
import { useIdentity } from './identity';
import PhoneGate from './PhoneGate';
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
import FriendlyLoader, { useMinHold } from './FriendlyLoader';

const SHARE_NOTE = {
  shared: 'Pick who gets it.',
  sms: 'Opening Messages.',
  copied: 'Copied \u2014 paste into a text.',
  aborted: 'Saved. Text when you\u2019re ready.',
  manual: 'Copy the message below.',
};

const TallyScreen = () => {
  const params = useParams() || {};
  const betId = params.code || params.id;
  const router = useRouter();
  const user = useIdentity();
  const [session, setSession] = useState(null);
  const [authGate, setAuthGate] = useState(false);
  const [bet, setBet] = useState(undefined);
  const [error, setError] = useState('');
  const [settling, setSettling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [shareState, setShareState] = useState('');
  const [sharing, setSharing] = useState(false);
  const minElapsed = useMinHold(betId);

  useEffect(() => {
    if (authGate) return undefined;
    document.title = 'Tally · Friendly';
    return undefined;
  }, [authGate]);

  useEffect(() => {
    let cancelled = false;
    setBet(undefined);
    setError('');
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

  const activeUser = session || user;

  const onVerified = (next) => {
    setSession(next);
    setAuthGate(false);
    if (next && bet && isCreator(next) && next.uid === bet.createdByID && bet.status !== 'closed') {
      setSettling(true);
      return;
    }
    if (next && bet && next.uid !== bet.createdByID) {
      setError('This phone doesn\u2019t own this bet.');
    }
  };

  const confirmSettle = async (winnerId) => {
    if (!isCreator(activeUser) || !bet || activeUser.uid !== bet.createdByID) {
      setError('Only the creator can settle this bet.');
      setSettling(false);
      return;
    }
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

  const ownsBet = Boolean(activeUser && bet && activeUser.uid === bet.createdByID);
  const canSettle = ownsBet && bet.status !== 'closed';
  const won = bet ? winnerLabel(bet) : '';
  const reveal = minElapsed && bet !== undefined;
  const shareNote = SHARE_NOTE[shareState];

  if (authGate) {
    return (
      <div className="phone screen-push">
        <PhoneGate onBack={() => setAuthGate(false)} onVerified={onVerified} />
      </div>
    );
  }

  return (
    <div className="phone screen-push">
      <div className="nav-row">
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => router.back()}>
          <FiChevronLeft size={28} />
        </button>
        <h1 className="nav-title">Tally</h1>
      </div>
      <div className="scroll">
        {!reveal && <FriendlyLoader />}
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
              <button
                type="button"
                className="danger press"
                onClick={() => {
                  if (!isCreator(activeUser)) setAuthGate(true);
                  else setSettling(true);
                }}
              >
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
