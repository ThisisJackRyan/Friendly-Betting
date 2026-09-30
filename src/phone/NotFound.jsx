import Link from 'next/link';

const NotFound = () => (
  <div className="phone">
    <div className="scroll">
      <p className="wordmark">Friendly</p>
      <h1 className="screen-title">Lost that one</h1>
      <Link className="secondary press" href="/">Back to bets</Link>
    </div>
  </div>
);

export default NotFound;
