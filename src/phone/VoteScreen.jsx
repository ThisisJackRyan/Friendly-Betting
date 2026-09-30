import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { castVote, hydrateBet, subscribeBet } from './api';
import { rememberName, savedName, useIdentity } from './identity';
import {
  formatCloses,
  friendlyError,
  optionVoteLabel,
  questionOf,
  voteFor,
  votingOpen,
} from './model';
import Bars from './Bars';

const VoteScreen = () => {
  const { code } = useParams();
  const user = useIdentity();
  const [bet, setBet] = useState(undefined);
  const [error, setError] = useState('');
  const [name, setName] = useState(savedName);
  const [pendingId, setPendingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Vote · Friendly';
  }, []);

  useEffect(() => {
    let cancelled = false;
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
  }, [code]);

  const existing = voteFor(bet, user?.uid);
  const selectedId = pendingId || existing?.optionId || null;
  const selected = (bet?.options || []).find((option) => option.id === selectedId);
  const open = bet ? votingOpen(bet) : false;
  const showVoted = Boolean(selected);

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
    <div className="phone">
      <div className="scroll screen-fade vote-screen">
        {bet === undefined && <p className="muted center">Loading…</p>}
        {bet === null && (
          <div className="empty">
            <p>This link does not match a bet.</p>
            <Link className="secondary press" to="/">Home</Link>
          </div>
        )}
        {bet && (
          <>
            <p className="inviter">{bet.createdByName || 'A friend'}</p>
            <h1 className="question-xl">{questionOf(bet)}</h1>
            {bet.closesAt ? <p className="closes">Closes {formatCloses(bet.closesAt)}</p> : null}
            {bet.stake ? <p className="stake-line">{bet.stake}</p> : null}

            {showVoted && (
              <div className="voted-in">
                <p className="youre-on">
                  {"You're on "}
                  <strong>{optionVoteLabel(bet, selected)}</strong>
                </p>
                <Bars bet={bet} highlightId={selectedId} />
                <Link className="text-link" to={`/t/${bet.id || code}`}>Tally</Link>
              </div>
            )}

            {!showVoted && open && (
              <>
                <label className="field" htmlFor="voter-name">
                  <span className="field-label">Your name <span className="optional">optional</span></span>
                  <input
                    id="voter-name"
                    value={name}
                    placeholder="Maya"
                    autoComplete="nickname"
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <div className={(bet.options || []).length === 2 ? 'choices choices-centered' : 'choices'}>
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
              </>
            )}

            {!showVoted && !open && (
              <div className="voted-in">
                <p className="youre-on">Voting is closed</p>
                <Bars bet={bet} />
                <Link className="text-link" to={`/t/${bet.id || code}`}>Tally</Link>
              </div>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
};

export default VoteScreen;
