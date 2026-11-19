'use client';

import { CREATE_ERROR_ACTION, CREATE_ERROR_COPY } from './createErrors';

// A failed create's line (createSaveError) with its button, if it has one:
// Go Pro for pro-required, Try again for not-configured. Shared by Create
// and Run it back.
export default function CreateSaveError({ error, onGoPro, onRetry, disabled = false }) {
  if (!error?.message) return null;
  let button = null;
  if (error.action === CREATE_ERROR_ACTION.goPro && onGoPro) {
    button = (
      <button type="button" className="secondary press create-error-action" onClick={onGoPro}>
        {CREATE_ERROR_COPY.goPro}
      </button>
    );
  } else if (error.action === CREATE_ERROR_ACTION.retry && onRetry) {
    button = (
      <button type="button" className="secondary press create-error-action" disabled={disabled} onClick={onRetry}>
        {CREATE_ERROR_COPY.tryAgain}
      </button>
    );
  }
  return (
    <>
      <p className="form-error" role="alert">
        {error.message}
      </p>
      {button}
    </>
  );
}
