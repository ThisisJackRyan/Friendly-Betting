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
// How long a delete may show Deleting… before the dialog gives up and shows
// the delete error. A delete that lands later still closes the dialog.
export const DELETE_WAIT_MS = 15000;

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
  // The delete waiting on the list to confirm it, if any.
  const deleteWait = useRef(null);
  const alive = useRef(true);
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

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      deleteWait.current?.stop();
    };
  }, []);

  // Done as soon as deleteBet resolves or the live list no longer has the bet
  // (the server's answer can be slow to come back after the delete is in);
  // after DELETE_WAIT_MS with neither it fails.
  const removeBet = (code) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (deleteWait.current === wait) deleteWait.current = null;
      if (err) reject(err);
      else resolve();
    };
    const wait = { code, done: () => finish(), stop: () => { settled = true; clearTimeout(timer); } };
    const timer = setTimeout(() => finish(new Error('Could not delete this bet.')), DELETE_WAIT_MS);
    deleteWait.current = wait;
    deleteBet(code).then(() => finish(), (err) => finish(err || new Error()));
  });

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await removeBet(deleting);
      if (!alive.current) return;
      setDeleting(null);
      setToast('Bet deleted.');
    } catch (err) {
      if (!alive.current) return;
      const offline = err?.code === 'offline'
        || (typeof navigator !== 'undefined' && navigator.onLine === false);
      setDeleteError(offline ? PHONE_OFFLINE_ERROR : DELETE_ERROR);
    } finally {
      if (alive.current) setDeleteBusy(false);
    }
  };

  // The live list without the bet: the delete is on the server (deleteBet
  // only commits on the server, with no local-only removal). It finishes a
  // waiting delete, and closes the dialog if a failed or timed out delete
  // landed after all. A failed list load proves nothing.
  useEffect(() => {
    if (!bets || error) return;
    const gone = (code) => !bets.some((bet) => bet.id === code);
    const wait = deleteWait.current;
    if (wait && gone(wait.code)) wait.done();
    if (deleting && !deleteBusy && deleteError && gone(deleting)) {
      setDeleting(null);
      setDeleteError('');
      setToast('Bet deleted.');
    }
  }, [bets, error, deleting, deleteBusy, deleteError]);

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
              <div className="bets-title-row">
                <h1 className="screen-title">
                  My bets
                  <ProBadge badge={proBadge} />
                </h1>
                <GoProLink chip />
              </div>
              <p className="intro-copy">The picks, the stakes, and the “told you so” moments.</p>
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
