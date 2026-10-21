'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from '../platform/Link';
import { useRouter } from '../platform/navigation';
import { FiArrowUpRight, FiArrowRight, FiPlus, FiSearch, FiX } from 'react-icons/fi';
import { deleteBet, subscribeMyBets } from './api';
import CreatorAuthFlow from './AuthSlides';
import { signOutCreator } from './creatorAuth';
import { PHONE_OFFLINE_ERROR, canDeleteBet, isCreator } from './creatorSession';
import { useIdentity } from './identity';
import { isCalledOff } from './betStatus';
import { questionOf, statusLabel, typeLabelOf } from './model';
import { REVEAL_COPY } from './reveal';
import { resultHeadline, settlementOf } from './settlement';
import FriendlyLoader, { useMinHold } from './FriendlyLoader';
import { BetFacts } from './ProductUI';
import DeleteBetDialog from './DeleteBetDialog';
import ProBadge from './ProBadge';
import { useProBadge } from './useEntitlement';
import GoProLink from './GoProLink';
import FriendsView from './FriendsView';
import { friendStats } from './friendStats';
import ProSheet from './ProSheet';
import { ProChip, useProLocked } from './ProLock';
import { PRO_ROW } from './proConfig';

// Friends swaps the bet list for head to head records.
const FILTERS = ['All', 'Open', 'Closed', 'Settled', 'Friends'];
const DELETE_ERROR = 'Couldn\u2019t delete this bet. Try again.';
const TOAST_MS = 4000;

// The card's last line, from the creator's side as the reveal puts it: their
// own win (alone or with others) is "You called it.", never "A friend won"
// for their own unnamed pick.
function cardOutcome(bet, result, uid) {
  if (isCalledOff(bet)) return REVEAL_COPY.calledOff;
  if (!result) return 'See who\u2019s in';
  if (uid && result.winners.some((winner) => winner.voterId === uid)) return REVEAL_COPY.youWon;
  return resultHeadline(result);
}

export function MyBetsList({ user }) {
  const uid = isCreator(user) ? user.uid : '';
  const [bets, setBets] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [toast, setToast] = useState('');
  const [proSheet, setProSheet] = useState(false);
  const deleteTrigger = useRef(null);
  const proTrigger = useRef(null);
  // Head-to-head stats (the Friends filter) are Pro with the paywall on.
  const friendsLocked = useProLocked();
  const proBadge = useProBadge(uid);
  const minElapsed = useMinHold(uid || 'anon');
  const reveal = minElapsed && bets !== null;

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  const openDelete = (bet, event) => {
    deleteTrigger.current = event.currentTarget;
    setDeleteError('');
    setDeleting(bet.id);
  };

  const closeDelete = () => {
    setDeleting(null);
    setDeleteError('');
    deleteTrigger.current?.focus();
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await deleteBet(deleting);
      setDeleting(null);
      setToast('Bet deleted.');
    } catch (err) {
      const offline = err?.code === 'offline'
        || (typeof navigator !== 'undefined' && navigator.onLine === false);
      setDeleteError(offline ? PHONE_OFFLINE_ERROR : DELETE_ERROR);
    } finally {
      setDeleteBusy(false);
    }
  };

  useEffect(() => {
    if (!uid) return undefined;
    setBets(null);
    setError('');
    return subscribeMyBets(uid, (rows, err) => {
      if (err) {
        setError('Could not load your bets. Please check your connection and try again.');
        setBets([]);
        return;
      }
      setError('');
      setBets(rows || []);
    });
  }, [uid]);

  // A plan that lapses while Friends is open goes back to All.
  useEffect(() => {
    if (friendsLocked && filter === 'Friends') setFilter('All');
  }, [friendsLocked, filter]);

  const friends = useMemo(() => friendStats(bets, uid), [bets, uid]);
  const counts = { All: bets?.length || 0, Open: 0, Closed: 0, Settled: 0, Friends: friends.length };
  (bets || []).forEach((bet) => {
    counts[statusLabel(bet)] += 1;
  });
  const visible = (bets || []).filter(
    (bet) =>
      (filter === 'All' || statusLabel(bet) === filter) &&
      `${questionOf(bet)} ${typeLabelOf(bet)} ${bet.stake || ''}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );

  return (
    <div className="stack bets-page">
      {!reveal && <FriendlyLoader />}
      {reveal && (
        <>
          <div className="bets-heading">
            <div>
              <p className="eyebrow">YOUR SIDE OF THE STORY</p>
              <h1 className="screen-title">
                My bets
                <ProBadge badge={proBadge} />
              </h1>
              <p className="intro-copy">The picks, the stakes, and the “told you so” moments.</p>
              <GoProLink />
            </div>
            <Link className="cta press" href="/new">
              <FiPlus size={18} aria-hidden="true" />
              New bet
            </Link>
          </div>
          {error ? (
            <div className="empty error-state">
              <p className="form-error" role="alert">
                {error}
              </p>
              <button
                type="button"
                className="secondary press"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="bet-stats" aria-label="Bet overview">
                <div>
                  <span>Total bets</span>
                  <strong>{counts.All}</strong>
                  <p>A little friendly competition</p>
                </div>
                <div>
                  <span>
                    <i className="live-dot" />
                    Open for picks
                  </span>
                  <strong>{counts.Open}</strong>
                  <p>The crew is picking sides</p>
                </div>
                <div>
                  <span>Settled</span>
                  <strong>{counts.Settled}</strong>
                  <p>Bragging rights delivered</p>
                </div>
              </div>
              <div className="bets-toolbar">
                <div className="bet-filters" role="group" aria-label="Filter bets by status">
                  {FILTERS.map((status) => {
                    const locked = status === 'Friends' && friendsLocked;
                    return (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={filter === status}
                        onClick={(event) => {
                          if (!locked) {
                            setFilter(status);
                            return;
                          }
                          proTrigger.current = event.currentTarget;
                          setProSheet(true);
                        }}
                      >
                        {status}
                        <span>{counts[status]}</span>
                        {locked && <ProChip />}
                      </button>
                    );
                  })}
                </div>
                {filter !== 'Friends' && (
                  <label className="bet-search">
                    <FiSearch aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Search bets"
                      placeholder="Find a bet…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    {search && (
                      <button type="button" aria-label="Clear search" onClick={() => setSearch('')}>
                        <FiX aria-hidden="true" />
                      </button>
                    )}
                  </label>
                )}
              </div>
              {filter === 'Friends' ? (
                <FriendsView friends={friends} />
              ) : bets.length === 0 ? (
                <div className="empty bets-empty">
                  <span className="empty-mark" aria-hidden="true">
                    <FiPlus size={28} />
                  </span>
                  <p className="empty-title">No bets yet</p>
                  <p className="empty-copy">
                    Every good rivalry starts somewhere.
                    <br />
                    Start one and text the link.
                  </p>
                  <Link className="secondary press" href="/new">
                    Create a bet
                    <FiArrowUpRight aria-hidden="true" />
                  </Link>
                </div>
              ) : visible.length === 0 ? (
                <div className="empty bets-empty">
                  <span className="empty-mark">
                    <FiSearch size={24} aria-hidden="true" />
                  </span>
                  <p className="empty-title">No matching bets</p>
                  <p className="empty-copy">Try a different search or check another status.</p>
                  <button
                    className="secondary press"
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setFilter('All');
                    }}
                  >
                    Show all bets
                  </button>
                </div>
              ) : (
                <div className="bet-list">
                  {visible.map((bet) => {
                    const status = statusLabel(bet);
                    const result = settlementOf(bet);
                    return (
                      <div key={bet.id} className="bet-item">
                        <Link className="bet-card press" href={`/t/${bet.id}`}>
                          <span className="bet-card-top">
                            <span className="chip">{typeLabelOf(bet)}</span>
                            <span className={`status ${status.toLowerCase()}`}>{status}</span>
                          </span>
                          <h2 id={`bet-q-${bet.id}`} className="bet-card-question">
                            {questionOf(bet) || 'Untitled bet'}
                          </h2>
                          <BetFacts bet={bet} />
                          <span className="bet-card-bottom">
                            <span>{cardOutcome(bet, result, uid)}</span>
                            <FiArrowRight aria-hidden="true" />
                          </span>
                        </Link>
                        {canDeleteBet(user, bet) && (
                          <button
                            type="button"
                            className="bet-delete press"
                            aria-describedby={`bet-q-${bet.id}`}
                            onClick={(event) => openDelete(bet, event)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <button
            type="button"
            className="logout-link"
            onClick={async () => {
              try {
                await signOutCreator();
              } catch {
                setError('Could not log out. Try again.');
              }
            }}
          >
            Log out
          </button>
        </>
      )}
      {proSheet && (
        <ProSheet
          highlight={PRO_ROW.headToHead}
          onClose={() => {
            setProSheet(false);
            proTrigger.current?.focus();
          }}
          onDone={() => setProSheet(false)}
        />
      )}
      {deleting && (
        <DeleteBetDialog busy={deleteBusy} error={deleteError} onConfirm={confirmDelete} onCancel={closeDelete} />
      )}
      <div className="toast-region" role="status">
        {toast && <p className="toast">{toast}</p>}
      </div>
    </div>
  );
}

const MyBets = () => {
  const user = useIdentity();
  const router = useRouter();
  useEffect(() => {
    document.title = 'My bets · Friendly';
  }, []);
  if (user && !isCreator(user)) {
    return (
      <CreatorAuthFlow
        onCancel={() => router.push('/')}
        phoneFooter={<GoProLink />}
        renderDone={(next) => <MyBetsList key={next.uid} user={next} />}
      />
    );
  }
  return <MyBetsList key={user?.uid || 'connecting'} user={user} />;
};

export default MyBets;
