'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FiAward, FiBell, FiX } from 'react-icons/fi';
import { subscribeBet } from './api';
import { useIdentity } from './identity';
import { markResultRead, watchResults } from './notificationStore';
import { notificationFor } from './settlement';

function ResultInbox({ uid }) {
  const [saved, setSaved] = useState({ codes: [], read: [] });
  const [results, setResults] = useState({});
  const [errors, setErrors] = useState({});
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const panel = useRef(null);

  useEffect(() => watchResults(uid, setSaved), [uid]);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  // Read receipts should not restart Firestore listeners.
  const codesKey = JSON.stringify(saved.codes);
  useEffect(() => {
    setResults({});
    setErrors({});
    const stops = JSON.parse(codesKey).map((code) =>
      subscribeBet(code, (bet, error) => {
        setErrors((current) => ({ ...current, [code]: Boolean(error) }));
        if (!error) {
          setResults((current) => ({ ...current, [code]: notificationFor(bet, uid) }));
        }
      }),
    );
    return () => stops.forEach((stop) => stop());
  }, [uid, codesKey, retry]);

  const notices = Object.values(results).filter(Boolean).sort((a, b) => b.at - a.at);
  const unread = notices.filter((notice) => !saved.read.includes(notice.id));
  const latest = unread[0];
  const failed = Object.values(errors).some(Boolean);
  if (!saved.codes.length) return null;

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <aside
      className="result-notifications"
      aria-label="Bet notifications"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <span className="sr-only" role="status">
        {unread.length ? `${unread.length} new ${unread.length === 1 ? 'result' : 'results'}` : ''}
      </span>
      {latest && !open && (
        <div className="result-toast" key={latest.id}>
          <Link href={`/b/${latest.code}`} onClick={() => markResultRead(uid, latest.id)}>
            <strong>{latest.title}</strong>
            <span>{latest.question}</span>
            <span>{latest.outcome}</span>
            <span>At stake: {latest.stake}</span>
            <small>{latest.oneLiner}</small>
          </Link>
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss result notification"
            onClick={() => markResultRead(uid, latest.id)}
          >
            <FiX aria-hidden="true" />
          </button>
        </div>
      )}
      {open && (
        <section
          ref={panel}
          tabIndex={-1}
          id="friendly-results"
          className="result-inbox"
          aria-label="Your results"
        >
          <div className="result-inbox-heading">
            <h2>The final word</h2>
            <button type="button" className="icon-btn" aria-label="Close results" onClick={close}>
              <FiX aria-hidden="true" />
            </button>
          </div>
          {failed && (
            <div className="result-inbox-error" role="alert">
              Some results couldn’t load.{' '}
              <button type="button" className="text-link" onClick={() => setRetry((value) => value + 1)}>
                Try again
              </button>
            </div>
          )}
          {!notices.length && (
            <p className="result-inbox-empty">
              {failed
                ? 'Your picks are still in. Check back in a bit.'
                : 'Your picks are in. Results land here when your friend settles.'}
            </p>
          )}
          <ul>
            {notices.map((notice) => (
              <li key={notice.id}>
                <Link
                  href={`/b/${notice.code}`}
                  className={saved.read.includes(notice.id) ? '' : 'unread'}
                  onClick={() => {
                    markResultRead(uid, notice.id);
                    setOpen(false);
                  }}
                >
                  <span className="result-notice-title">
                    <FiAward aria-hidden="true" />
                    {notice.title}
                    {!saved.read.includes(notice.id) && (
                      <span className="notice-dot" aria-label="Unread" />
                    )}
                  </span>
                  <span>{notice.question}</span>
                  <strong>{notice.outcome}</strong>
                  <span>At stake: {notice.stake}</span>
                  <small>{notice.oneLiner}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <button
        ref={trigger}
        type="button"
        className="results-trigger press"
        aria-expanded={open}
        aria-controls={open ? 'friendly-results' : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <FiBell aria-hidden="true" />
        Results
        {unread.length > 0 && <span>{unread.length} new</span>}
      </button>
    </aside>
  );
}

export default function ResultNotifications() {
  const user = useIdentity();
  return user?.uid ? <ResultInbox key={user.uid} uid={user.uid} /> : null;
}
