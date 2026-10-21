import Link from '../platform/Link';
import ResultCard from './ResultCard';
import ResultShare from './ResultShare';
import { REVEAL_COPY } from './reveal';
import ProBadge from './ProBadge';

// The settled view on /b/ and /t/: who won, then Share the result. Takes a
// buildReveal() result. A count-only legacy bet keeps the plain result card.
// A called-off bet has no result to share, so it gets no Share button.
// `badge`, the viewer's own Pro badge, follows a headline about them.
// `children` (the creator's Undo) go right under the share buttons.
const ABOUT_VIEWER = new Set(['you-won', 'you-solo']);

export default function SettledReveal({ bet, code, reveal, voterId, badge = null, children = null }) {
  return (
    <>
      {reveal.kind === 'legacy' ? <ResultCard bet={bet} voterId={voterId} /> : (
        <section className={`reveal reveal-${reveal.kind}`} aria-label="Settled result">
          {reveal.eyebrow && <p className="reveal-eyebrow">{reveal.eyebrow}</p>}
          {/* Focusable from script only: after a settle ad, focus lands here. */}
          <h2 className="reveal-headline" tabIndex={-1}>
            {reveal.headline}
            {ABOUT_VIEWER.has(reveal.kind) && <ProBadge badge={badge} />}
          </h2>
          <p className="reveal-subline">{reveal.subline}</p>
          {reveal.stake && <p className="reveal-stake">{REVEAL_COPY.stake(reveal.stake)}</p>}
        </section>
      )}
      {reveal.kind !== 'called-off' && <ResultShare bet={bet} code={code} />}
      {children}
      {reveal.startBet && (
        <Link className="cta press reveal-start" href="/new">
          {REVEAL_COPY.startBet}
        </Link>
      )}
    </>
  );
}
