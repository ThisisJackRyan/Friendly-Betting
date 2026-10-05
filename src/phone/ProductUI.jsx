import { FiArrowUpRight, FiCheck, FiFlag, FiUsers } from 'react-icons/fi';
import { createStepOrder } from './creatorSession';
import { tallyCounts } from './model';

export function Brand({ className = '' }) {
  return (
    <span className={`brand ${className}`}>
      <svg className="brand-symbol" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="currentColor" />
        <path d="M10 8h14v5h-9v3h7v5h-7v5h-5V8Z" fill="var(--brand-letter, #fff)" />
        <circle cx="24" cy="25" r="3" fill="var(--brand-letter, #fff)" />
      </svg>
      <span>
        friendly<span className="brand-period">.</span>
      </span>
    </span>
  );
}

export function PageIntro({ eyebrow, title, children, icon: Icon }) {
  return (
    <div className="page-intro">
      {Icon && (
        <span className="intro-icon">
          <Icon size={24} aria-hidden="true" />
        </span>
      )}
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {children && <p className="intro-copy">{children}</p>}
    </div>
  );
}

const STEP_LABELS = {
  1: 'Bet type',
  2: 'Details',
  3: 'Stakes',
  4: 'Your phone',
  5: 'Verify',
  6: 'Share',
};

export function FlowProgress({ step = 1, user }) {
  const steps = createStepOrder(user);
  const current = Math.max(0, steps.indexOf(step));
  return (
    <div className="flow-progress" aria-label="Create a bet progress">
      <div className="flow-progress-copy">
        <span>MAKE IT FRIENDLY</span>
        <span>
          Step {current + 1} of {steps.length}
        </span>
      </div>
      <ol>
        {steps.map((number, index) => (
          <li
            key={number}
            className={index <= current ? 'is-complete' : ''}
            aria-current={number === step ? 'step' : undefined}
          >
            <span className="sr-only">
              {STEP_LABELS[number]}
              {index < current ? ', completed' : ''}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function BetFacts({ bet }) {
  const votes = tallyCounts(bet).reduce((total, row) => total + row.count, 0);
  return (
    <div className="bet-facts">
      <span>
        <FiUsers aria-hidden="true" />
        {votes} {votes === 1 ? 'pick' : 'picks'}
      </span>
      <span>
        <FiFlag aria-hidden="true" />
        {bet.stake || 'Bragging rights'}
      </span>
    </div>
  );
}

export function ExampleBet() {
  return (
    <div className="example-scene" aria-label="Example of a Friendly bet">
      <span className="scene-orbit orbit-one" aria-hidden="true" />
      <span className="scene-orbit orbit-two" aria-hidden="true" />
      <span className="scene-spark" aria-hidden="true">
        ✳
      </span>
      <div className="example-ticket">
        <div className="ticket-top">
          <span>
            <span className="live-dot" />
            THE GROUP CHAT HAS SPOKEN
          </span>
          <FiArrowUpRight size={18} aria-hidden="true" />
        </div>
        <div className="ticket-body">
          <div className="ticket-label">
            <span>WEEKEND PLANS</span>
            <span>Example bet</span>
          </div>
          <h2>
            Will Alex finally
            <br />
            break 90?
          </h2>
          <div className="ticket-pick">
            <span>This is the round</span>
            <span>3 picks</span>
            <i style={{ width: '60%' }} />
          </div>
          <div className="ticket-pick">
            <span>Not a chance</span>
            <span>2 picks</span>
            <i style={{ width: '40%' }} />
          </div>
          <div className="ticket-stake">
            <FiFlag aria-hidden="true" />
            <span>Coffee on the loser</span>
          </div>
        </div>
        <div className="ticket-footer">
          <span className="sample-avatars" aria-hidden="true">
            <i>A</i>
            <i>J</i>
            <i>M</i>
          </span>
          <span>A little more on the line.</span>
        </div>
      </div>
      <div className="scene-note">
        <span>
          <FiCheck size={16} aria-hidden="true" />
        </span>
        Bragging rights, secured.
      </div>
    </div>
  );
}
