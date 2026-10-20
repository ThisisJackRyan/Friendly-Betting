'use client';

import ConfirmDialog from './ConfirmDialog';

// Confirm before deleting a bet (My bets).
const DeleteBetDialog = (props) => (
  <ConfirmDialog
    title="Delete this bet?"
    copy="It’s gone for everyone, including the votes and the share link."
    confirmLabel="Delete bet"
    busyLabel="Deleting…"
    {...props}
  />
);

export default DeleteBetDialog;
