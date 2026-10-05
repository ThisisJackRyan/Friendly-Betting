'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FiCheckCircle, FiLink, FiSlash } from 'react-icons/fi';
import { BetFacts, Brand } from './ProductUI';
import { castVote, hydrateBet, subscribeBet } from './api';
import { rememberName, savedName, useIdentity } from './identity';
import {
  formatCloses,
  friendlyError,
  optionVoteLabel,
  questionOf,
  statusLabel,
  typeLabelOf,
  voteFor,
  votingOpen,
} from './model';
import Bars from './Bars';
import FriendlyLoader, { useMinHold } from './FriendlyLoader';

const VoteScreen = () => {
  const params = useParams();
  const code = params?.code;
  const user = useIdentity();
  const [bet, setBet] = useState(undefined);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [pendingId, setPendingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const minElapsed = useMinHold(code);

  useEffect(() => {
    document.title = 'Vote · Friendly';
    setName(savedName());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBet(undefined);
    setError('');
    const unsubscribe = subscribeBet(code, (next, err) => {
      if (cancelled) return;
      if (err) {
        setError('Could not open this bet.');
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
      hydrateBet(next)
        .then((full) => {
          if (!cancelled) setBet(full);
        })
        .catch(() => {
          if (!cancelled) setBet(next);
        });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [code]);

  const existing = voteFor(bet, user?.uid);
  const selectedId = pendingId || existing?.optionId || null;
  const selected = (bet?.options || []).find((option) => option.id === selectedId);
  const open = bet ? votingOpen(bet) : false;
  const showVoted = Boolean(selected);
  const reveal = minElapsed && bet !== undefined;

  const choose = async (optionId) => {
    if (!bet || !user || !open || saving) return;
    setSaving(true);
    setError('');
    setPendingId(optionId);
    const trimmed = name.trim();
    if (trimmed) rememberName(trimmed);
    try {
      await castVote(code, {
        voterId: user.uid,
        name: trimmed,
        optionId,
      });
    } catch (err) {
      setPendingId(null);
      setError(friendlyError(err, 'Could not place your vote.'));
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
      </header>
      <div className="scroll screen-fade vote-screen">
        {!reveal && <FriendlyLoader />}
        {reveal && bet === null && (
          <div className="empty">
            <FiLink className="empty-glyph" size={18} aria-hidden="true" />
            <p className="empty-title">This bet isn&apos;t here</p>
            <p className="empty-copy">
              Check the link with your friend, or start a new friendly rivalry.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Link className="secondary press" href="/">
              Home
            </Link>
          </div>
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
                <span className="invite-caption">has a friendly wager for you</span>
              </p>
            </div>
            <h1 className="question-xl">{questionOf(bet)}</h1>
            <div className="vote-meta">
              {bet.closesAt ? <p className="closes">Closes {formatCloses(bet.closesAt)}</p> : null}
            </div>
            <BetFacts bet={bet} />
            <hr className="meta-rule" />

            {showVoted && (
              <div className="voted-in">
                <p className="youre-on">
                  <FiCheckCircle size={22} aria-hidden="true" />
                  {"You're on "}
                  <strong>{optionVoteLabel(bet, selected)}</strong>
                </p>
                <Bars bet={bet} highlightId={selectedId} />
                <Link className="text-link" href={`/t/${bet.id || code}`}>
                  Tally
                </Link>
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

            {!showVoted && !open && (
              <div className="voted-in">
                <p className="youre-on">
                  <FiSlash className="state-icon" size={16} aria-hidden="true" />
                  Voting is closed
                </p>
                <Bars bet={bet} />
                <Link className="text-link" href={`/t/${bet.id || code}`}>
                  Tally
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
