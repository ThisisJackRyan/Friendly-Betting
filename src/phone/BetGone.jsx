import Link from '../platform/Link';

// Vote and tally screens: a deleted bet or a code that never existed.
const BetGone = ({ children }) => (
  <div className="empty">
    <p className="empty-title">This bet’s off the table.</p>
    <p className="empty-copy">It was deleted, or the link’s not quite right.</p>
    {children}
    <Link className="cta press" href="/new">
      Start a bet
    </Link>
  </div>
);

export default BetGone;
