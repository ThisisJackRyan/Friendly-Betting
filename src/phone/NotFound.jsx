import Link from '../platform/Link';
import { Brand } from './ProductUI';

const NotFound = () => (
  <main className="phone focus-column">
    <div className="scroll">
      <Brand />
      <div className="empty not-found-state">
        <h1 className="screen-title">Lost that one.</h1>
        <p className="empty-copy">This page doesn’t exist. If a friend sent you a bet link, ask them to text it again.</p>
        <Link className="secondary press" href="/">
          Back to home
        </Link>
      </div>
    </div>
  </main>
);

export default NotFound;
