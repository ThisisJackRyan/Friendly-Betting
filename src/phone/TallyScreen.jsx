'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from '../platform/navigation';
import { FiChevronLeft, FiShare2 } from 'react-icons/fi';
import { BetFacts } from './ProductUI';
import { settleBet } from './api';
import { useLiveBet } from './useLiveBet';
import { canSettleBet } from './creatorSession';
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
  votingOpen,
} from './model';
import { voteUrl } from './routes';
import { shareMessage } from './share';
import Bars from './Bars';
import BetGone from './BetGone';
import FriendlyLoader, { useMinHold } from './FriendlyLoader';
import { buildSettlement, settlementOf } from './settlement';
import ResultCard from './ResultCard';
import ResultShare from './ResultShare';
import { rememberBet } from './notificationStore';
import { prefersReducedMotion } from './createMotion';

const LOAD_ERROR = 'Couldn’t load the crew’s picks. Try again in a bit.';

const SHARE_NOTE = {
  shared: 'Pick who gets it.',
  sms: 'Opening Messages.',
  copied: 'Copied \u2014 paste into a text.',
  aborted: 'Saved. Text when you\u2019re ready.',
  manual: 'Copy the message below.',
};

function SettlePicker({ bet, saving, onPick, onCancel }) {
  const [picked, setPicked] = useState(null);
  const preview = (bet.options || []).some((option) => option.id === picked) ? {
    ...bet, status: 'closed', winnerId: picked, settlement: buildSettlement(bet, picked),
  } : null;
  return (
    <div className="settle">
      <p className="field-label">Who won?</p>
      <p className="field-hint">Call the outcome. We’ll give the crew the final word.</p>
      {(bet.options || []).map((option) => (
        <button key={option.id} type="button" className="choice press" aria-pressed={picked === option.id} disabled={saving} onClick={() => setPicked(option.id)}>
          {optionVoteLabel(bet, option)}
        </button>
      ))}
      {preview && <>
        <ResultCard bet={preview} preview />
        <p className="field-hint">This locks the result. Friends get the final word when they open FRIENDLY where they made their pick.</p>
        <button type="button" className="cta press" disabled={saving} onClick={() => onPick(picked)}>{saving ? 'Settling…' : 'Settle & notify'}</button>
      </>}
      <button type="button" className="text-link" disabled={saving} onClick={onCancel}>Not yet</button>
    </div>
  );
}

const TallyScreen = () => {
  const params = useParams() || {};
  const betId = params.code || params.id;
  const router = useRouter();
  const user = useIdentity();
  const { bet, setBet, failed } = useLiveBet(betId);
  const [error, setError] = useState('');
  const [settling, setSettling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [shareState, setShareState] = useState('');
  const [sharing, setSharing] = useState(false);
  const resultRef = useRef(null);
  const revealSettlement = useRef(false);
  const minElapsed = useMinHold(betId);

  useEffect(() => {
    document.title = 'The picks · Friendly';
  }, []);

  useEffect(() => {
    setError('');
  }, [betId]);

  const confirmSettle = async (winnerId) => {
    if (saving) return;
    if (!canSettleBet(user, bet)) {
      setError('Only the creator can settle this bet.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const settled = await settleBet(betId, winnerId);
      revealSettlement.current = true;
      if (settled) setBet(settled);
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

  const canSettle = canSettleBet(user, bet);
  const result = settlementOf(bet);
  const reveal = minElapsed && bet !== undefined;
  const shareNote = SHARE_NOTE[shareState];

  useEffect(() => {
    if (bet?.votes?.some((vote) => vote.voterId === user?.uid)) rememberBet(user.uid, betId);
  }, [bet, user?.uid, betId]);

  useEffect(() => {
    if (result) document.title = 'The final word · Friendly';
  }, [result]);

  useEffect(() => {
    if (!result || settling || !revealSettlement.current) return;
    const card = resultRef.current;
    const scroller = card?.closest('.scroll');
    // Scroll only this screen: scrollIntoView also moves overflow-hidden
    // ancestors in the app shell, which can tuck the result under its header.
    scroller?.scrollTo?.({
      top: Math.max(0, scroller.scrollTop + card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    revealSettlement.current = false;
  }, [result, settling]);

  return (
    <div className="phone screen-push tally-screen">
      <div className="nav-row">
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => router.back()}>
          <FiChevronLeft size={28} />
        </button>
        <h1 className="nav-title">{result ? 'The final word' : 'The picks'}</h1>
      </div>
      <div className="scroll">
        {!reveal && <FriendlyLoader />}
        {reveal && bet === null && (
          <BetGone>
            {(error || failed) && (
              <p className="form-error" role="alert">
                {error || LOAD_ERROR}
              </p>
            )}
          </BetGone>
        )}
        {reveal && bet && (
          <>
            <div className="bet-card-top">
              <span className="chip">{typeLabelOf(bet)}</span>
              <span className={`status ${statusLabel(bet).toLowerCase()}`}>{statusLabel(bet)}</span>
            </div>
            <h2 className="question-xl">{questionOf(bet)}</h2>
            <div className="vote-meta">
              {bet.closesAt && votingOpen(bet) ? <p className="closes">Picks close {formatCloses(bet.closesAt)}</p> : null}
              {!result && !votingOpen(bet) && <p className="closes">Picks are closed. The final call is coming.</p>}
            </div>
            <BetFacts bet={bet} />
            <hr className="meta-rule" />
            {result && <><div ref={resultRef}><ResultCard bet={bet} voterId={user?.uid} /></div><ResultShare bet={bet} code={betId} /></>}
            <div className="results-heading">
              <h2>The group’s picks</h2>
              <span>{statusLabel(bet) === 'Open' ? 'Updated live' : 'Final tally'}</span>
            </div>
            <Bars bet={bet} highlightId={bet.winnerId} waiting={votingOpen(bet)} />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {votingOpen(bet) && <div className="tally-share">
              {message && shareState === 'manual' && <p className="manual-message">{message}</p>}
              {shareNote ? <p className="share-note">{shareNote}</p> : null}
              <button type="button" className="cta press" disabled={sharing} onClick={onShare}>
                <FiShare2 size={18} aria-hidden="true" />
                Text the crew
              </button>
            </div>}
            {canSettle && !settling && (
              <button type="button" className="danger press" onClick={() => setSettling(true)}>
                Close & settle
              </button>
            )}
            {canSettle && settling && (
              <SettlePicker bet={bet} saving={saving} onPick={confirmSettle} onCancel={() => setSettling(false)} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TallyScreen;
