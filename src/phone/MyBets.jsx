import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { subscribeMyBets } from './api';
import { useIdentity } from './identity';
import { questionOf, statusLabel, typeLabelOf } from './model';

const MyBets = () => {
  const user = useIdentity();
  const [bets, setBets] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'My bets · Friendly';
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeMyBets(user.uid, (rows, err) => {
      if (err) {
        setError('Could not load your bets.');
        setBets([]);
        return;
      }
      setError('');
      setBets(rows || []);
    });
  }, [user]);

  return (
    <div className="stack">
      <p className="wordmark">Friendly</p>
      <h1 className="screen-title">My bets</h1>
      {error && <p className="form-error" role="alert">{error}</p>}
      {bets === null && <p className="muted">Loading…</p>}
      {bets && bets.length === 0 && (
        <div className="empty">
          <p>No bets yet.</p>
          <Link className="secondary press" to="/">Create a bet</Link>
        </div>
      )}
      <div className="bet-list">
        {bets && bets.map((bet) => {
          const status = statusLabel(bet);
          return (
            <Link key={bet.id} className="bet-card press" to={`/t/${bet.id}`}>
              <span className="bet-card-top">
                <span className="chip">{typeLabelOf(bet)}</span>
                <span className={`status ${status.toLowerCase()}`}>{status}</span>
              </span>
              <span className="bet-card-question">{questionOf(bet) || 'Untitled bet'}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default MyBets;
