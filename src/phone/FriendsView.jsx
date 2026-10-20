'use client';

import { useState } from 'react';
import Link from '../platform/Link';
import { FiArrowRight, FiChevronDown } from 'react-icons/fi';
import { questionOf, statusLabel } from './model';
import { REVEAL_COPY } from './reveal';
import { BetFacts } from './ProductUI';

const OUTCOME = { win: 'W', loss: 'L', 'called-off': REVEAL_COPY.calledOff };

// My bets, Friends: each friend's record on the creator's bets (see
// friendStats.js), and a tap opens the bets they picked on.
export default function FriendsView({ friends }) {
  const [openId, setOpenId] = useState(null);
  if (!friends.length) return <p className="friends-empty">No friends yet</p>;
  return (
    <section className="friends" aria-labelledby="friends-heading">
      <p id="friends-heading" className="eyebrow">Head to head</p>
      <ul className="friend-list">
        {friends.map((friend, index) => {
          const open = openId === friend.voterId;
          const listId = `friend-bets-${index}`;
          return (
            <li key={friend.voterId} className="friend">
              <button
                type="button"
                className="friend-row press"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpenId(open ? null : friend.voterId)}
              >
                <span className="friend-name">{friend.name}</span>
                <span className="friend-record">
                  <span className="friend-pill win"><strong>{friend.wins}</strong> W</span>
                  <span className="friend-pill loss"><strong>{friend.losses}</strong> L</span>
                </span>
                <span className="friend-together">
                  Bets together <strong>{friend.betsTogether}</strong>
                </span>
                <FiChevronDown className="friend-chevron" aria-hidden="true" />
              </button>
              {open && (
                <ul id={listId} className="friend-bets">
                  {friend.bets.map(({ bet, outcome }) => {
                    const status = statusLabel(bet);
                    return (
                      <li key={bet.id}>
                        <Link className="friend-bet press" href={`/t/${bet.id}`}>
                          <span className="bet-card-top">
                            <span className={`status ${status.toLowerCase()}`}>{status}</span>
                            {OUTCOME[outcome] && (
                              <span className={`friend-pill ${outcome}`}>{OUTCOME[outcome]}</span>
                            )}
                          </span>
                          <span className="friend-bet-question">{questionOf(bet) || 'Untitled bet'}</span>
                          <BetFacts bet={bet} />
                          <FiArrowRight className="friend-bet-arrow" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
