'use client';

import Link from '../platform/Link';
import { FiChevronLeft } from 'react-icons/fi';
import TypePicker from './TypePicker';
import { FlowProgress, PageIntro } from './ProductUI';

const CreatePick = ({ onBack, onHomeClick, onPick, error = '', user }) => (
  <>
    <div className="nav-row">
      <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
        <FiChevronLeft size={28} />
      </button>
      <h1 className="nav-title">New bet</h1>
      <Link href="/" className="nav-home wordmark" onClick={onHomeClick}>
        Friendly
      </Link>
    </div>
    <div className="scroll">
      <FlowProgress user={user} />
      <PageIntro title="What’s the friendly wager?">
        Game night, a weekend round, or just a hunch. Start with a bet type.
      </PageIntro>
      <TypePicker onPick={onPick} />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="form-footnote">Your friends only need the link to join in.</p>
    </div>
  </>
);

export default CreatePick;
