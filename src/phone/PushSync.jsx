'use client';

import { useEffect } from 'react';
import { useSignedInUser } from './identity';
import { pushAvailable } from './pushTokens';
import { syncPushForUser } from './pushOptIn';
import { ensurePushChannel } from './pushChannel';

// Mounted once at the app root (mobile/App.jsx). On each auth change, puts
// this install's push token on the signed-in user, but only if their in-app
// choice is on and the OS already allows it. Never asks for permission.
// Also creates the Android notification channel once at start. Renders
// nothing; with push off or on the web it does nothing at all.
export default function PushSync() {
  return pushAvailable() ? <PushSyncInner /> : null;
}

function PushSyncInner() {
  const user = useSignedInUser();
  const uid = user && !user.isLocal ? user.uid : '';
  useEffect(() => {
    ensurePushChannel().catch(() => {});
  }, []);
  useEffect(() => {
    if (uid) syncPushForUser(uid).catch(() => {});
  }, [uid]);
  return null;
}
