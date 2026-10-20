'use client';

import { useEffect, useRef, useState } from 'react';
import Link from '../platform/Link';
import { useParams, useRouter } from '../platform/navigation';
import { FiChevronLeft, FiShare2 } from 'react-icons/fi';
import { BetFacts } from './ProductUI';
import { callOffBet, settleBet, undoSettle } from './api';
import { useLiveBet } from './useLiveBet';
import { canSettleBet, isBetCreator } from './creatorSession';
import { isFinished } from './betStatus';
import { useIdentity } from './identity';
import {
  formatCloses,
  friendlyError,
  optionVoteLabel,
  questionOf,
  statusLabel,
  tallyCounts,
  typeLabelOf,
  voteFor,
  votingOpen,
} from './model';
import { formatInvite } from './inviteCopy';
import { voteUrl } from './routes';
import { hasShareSheet, openShareSheet, shareMessage } from './share';
import { takeFreshBet } from './freshBet';
import Bars from './Bars';
import BetGone from './BetGone';
import FriendlyLoader, { useMinHold } from './FriendlyLoader';
import { buildSettlement, settlementOf } from './settlement';
import ResultCard from './ResultCard';
import SettledReveal from './SettledReveal';
import RunItBack from './RunItBack';
import UndoSettle from './UndoSettle';
import { undoRemainingMs } from './undoSettle';
import ConfirmDialog from './ConfirmDialog';
import { buildReveal } from './reveal';
import { rememberBet } from './notificationStore';
import { prefersReducedMotion } from './createMotion';
import { useInviteShare } from '../ads/useInviteShare';
import { useSettleAd } from '../ads/useSettleAd';
import { useProBadge } from './useEntitlement';

const INVITE_LABEL = 'Text the crew';

const LOAD_ERROR = 'Couldn’t load the crew’s picks. Try again in a bit.';

// The Call off confirm. The reveal after keeps REVEAL_COPY.calledOffSub.
const CALL_OFF_COPY = 'Nobody wins this one.';

const SHARE_NOTE = {
  shared: 'Pick who gets it.',
  sms: 'Opening Messages.',
  copied: 'Copied. Paste it into a text.',
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
  const proBadge = useProBadge(user?.uid);
  const { bet: liveBet, setBet, failed } = useLiveBet(betId);
  // While a settle ad and its thank-you are up, the screen stays as it was at
  // the tap (the picker, Settling…) even after the live snapshot flips to
  // settled, so the reveal happens once, after the overlay. Never over a
  // deleted bet.
  const [held, setHeld] = useState(null);
  const bet = held && liveBet ? held : liveBet;
  const [error, setError] = useState('');
  const [settling, setSettling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [shareState, setShareState] = useState('');
  const [sharing, setSharing] = useState(false);
  // When this screen's settle saved, for the Undo countdown (UndoSettle).
  const [settledLocalAt, setSettledLocalAt] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState('');
  const [callOff, setCallOff] = useState({ open: false, busy: false, error: '' });
  const callOffTrigger = useRef(null);
  const resultRef = useRef(null);
  const revealSettlement = useRef(false);
  // Whether this tab just made this bet (see freshBet): undefined until the
  // first mount takes the note, then true until the share sheet opens once.
  const fresh = useRef(undefined);
  const minElapsed = useMinHold(betId);
  // Every invite share (the button and the one after Create) goes through the
  // ad gate: maybe an interstitial and a thank-you, then the same share.
  const invite = useInviteShare({
    continueLabel: <><FiShare2 size={18} aria-hidden="true" />{INVITE_LABEL}</>,
  });
  // After a settle saves with no Undo to offer: maybe an interstitial and a
  // thank-you, then the reveal. A settle with Undo skips both (confirmSettle).
  const settleAd = useSettleAd();

  useEffect(() => {
    if (fresh.current === undefined) fresh.current = takeFreshBet(betId);
  }, [betId]);

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
    // Hold from the tap when an ad may follow: the snapshot can flip to
    // settled before settleBet resolves. Only a read of the caps: nothing is
    // counted unless an ad actually shows.
    const tryAd = settleAd.mayShow();
    if (tryAd) setHeld(bet);
    setSaving(true);
    setError('');
    setUndoError('');
    let settled;
    let localAt;
    try {
      // Saves first, and asks the server for the result texts, before any ad.
      settled = await settleBet(betId, winnerId);
      localAt = Date.now();
      setSettledLocalAt(localAt);
    } catch (err) {
      setHeld(null);
      setError(friendlyError(err, 'Could not settle this bet.'));
      setSaving(false);
      return;
    }
    const reveal = () => {
      revealSettlement.current = true;
      if (settled) setBet(settled);
      setHeld(null);
      setSettling(false);
      setSaving(false);
    };
    // A settle with Undo goes straight to the reveal, with no ad and no
    // thank-you, so the whole window is there to use (docs/ADS.md). Only a
    // settle that comes back with no Undo (one already saved, from a stale
    // screen) goes through the ad gate.
    if (!tryAd || undoRemainingMs(settled, { localAt }) > 0) {
      reveal();
      return;
    }
    await settleAd.run(reveal);
  };

  // Back to open, within the window. Settling again skips the ad too.
  const onUndo = async () => {
    if (undoing) return;
    setUndoing(true);
    setUndoError('');
    try {
      const reopened = await undoSettle(betId);
      setSettledLocalAt(null);
      setBet(reopened);
    } catch (err) {
      setUndoError(err?.code === 'permission-denied' ? 'Too late to undo.' : friendlyError(err, 'Couldn’t undo that. Try again.'));
    } finally {
      setUndoing(false);
    }
  };

  // Kept the bet: back to the Call off button, as My bets does for Delete.
  const closeCallOff = () => {
    setCallOff({ open: false, busy: false, error: '' });
    callOffTrigger.current?.focus();
  };

  const confirmCallOff = async () => {
    if (callOff.busy) return;
    setCallOff({ open: true, busy: true, error: '' });
    try {
      const off = await callOffBet(betId);
      setBet(off);
      setCallOff({ open: false, busy: false, error: '' });
    } catch (err) {
      setCallOff({ open: true, busy: false, error: friendlyError(err, 'Couldn’t call off this bet. Try again.') });
    }
  };

  const inviteText = () => formatInvite({
    title: questionOf(bet),
    stake: bet.stake,
    url: voteUrl(bet.code || betId),
  });

  // Not async: with no ad to try, shareMessage starts inside this click, so
  // the browser still sees the tap navigator.share needs.
  // Never while a settle is saving or its ad is up: the bet only looks open.
  const onShare = () => {
    if (!bet || sharing || saving || held) return;
    const text = inviteText();
    setMessage(text);
    setSharing(true);
    invite.share(() => shareMessage(text))
      .then((result) => {
        if (result != null) setShareState(result);
      })
      .finally(() => setSharing(false));
  };

  // Right after Create, the share sheet opens by itself, once. Only a real
  // sheet: with none (or if the browser refuses it) the invite button waits.
  useEffect(() => {
    if (!bet || held || !fresh.current || !votingOpen(bet)) return;
    fresh.current = false;
    if (!hasShareSheet()) return;
    const text = inviteText();
    setMessage(text);
    setSharing(true);
    invite.share(() => openShareSheet(text))
      .then((result) => {
        if (result != null) setShareState(result);
      })
      .finally(() => setSharing(false));
  }, [bet]);

  const canSettle = canSettleBet(user, bet);
  // Only an open bet can be called off; a settle can only be undone.
  const canCallOff = canSettle && !isFinished(bet);
  const result = settlementOf(bet);
  const settled = buildReveal({ bet, viewerId: user?.uid });
  const reveal = minElapsed && bet !== undefined;
  const shareNote = SHARE_NOTE[shareState];
  // The creator's own open bet with no picks yet: texting the crew is next.
  const nudge = Boolean(bet) && votingOpen(bet) && isBetCreator(user, bet)
    && tallyCounts(bet).every((row) => row.count === 0);
  // The creator's own open bet they haven't picked on yet. `settled` also
  // covers a called-off bet. A pick made on the vote page shows up here once
  // its snapshot does (the vote screen's optimistic pick stays on that screen).
  const offerVote = Boolean(bet) && votingOpen(bet) && !settled && isBetCreator(user, bet)
    && !voteFor(bet, user.uid);

  useEffect(() => {
    if (bet?.votes?.some((vote) => vote.voterId === user?.uid)) rememberBet(user.uid, betId);
  }, [bet, user?.uid, betId]);

  // While a settle is held, the open-bet actions stay in place but are inert.
  const locked = saving || Boolean(held);

  const final = Boolean(settled);
  useEffect(() => {
    if (final) document.title = 'The final word · Friendly';
  }, [final]);

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
        <h1 className="nav-title">{settled ? 'The final word' : 'The picks'}</h1>
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
              {!settled && !votingOpen(bet) && <p className="closes">Picks are closed. The final call is coming.</p>}
            </div>
            <BetFacts bet={bet} />
            <hr className="meta-rule" />
            {settled ? (
              <div ref={resultRef} className="reveal-wrap">
                <SettledReveal bet={bet} code={betId} reveal={settled} voterId={user?.uid} badge={proBadge}>
                  {isBetCreator(user, bet) && (
                    <UndoSettle bet={bet} localAt={settledLocalAt} busy={undoing} error={undoError} onUndo={onUndo} />
                  )}
                </SettledReveal>
              </div>
            ) : (
              <>
                <div className="results-heading">
                  <h2>The group’s picks</h2>
                  <span>{statusLabel(bet) === 'Open' ? 'Updated live' : 'Final tally'}</span>
                </div>
                <Bars bet={bet} highlightId={bet.winnerId} waiting={votingOpen(bet)} showVoters viewerId={user?.uid} viewerBadge={proBadge} />
              </>
            )}
            {settled && <RunItBack bet={bet} code={betId} user={user} />}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {votingOpen(bet) && <div className={nudge ? 'tally-share is-nudge' : 'tally-share'}>
              {message && shareState === 'manual' && <p className="manual-message">{message}</p>}
              {shareNote ? <p className="share-note">{shareNote}</p> : null}
              <button type="button" className={nudge ? 'cta press cta-nudge' : 'cta press'} disabled={sharing || locked} onClick={onShare}>
                <FiShare2 size={18} aria-hidden="true" />
                {INVITE_LABEL}
              </button>
              {offerVote && (
                <Link
                  className="text-link tally-vote-link"
                  href={`/b/${encodeURIComponent(bet.code || betId)}`}
                  aria-disabled={locked ? 'true' : undefined}
                  tabIndex={locked ? -1 : undefined}
                  onClick={locked ? (event) => event.preventDefault() : undefined}
                >
                  Wanna vote?
                </Link>
              )}
            </div>}
            {canSettle && !settling && (
              <button type="button" className="danger press" onClick={() => setSettling(true)}>
                Close & settle
              </button>
            )}
            {canCallOff && !settling && (
              <button
                ref={callOffTrigger}
                type="button"
                className="text-link tally-call-off"
                disabled={locked}
                onClick={() => setCallOff({ open: true, busy: false, error: '' })}
              >
                Call off
              </button>
            )}
            {canSettle && settling && (
              <SettlePicker bet={bet} saving={saving} onPick={confirmSettle} onCancel={() => setSettling(false)} />
            )}
          </>
        )}
      </div>
      {callOff.open && (
        <ConfirmDialog
          title="Call off this bet?"
          copy={CALL_OFF_COPY}
          confirmLabel="Call off bet"
          busyLabel="Calling off…"
          busy={callOff.busy}
          error={callOff.error}
          onConfirm={confirmCallOff}
          onCancel={closeCallOff}
        />
      )}
      {invite.thanks}
      {settleAd.thanks}
    </div>
  );
};

// Keyed by code: Run it back pushes one tally onto another, which React Router
// renders with the same instance, and the new bet needs a fresh screen.
const KeyedTallyScreen = () => {
  const params = useParams() || {};
  return <TallyScreen key={params.code || params.id} />;
};

export default KeyedTallyScreen;
