'use client';

import { useEffect, useRef, useState } from 'react';
import { FiChevronLeft } from 'react-icons/fi';
import { useRouter } from '../platform/navigation';
import { signOutCreator } from './creatorAuth';
import { isCreator } from './creatorSession';
import { useIdentity } from './identity';
import { useEntitlementState } from './useEntitlement';
import DeleteAccountDialog from './DeleteAccountDialog';
import { DELETE_ACCOUNT_COPY, proBulletFor } from './deleteAccountCopy';
import { ACCOUNT_COPY } from './accountCopy';
import { backToBets, cameFromBets, forgetCameFromBets } from './accountNav';
import {
  REQUIRES_RECENT_LOGIN,
  clearDeleteAccountResume,
  clearLocalAccountData,
  deleteAccount,
  markDeleteAccountResume,
  takeDeleteAccountResume,
} from './accountApi';

const isOfflineError = (err) => err?.code === 'offline'
  || (typeof navigator !== 'undefined' && navigator.onLine === false);

// /account/delete: what deleting the account does, then the red button that
// opens the Delete your account? confirm (DeleteAccountDialog, unchanged).
// Only for a phone-signed-in member: anyone else goes to My bets.
export default function DeleteAccountPage() {
  const user = useIdentity();
  const router = useRouter();
  const member = isCreator(user);
  // Set once the page is on its way out after signing out (deleted, or Sign
  // in again), so the redirect below does not race the page's own trip.
  const leaving = useRef(false);

  useEffect(() => {
    document.title = `${ACCOUNT_COPY.pageTitle} · Friendly`;
  }, []);

  useEffect(() => {
    if (user && !member && !leaving.current) router.replace('/bets');
  }, [user, member, router]);

  if (!member) return <div className="phone delete-account-page" />;
  return <DeleteAccountBody key={user.uid} uid={user.uid} leaving={leaving} />;
}

function DeleteAccountBody({ uid, leaving }) {
  const router = useRouter();
  const [fromMyBets] = useState(cameFromBets);
  const entitlementState = useEntitlementState();
  const proBullet = entitlementState.uid === uid ? proBulletFor(entitlementState.entitlement) : '';
  const bullets = proBullet ? [...DELETE_ACCOUNT_COPY.bullets, proBullet] : DELETE_ACCOUNT_COPY.bullets;
  // The confirm: { busy, error, reauth } while it is open.
  const [account, setAccount] = useState(null);
  const trigger = useRef(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    forgetCameFromBets();
    return () => {
      alive.current = false;
    };
  }, []);

  // Back from "Sign in again" (My bets sends them on here): reopen the confirm.
  useEffect(() => {
    if (takeDeleteAccountResume(uid)) setAccount({ busy: false, error: '', reauth: false });
  }, [uid]);

  const back = () => backToBets(router, fromMyBets);

  const close = () => {
    setAccount(null);
    trigger.current?.focus();
  };

  const confirm = async () => {
    if (!account || account.busy) return;
    setAccount({ busy: true, error: '', reauth: false });
    try {
      await deleteAccount();
    } catch (err) {
      if (!alive.current) return;
      if (err?.code === REQUIRES_RECENT_LOGIN) setAccount({ busy: false, error: '', reauth: true });
      else setAccount({ busy: false, error: isOfflineError(err) ? DELETE_ACCOUNT_COPY.offline : DELETE_ACCOUNT_COPY.error, reauth: false });
      return;
    }
    // The account is gone on the server. Everything from here is best effort.
    await clearLocalAccountData(uid);
    leaving.current = true;
    try {
      await signOutCreator();
    } catch {
      // The Auth user is deleted; the session can't refresh anyway.
    }
    router.replace('/');
  };

  // Signing out sends them to My bets, which shows phone sign-in and sends
  // them back here once they are in. Pushed from My bets, this pops back to
  // it, so My bets stays one entry once the page is pushed again.
  const reauth = async () => {
    markDeleteAccountResume(uid);
    leaving.current = true;
    try {
      await signOutCreator();
    } catch {
      leaving.current = false;
      clearDeleteAccountResume();
      if (alive.current) setAccount({ busy: false, error: DELETE_ACCOUNT_COPY.error, reauth: false });
      return;
    }
    backToBets(router, fromMyBets);
  };

  return (
    <div className="phone screen-push delete-account-page">
      <div className="nav-row">
        <button type="button" className="icon-btn" aria-label={ACCOUNT_COPY.back} onClick={back}>
          <FiChevronLeft size={28} aria-hidden="true" />
        </button>
        <h1 className="nav-title">{ACCOUNT_COPY.pageTitle}</h1>
      </div>
      <div className="scroll">
        <div className="delete-account-body">
          <p className="delete-account-lead">{DELETE_ACCOUNT_COPY.lead}</p>
          <ul className="delete-account-list">
            {bullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <button
            ref={trigger}
            type="button"
            className="delete-account-button press"
            onClick={() => setAccount({ busy: false, error: '', reauth: false })}
          >
            {ACCOUNT_COPY.pageButton}
          </button>
          <button type="button" className="delete-account-never press" onClick={back}>
            {ACCOUNT_COPY.neverMind}
          </button>
        </div>
      </div>
      {account && (
        <DeleteAccountDialog
          proBullet={proBullet}
          reauth={account.reauth}
          busy={account.busy}
          error={account.error}
          onConfirm={confirm}
          onReauth={reauth}
          onCancel={close}
        />
      )}
    </div>
  );
}
