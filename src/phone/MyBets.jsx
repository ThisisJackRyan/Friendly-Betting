'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FiPlus } from 'react-icons/fi';
import { subscribeMyBets } from './api';
import { useIdentity } from './identity';
import { questionOf, statusLabel, typeLabelOf } from './model';
import FriendlyLoader, { useMinHold } from './FriendlyLoader';

const MyBets = () => {
  const user = useIdentity();
  const uid = user?.uid;
  const [bets, setBets] = useState(null);
  const [error, setError] = useState('');
  const minElapsed = useMinHold();
  const reveal = minElapsed && bets !== null;

  useEffect(() => {
    document.title = 'My bets · Friendly';
  }, []);

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeMyBets(uid, (rows, err) => {
      if (err) {
        setError('Could not load your bets.');
        setBets([]);
        return;
      }
      setError('');
      setBets(rows || []);
    });
  }, [uid]);

  return (
    <div className="stack">
      {!reveal && <FriendlyLoader />}
      {reveal && (
        <>
          <p className="wordmark">Friendly</p>
          <h1 className="screen-title">My bets</h1>
          {error && <p className="form-error" role="alert">{error}</p>}
          {bets.length === 0 && (
            <div className="empty">
              <span className="empty-mark" aria-hidden="true">
                <FiPlus size={22} />
              </span>
              <p className="empty-title">No bets yet</p>
              <p className="empty-copy">Start one and text the link.</p>
              <Link className="secondary press" href="/new">Create a bet</Link>
            </div>
          )}
          <div className="bet-list">
            {bets.map((bet) => {
              const status = statusLabel(bet);
              return (
                <Link key={bet.id} className="bet-card press" href={`/t/${bet.id}`}>
                  <span className="bet-card-top">
                    <span className="chip">{typeLabelOf(bet)}</span>
                    <span className={`status ${status.toLowerCase()}`}>{status}</span>
                  </span>
                  <span className="bet-card-question">{questionOf(bet) || 'Untitled bet'}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default MyBets;
