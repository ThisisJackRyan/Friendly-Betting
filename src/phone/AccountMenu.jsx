'use client';

import { useEffect, useRef, useState } from 'react';
import { LuUserCircle } from 'react-icons/lu';
import { useRouter } from '../platform/navigation';
import { isNativeApp } from '../platform/runtime';
import AccountSheet from './AccountSheet';
import { ACCOUNT_COPY } from './accountCopy';
import { openDeleteAccountPage } from './accountNav';
import { isCreator } from './creatorSession';
import { useIdentity } from './identity';
import { logOut } from './logOut';
import { pushEnabled } from './pushConfig';

// The person icon at the top right of My bets and the Account sheet it opens.
// Always shown to a phone-signed-in member (web and app). An anonymous user
// gets it only in the iOS or Android app with push on, where the sheet has
// the Notifications row; with push off their sheet would be empty, so no
// icon. A web visitor who is not signed in sees nothing.
export default function AccountMenu() {
  const user = useIdentity();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const iconRef = useRef(null);
  // Set when a close should put focus back on the icon.
  const refocus = useRef(false);
  const member = isCreator(user);
  // The push flag and the native app together, as pushAvailable() checks.
  const pushUid = user && !user.isLocal ? user.uid : '';
  const show = member || Boolean(pushUid && pushEnabled() && isNativeApp());

  useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    iconRef.current?.focus();
  }, [open]);

  // Signed out (or the sheet's user changed): nothing stays open.
  useEffect(() => {
    if (!show) setOpen(false);
  }, [show]);

  if (!show) return null;

  const close = () => {
    refocus.current = true;
    setOpen(false);
  };

  const confirmLogOut = () => {
    setOpen(false);
    // Lands where log out always has: My bets, now showing phone sign-in.
    logOut().catch(() => {});
  };

  const deleteAccount = () => {
    setOpen(false);
    openDeleteAccountPage(router);
  };

  return (
    <>
      <button
        ref={iconRef}
        type="button"
        className="account-button press"
        aria-label={ACCOUNT_COPY.icon}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <LuUserCircle size={24} aria-hidden="true" />
      </button>
      {open && (
        <AccountSheet
          member={member}
          phone={member ? user.phoneNumber || '' : ''}
          pushUid={pushUid}
          onClose={close}
          onLogOut={confirmLogOut}
          onDeleteAccount={deleteAccount}
        />
      )}
    </>
  );
}
