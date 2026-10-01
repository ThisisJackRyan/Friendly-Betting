'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { clearHomeArrival, homeArrivalPending } from './createMotion';

const Landing = ({ quiet = false }) => {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (quiet || !homeArrivalPending()) return undefined;
    bodyRef.current?.classList.remove('screen-fade');
    const id = window.setTimeout(clearHomeArrival, 100);
    return () => window.clearTimeout(id);
  }, [quiet]);

  return (
    <div className="phone landing">
      <div
        ref={bodyRef}
        className={quiet ? 'scroll landing-body' : 'scroll landing-body screen-fade'}
      >
        <div className="landing-copy">
          <p className="wordmark landing-mark">Friendly</p>
          <h1 className="landing-title">Bet with friends by text</h1>
          <p className="landing-sub">Create a wager, text the link, vote once — no app.</p>
        </div>
        <Link className="cta press landing-cta" href="/new">Make the bet</Link>
      </div>
    </div>
  );
};

export default Landing;
