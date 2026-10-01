'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CreatePick from './CreatePick';
import { useCreateChrome } from './createChrome';
import { clearHomeArrival, homeArrivalPending, SLIDE_MS } from './createMotion';

const Landing = ({ quiet = false }) => {
  const router = useRouter();
  const bodyRef = useRef(null);
  const { setPinPhoneTabs } = useCreateChrome();
  const [exitCreate, setExitCreate] = useState(false);

  useEffect(() => {
    if (quiet || !homeArrivalPending()) return undefined;
    bodyRef.current?.classList.remove('screen-fade');
    const id = window.setTimeout(clearHomeArrival, 100);
    return () => window.clearTimeout(id);
  }, [quiet]);

  useLayoutEffect(() => {
    if (quiet || exitCreate) return undefined;
    setPinPhoneTabs(false);
    return undefined;
  }, [quiet, exitCreate, setPinPhoneTabs]);

  useEffect(() => {
    if (!exitCreate) return undefined;
    const id = window.setTimeout(() => router.push('/new'), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [exitCreate, router]);

  const onStart = (event) => {
    if (
      event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    if (quiet || exitCreate) return;
    setPinPhoneTabs(true);
    setExitCreate(true);
  };

  const copy = (
    <div
      ref={bodyRef}
      className={quiet || exitCreate ? 'scroll landing-body' : 'scroll landing-body screen-fade'}
    >
      <div className="landing-copy">
        <p className="wordmark landing-mark">Friendly</p>
        <h1 className="landing-title">Bet with friends by text</h1>
        <p className="landing-sub">Create a wager, text the link, vote once — no app.</p>
      </div>
      <Link className="cta press landing-cta" href="/new" onClick={onStart}>
        Start a bet
      </Link>
    </div>
  );

  if (!quiet && exitCreate) {
    return (
      <div className="phone create-flow is-exiting">
        <div className="create-viewport">
          <div
            className="create-pane is-leaving slide-forward"
            aria-hidden="true"
            inert
          >
            <div className="phone landing">{copy}</div>
          </div>
          <div
            className="create-pane form-fill is-entering slide-forward create-step-pick"
            data-step="1"
          >
            <CreatePick
              onBack={() => {}}
              onHomeClick={(event) => event.preventDefault()}
              onPick={() => {}}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="phone landing">
      {copy}
    </div>
  );
};

export default Landing;
