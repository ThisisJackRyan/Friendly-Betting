import Link from 'next/link';
import { Brand } from './ProductUI';

const NotFound = () => (
  <main className="phone focus-column">
    <div className="scroll">
      <Brand />
      <div className="empty not-found-state">
        <p className="eyebrow">OUT OF BOUNDS · 404</p>
        <h1 className="screen-title">Lost that one.</h1>
        <p className="empty-copy">This page isn’t in play. Let’s get you back to the clubhouse.</p>
        <Link className="secondary press" href="/">
          Back to home
        </Link>
      </div>
    </div>
  </main>
);

export default NotFound;
