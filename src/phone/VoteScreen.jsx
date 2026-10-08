'use client';

import { useEffect, useState } from 'react';
import Link from '../platform/Link';
import { useParams } from '../platform/navigation';
import { FiCheckCircle, FiSlash } from 'react-icons/fi';
import { BetFacts, Brand } from './ProductUI';
import { castVote } from './api';
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
import { rememberBet } from './notificationStore';
import { settlementOf } from './settlement';
import ResultCard from './ResultCard';
import ResultsMenu from './ResultsMenu';
import ResultShare from './ResultShare';
import ResultTextCard from './ResultTextCard';
import { resultTextsEnabled } from './resultTexts';

const LOAD_ERROR = 'Could not open this bet.';

const VoteScreen = () => {
  const params = useParams();
  const code = params?.code;
  const user = useIdentity();
  const { bet, failed } = useLiveBet(code);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [pendingId, setPendingId] = useState(null);
  // The pick just cast, counted in the tally until a snapshot records it.
  const [optimistic, setOptimistic] = useState(null);
  const [saving, setSaving] = useState(false);
  const minElapsed = useMinHold(code);

  useEffect(() => {
    document.title = 'Make your call · Friendly';
    setName(savedName());
  }, []);

  useEffect(() => {
    setError('');
    setPendingId(null);
    setOptimistic(null);
  }, [code]);

  const recorded = hasVote(bet, optimistic);
  useEffect(() => {
    if (recorded) setOptimistic(null);
  }, [recorded]);

  const tally = withOptimisticVote(bet, optimistic);
  const existing = voteFor(bet, user?.uid);
  const selectedId = pendingId || existing?.optionId || null;
  const selected = (bet?.options || []).find((option) => option.id === selectedId);
  const open = bet ? votingOpen(bet) : false;
  const showVoted = Boolean(selected);
  const reveal = minElapsed && bet !== undefined;
  const result = settlementOf(bet);
  // Only a recorded pick on an unsettled bet, from a real (anonymous) account.
  const offerResultText = resultTextsEnabled() && Boolean(existing) && !result
    && bet?.status !== 'closed' && Boolean(user) && !user.isLocal;

  useEffect(() => {
    if (existing) rememberBet(user.uid, code);
  }, [existing, user?.uid, code]);

  useEffect(() => {
    if (result) document.title = 'The final word · Friendly';
  }, [result]);

  const choose = async (optionId) => {
    if (!bet || !user || !open || saving) return;
    setSaving(true);
    setError('');
    setPendingId(optionId);
    const trimmed = name.trim();
    if (trimmed) rememberName(trimmed);
    setOptimistic({ voterId: user.uid, name: trimmed, optionId });
    try {
      await castVote(code, {
        voterId: user.uid,
        name: trimmed,
        optionId,
      });
    } catch (err) {
      setPendingId(null);
      setOptimistic(null);
      setError(friendlyError(err, 'Your pick didn’t stick. Give it another go.'));
    } finally {
      setSaving(false);
    }
  };

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
            <div className="invite-line">
              <span className="invite-avatar" aria-hidden="true">
                {(bet.createdByName || 'F').charAt(0).toUpperCase()}
              </span>
              <p>
                <span className="inviter">{bet.createdByName || 'A friend'}</span>
                <span className="invite-caption">{result ? 'settled this friendly wager' : 'has a friendly wager for you'}</span>
              </p>
            </div>
            <h1 className="question-xl">{questionOf(bet)}</h1>
            <div className="vote-meta">
              {bet.closesAt && open ? <p className="closes">Picks close {formatCloses(bet.closesAt)}</p> : null}
            </div>
            <BetFacts bet={bet} />
            <hr className="meta-rule" />

            {result && (
              <>
                <ResultCard bet={bet} voterId={user?.uid} />
                <ResultShare bet={bet} code={code} />
                <div className="results-heading"><h2>The group’s picks</h2><span>Final tally</span></div>
                <Bars bet={bet} highlightId={bet.winnerId} showVoters />
              </>
            )}

            {showVoted && !result && (
              <div className="voted-in">
                <p className="youre-on">
                  <FiCheckCircle size={22} aria-hidden="true" />
                  {"You're on "}
                  <strong>{optionVoteLabel(bet, selected)}</strong>
                </p>
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
                    placeholder="Maya"
                    autoComplete="nickname"
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

            {!showVoted && !open && !result && (
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
