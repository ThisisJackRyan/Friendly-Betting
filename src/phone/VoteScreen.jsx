'use client';

import { useEffect, useRef, useState } from 'react';
import Link from '../platform/Link';
import { useParams } from '../platform/navigation';
import { FiCheckCircle, FiSlash } from 'react-icons/fi';
import { BetFacts, Brand } from './ProductUI';
import { castVote, renameVote } from './api';
import { useLiveBet } from './useLiveBet';
import { rememberName, savedName, useIdentity } from './identity';
import {
  formatCloses,
  friendlyError,
  hasVote,
  optionVoteLabel,
  questionOf,
  statusLabel,
  typeLabelOf,
  voteFor,
  votingOpen,
  withOptimisticVote,
} from './model';
import Bars from './Bars';
import BetGone from './BetGone';
import FriendlyLoader, { useMinHold } from './FriendlyLoader';
import { isFinished } from './betStatus';
import { rememberBet } from './notificationStore';
import SettledReveal from './SettledReveal';
import { buildReveal } from './reveal';
import ResultsMenu from './ResultsMenu';
import ResultTextCard from './ResultTextCard';
import { resultTextsEnabled } from './resultTexts';
import ProBadge from './ProBadge';
import { useProBadge } from './useEntitlement';
import NameEdit from './NameEdit';
import { NAME_PLACEHOLDER } from './nameEditCopy';
import { cleanName, NAME_MAX } from './votes';

const LOAD_ERROR = 'Could not open this bet.';
// How long a name save may show Saving… before the form gives up and shows
// the save error. A later success still lands.
export const RENAME_WAIT_MS = 10000;

// The bet with this voter's pick showing `name`, while a rename is saving.
function withName(bet, voterId, name) {
  if (!bet || name === null || !Array.isArray(bet.votes)) return bet;
  return {
    ...bet,
    votes: bet.votes.map((vote) => (vote.voterId === voterId ? { ...vote, name } : vote)),
  };
}

const VoteScreen = () => {
  const params = useParams();
  const code = params?.code;
  const user = useIdentity();
  const proBadge = useProBadge(user?.uid);
  const { bet, failed } = useLiveBet(code);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [pendingId, setPendingId] = useState(null);
  // The pick just cast, counted in the tally until a snapshot records it.
  const [optimistic, setOptimistic] = useState(null);
  // That pick once castVote has saved it, until a snapshot records it: the
  // live listener can answer seconds later (two round trips on rules without
  // per-voter docs), and the pick is the voter's own to rename meanwhile.
  const [savedPick, setSavedPick] = useState(null);
  const [saving, setSaving] = useState(false);
  // A name just saved on the voter's pick, shown until a snapshot has it.
  const [renamed, setRenamed] = useState(null);
  const minElapsed = useMinHold(code);
  const alive = useRef(true);
  // The name save waiting on a snapshot to confirm it, if any.
  const renameWait = useRef(null);
  const renameSeq = useRef(0);

  useEffect(() => {
    document.title = 'Make your call · Friendly';
    setName(savedName());
  }, []);

  useEffect(() => {
    setError('');
    setPendingId(null);
    setOptimistic(null);
    setSavedPick(null);
    setRenamed(null);
  }, [code]);

  const recorded = hasVote(bet, optimistic);
  useEffect(() => {
    if (recorded) setOptimistic(null);
  }, [recorded]);

  // The voter's pick as the snapshot has it; `existing` also counts the pick
  // castVote saved before the snapshot shows it.
  const listed = voteFor(bet, user?.uid);
  const existing = listed || (savedPick && savedPick.voterId === user?.uid ? savedPick : null);
  useEffect(() => {
    if (listed && savedPick) setSavedPick(null);
  }, [listed, savedPick]);
  const storedName = existing?.name || '';
  const storedRef = useRef(null);
  storedRef.current = existing ? storedName : null;
  useEffect(() => {
    if (renamed !== null && storedName === renamed) setRenamed(null);
  }, [renamed, storedName]);
  // A snapshot with the new name means the write is on the server, even if
  // the transaction's own answer is slow to come back, or only comes after
  // the save timed out.
  useEffect(() => {
    const wait = renameWait.current;
    if (wait && existing && storedName === wait.name) wait.done();
  }, [existing, storedName]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      renameWait.current?.stop();
      renameWait.current = null;
    };
  }, []);
  const tally = withName(withOptimisticVote(bet, optimistic), user?.uid, renamed);
  const selectedId = pendingId || existing?.optionId || null;
  const selected = (bet?.options || []).find((option) => option.id === selectedId);
  const open = bet ? votingOpen(bet) : false;
  const showVoted = Boolean(selected);
  const reveal = minElapsed && bet !== undefined;
  const settled = buildReveal({ bet, viewerId: user?.uid });
  // Only a recorded pick on a bet that isn't settled or called off, from a
  // real (anonymous) account.
  const offerResultText = resultTextsEnabled() && Boolean(listed) && !isFinished(bet)
    && Boolean(user) && !user.isLocal;

  useEffect(() => {
    if (existing) rememberBet(user.uid, code);
  }, [existing, user?.uid, code]);

  const final = Boolean(settled);
  useEffect(() => {
    if (final) document.title = 'The final word · Friendly';
  }, [final]);

  const choose = async (optionId) => {
    if (!bet || !user || !open || saving) return;
    setSaving(true);
    setError('');
    setPendingId(optionId);
    const trimmed = cleanName(name);
    if (trimmed) rememberName(trimmed);
    const pick = { voterId: user.uid, name: trimmed, optionId };
    setOptimistic(pick);
    try {
      await castVote(code, pick);
      if (alive.current) setSavedPick(pick);
    } catch (err) {
      setPendingId(null);
      setOptimistic(null);
      setSavedPick(null);
      setError(friendlyError(err, 'Your pick didn’t stick. Give it another go.'));
    } finally {
      setSaving(false);
    }
  };

  // Only the name changes; the side stays whatever the bet records. Done as
  // soon as renameVote resolves or a snapshot shows the new name; after
  // RENAME_WAIT_MS with neither it fails, and a later success still lands:
  // the screen shows it, and the name is remembered whether the answer or a
  // snapshot brings it. Only the newest save is remembered, so a late answer
  // or snapshot for an older name never replaces a newer one.
  const saveName = (next) => new Promise((resolve, reject) => {
    let settled = false;
    const seq = ++renameSeq.current;
    const landed = () => {
      // A newer save owns the remembered name.
      if (seq !== renameSeq.current) return;
      rememberName(next);
      if (alive.current) setName(next);
    };
    const release = () => {
      if (renameWait.current === wait) renameWait.current = null;
    };
    // After a time out, a late answer or snapshot still remembers the name.
    const late = () => {
      release();
      landed();
    };
    const finish = (err, timedOut = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // A timed out save keeps waiting for its snapshot.
      if (!timedOut) release();
      if (err) {
        if (alive.current) setRenamed(null);
        reject(err);
        return;
      }
      landed();
      resolve();
    };
    const wait = {
      name: next,
      done: () => (settled ? late() : finish()),
      stop: () => clearTimeout(timer),
    };
    // NameEdit shows its own save error for any failure, this one included.
    const timer = setTimeout(() => finish(new Error(), true), RENAME_WAIT_MS);
    renameWait.current = wait;
    setRenamed(next);
    if (storedRef.current === next) wait.done();
    renameVote(code, user.uid, next).then(
      () => (settled ? late() : finish()),
      (err) => finish(err),
    );
  });

  return (
    <main className="phone focus-column">
      <header className="vote-header">
        <Link href="/" aria-label="Friendly home">
          <Brand />
        </Link>
        <span>BETTER WITH FRIENDS</span>
        <ResultsMenu />
      </header>
      <div className="scroll screen-fade vote-screen">
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
            {/* A called-off bet has no invite header; the result card below
                says it all. */}
            {settled?.kind !== 'called-off' && (
              <div className="invite-line">
                <span className="invite-avatar" aria-hidden="true">
                  {(bet.createdByName || 'F').charAt(0).toUpperCase()}
                </span>
                <p>
                  <span className="inviter">
                    {bet.createdByName || 'A friend'}
                    {Boolean(bet.createdByID) && bet.createdByID === user?.uid && <ProBadge badge={proBadge} />}
                  </span>
                  <span className="invite-caption">{settled ? 'settled this friendly wager' : 'has a friendly wager for you'}</span>
                </p>
              </div>
            )}
            <h1 className="question-xl">{questionOf(bet)}</h1>
            <div className="vote-meta">
              {bet.closesAt && open ? <p className="closes">Picks close {formatCloses(bet.closesAt)}</p> : null}
            </div>
            <BetFacts bet={tally} />
            <hr className="meta-rule" />

            {settled && <SettledReveal bet={bet} code={code} reveal={settled} voterId={user?.uid} badge={proBadge} />}

            {showVoted && !settled && (
              <div className="voted-in">
                <p className="youre-on">
                  <FiCheckCircle size={22} aria-hidden="true" />
                  {"You’re on "}
                  <strong>{optionVoteLabel(bet, selected)}</strong>
                </p>
                {existing && open && <NameEdit current={renamed ?? storedName} onSave={saveName} />}
                <Bars bet={tally} highlightId={selectedId} />
                <Link className="text-link" href={`/t/${bet.id || code}`}>
                  See the picks
                </Link>
                <p className="form-footnote">Your result lands here when your friend settles. Come back on this browser.</p>
                {offerResultText && <ResultTextCard code={code} />}
              </div>
            )}

            {!showVoted && open && (
              <>
                <div className="pick-heading">
                  <h2>What’s your call?</h2>
                  <p>Pick a side. Make it official.</p>
                </div>
                <label className="field" htmlFor="voter-name">
                  <span className="field-label">
                    Your name <span className="optional">optional</span>
                  </span>
                  <input
                    id="voter-name"
                    value={name}
                    placeholder={NAME_PLACEHOLDER}
                    autoComplete="nickname"
                    maxLength={NAME_MAX}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <div
                  className={
                    (bet.options || []).length === 2 ? 'choices choices-centered' : 'choices'
                  }
                >
                  {(bet.options || []).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="choice press"
                      disabled={!user || saving}
                      onClick={() => choose(option.id)}
                    >
                      {optionVoteLabel(bet, option)}
                    </button>
                  ))}
                </div>
                {!user && <p className="muted">Connecting…</p>}
                <p className="form-footnote">One pick. No account needed.</p>
              </>
            )}

            {!showVoted && !open && !settled && (
              <div className="voted-in">
                <p className="youre-on">
                  <FiSlash className="state-icon" size={16} aria-hidden="true" />
                  Picks are closed. The final call is coming.
                </p>
                <Bars bet={bet} />
                <Link className="text-link" href={`/t/${bet.id || code}`}>
                  See the picks
                </Link>
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
      <footer className="vote-footer">A little rivalry. A lot of good times.</footer>
    </main>
  );
};

export default VoteScreen;
