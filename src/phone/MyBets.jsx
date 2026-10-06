'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FiArrowUpRight, FiArrowRight, FiPlus, FiSearch, FiX } from 'react-icons/fi';
import { subscribeMyBets } from './api';
import CreatorAuthFlow from './AuthSlides';
import { signOutCreator } from './creatorAuth';
import { isCreator } from './creatorSession';
import { useIdentity } from './identity';
import { questionOf, statusLabel, typeLabelOf } from './model';
import { resultHeadline, settlementOf } from './settlement';
import FriendlyLoader, { useMinHold } from './FriendlyLoader';
import { BetFacts } from './ProductUI';

const FILTERS = ['All', 'Open', 'Closed', 'Settled'];

export function MyBetsList({ user }) {
  const uid = isCreator(user) ? user.uid : '';
  const [bets, setBets] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const minElapsed = useMinHold(uid || 'anon');
  const reveal = minElapsed && bets !== null;

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

  const counts = { All: bets?.length || 0, Open: 0, Closed: 0, Settled: 0 };
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
              <h1 className="screen-title">My bets</h1>
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
                  {FILTERS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={filter === status}
                      onClick={() => setFilter(status)}
                    >
                      {status}
                      <span>{counts[status]}</span>
                    </button>
                  ))}
                </div>
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
              </div>
              {bets.length === 0 ? (
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
                      <Link key={bet.id} className="bet-card press" href={`/t/${bet.id}`}>
                        <span className="bet-card-top">
                          <span className="chip">{typeLabelOf(bet)}</span>
                          <span className={`status ${status.toLowerCase()}`}>{status}</span>
                        </span>
                        <h2 className="bet-card-question">{questionOf(bet) || 'Untitled bet'}</h2>
                        <BetFacts bet={bet} />
                        <span className="bet-card-bottom">
                          <span>
                            {result ? resultHeadline(result) : 'See who’s in'}
                          </span>
                          <FiArrowRight aria-hidden="true" />
                        </span>
                      </Link>
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
        renderDone={(next) => <MyBetsList key={next.uid} user={next} />}
      />
    );
  }
  return <MyBetsList key={user?.uid || 'connecting'} user={user} />;
};

export default MyBets;
