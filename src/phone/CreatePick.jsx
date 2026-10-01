'use client';

import Link from 'next/link';
import { FiChevronLeft } from 'react-icons/fi';
import TypePicker from './TypePicker';

const CreatePick = ({
  onBack,
  onHomeClick,
  onPick,
  error = '',
}) => (
  <>
    <div className="nav-row">
      <button
        type="button"
        className="icon-btn"
        aria-label="Back"
        onClick={onBack}
      >
        <FiChevronLeft size={28} />
      </button>
      <h1 className="nav-title">New bet</h1>
      <Link href="/" className="nav-home wordmark" onClick={onHomeClick}>
        Friendly
      </Link>
    </div>
    <div className="scroll">
      <TypePicker onPick={onPick} />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  </>
);

export default CreatePick;
