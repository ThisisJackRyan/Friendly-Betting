import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="phone">
    <div className="scroll">
      <p className="wordmark">Friendly</p>
      <h1 className="screen-title">Lost that one</h1>
      <Link className="secondary press" to="/">Back to bets</Link>
    </div>
  </div>
);

export default NotFound;
