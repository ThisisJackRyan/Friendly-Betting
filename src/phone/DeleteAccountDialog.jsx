'use client';

import ConfirmDialog from './ConfirmDialog';
import { DELETE_ACCOUNT_COPY as COPY } from './deleteAccountCopy';

// Confirm before deleting the member's account (My bets). `proBullet` is the
// Pro line for their current plan, or '' (deleteAccountCopy.proBulletFor).
// When the server wants a recent sign-in, `reauth` swaps the body for the
// re-auth line and the red confirm for "Sign in again".
const DeleteAccountDialog = ({ proBullet = '', reauth = false, busy, error, onConfirm, onReauth, onCancel }) => {
  const bullets = proBullet ? [...COPY.bullets, proBullet] : COPY.bullets;
  const body = reauth ? (
    <p className="delete-account-lead">{COPY.reauth}</p>
  ) : (
    <>
      <p className="delete-account-lead">{COPY.lead}</p>
      <ul className="delete-account-list">
        {bullets.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
  return (
    <ConfirmDialog
      title={COPY.title}
      body={body}
      confirmLabel={reauth ? COPY.reauthButton : COPY.confirm}
      confirmClassName={reauth ? 'dialog-primary' : 'danger'}
      busyLabel={COPY.busy}
      busy={busy}
      error={reauth ? '' : error}
      onConfirm={reauth ? onReauth : onConfirm}
      onCancel={onCancel}
    />
  );
};

export default DeleteAccountDialog;
