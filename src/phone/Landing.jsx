'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  FiArrowRight,
  FiArrowUpRight,
  FiBarChart2,
  FiCheckCircle,
  FiGrid,
  FiLink,
  FiMessageCircle,
  FiPlus,
  FiTrendingUp,
} from 'react-icons/fi';
import { ExampleBet } from './ProductUI';
import { useCreateChrome } from './createChrome';
import { clearHomeArrival, homeArrivalPending } from './createMotion';

const Landing = ({ quiet = false }) => {
  const bodyRef = useRef(null);
  const { pinPhoneTabs, setPinPhoneTabs } = useCreateChrome();

  useEffect(() => {
    if (quiet || !homeArrivalPending()) return undefined;
    bodyRef.current?.classList.remove('screen-fade');
    const id = window.setTimeout(clearHomeArrival, 100);
    return () => window.clearTimeout(id);
  }, [quiet]);

  const onStart = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (quiet || pinPhoneTabs) return;
    setPinPhoneTabs(true);
  };

  const copy = (
    <div
      ref={bodyRef}
      className={quiet || pinPhoneTabs ? 'scroll landing-body' : 'scroll landing-body screen-fade'}
    >
      <div className="home-heading">
        <div>
          <p className="eyebrow">WELCOME TO FRIENDLY</p>
          <h1>Good times. Better stakes.</h1>
        </div>
        <span className="home-heading-note">Keep it light. Make it interesting.</span>
      </div>
      <section className="home-hero" aria-labelledby="hero-title">
        <div className="landing-copy">
          <p className="hero-eyebrow">
            <span className="live-dot" />
            FOR THE LOVE OF THE GAME. AND THE GROUP CHAT.
          </p>
          <h2 id="hero-title" className="landing-title">
            A little rivalry.
            <br />
            <span>A lot of good times.</span>
          </h2>
          <p className="landing-sub">
            Turn “I bet you” into something official.
            <br className="desktop-break" /> Make a bet, text your friends, and let it play out.
          </p>
          <Link className="cta press landing-cta" href="/new" onClick={onStart}>
            Start a bet
            <FiArrowUpRight size={19} aria-hidden="true" />
          </Link>
          <p className="hero-footnote">
            <FiCheckCircle aria-hidden="true" />
            Friends pick in one tap. No app needed.
          </p>
        </div>
        <ExampleBet />
      </section>
      <section className="home-types" aria-labelledby="home-types-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR CALL</p>
            <h2 id="home-types-title">There’s a bet for that.</h2>
          </div>
          <span>Big games. Small disagreements. Anything goes.</span>
        </div>
        <div className="starter-grid">
          {[
            {
              id: 'money-line',
              icon: FiTrendingUp,
              name: 'Pick a side',
              type: 'Money Line',
              hint: 'Two sides. One winner.',
              example: '“Who’s taking the win tonight?”',
              color: 'mint',
            },
            {
              id: 'over-under',
              icon: FiBarChart2,
              name: 'Call the number',
              type: 'Over-Under',
              hint: 'Set the line. Take your pick.',
              example: '“Over or under 90 on Saturday?”',
              color: 'butter',
            },
            {
              id: 'prop',
              icon: FiGrid,
              name: 'Make it your own',
              type: 'Prop',
              hint: 'A few options. Endless possibilities.',
              example: '“Who’s showing up last?”',
              color: 'lavender',
            },
          ].map(({ id, icon: Icon, name, type: label, hint, example, color }) => (
            <Link href={`/new/${id}`} className={`starter-card press ${color}`} key={id}>
              <div className="starter-top">
                <span className="starter-icon">
                  <Icon size={23} aria-hidden="true" />
                </span>
                <span className="starter-type">{label}</span>
                <FiArrowUpRight size={19} aria-hidden="true" />
              </div>
              <h3>{name}</h3>
              <p>{hint}</p>
              <span className="starter-example">{example}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="how-heading">
          <p className="eyebrow">LESS SETUP. MORE GAME ON.</p>
          <h2 id="how-title">From “bet?” to “told you.”</h2>
        </div>
        <div className="how-steps">
          {[
            {
              icon: FiPlus,
              title: 'Make the call',
              copy: 'Set the question, choices, and stakes.',
            },
            { icon: FiLink, title: 'Text the crew', copy: 'Share a link. Everyone picks a side.' },
            {
              icon: FiCheckCircle,
              title: 'Settle the score',
              copy: 'Follow the picks. Crown the winner.',
            },
          ].map(({ icon: Icon, title, copy }, index) => (
            <div className="how-step" key={title}>
              <span className="how-number">0{index + 1}</span>
              <div>
                <h3>
                  <Icon size={16} aria-hidden="true" />
                  {title}
                </h3>
                <p>{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <footer className="home-footer">
        <span>
          <FiMessageCircle aria-hidden="true" />
          Made for your group chat.
        </span>
        <Link href="/bets">
          Back for more? View your bets
          <FiArrowRight aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );

  return <div className="phone landing">{copy}</div>;
};

export default Landing;
