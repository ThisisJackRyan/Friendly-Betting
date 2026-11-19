'use client';

import { useEffect, useRef } from 'react';
import { useSignedInUser } from './identity';
import { pushAvailable } from './pushTokens';
import { syncPushForUser } from './pushOptIn';
import { ensurePushChannel } from './pushChannel';

// Mounted once at the app root (mobile/App.jsx). On each auth change, puts
// this install's push token on the signed-in user, but only if their in-app
// choice is on and the OS already allows it. Never asks for permission.
// Also creates the Android notification channel once at start, and
// re-registers when FCM rotates the token (tokenReceived), so the server never
// keeps a stale one. Renders nothing; with push off or on the web it does
// nothing at all.
export default function PushSync() {
  return pushAvailable() ? <PushSyncInner /> : null;
}

function PushSyncInner() {
  const user = useSignedInUser();
  const uid = user && !user.isLocal ? user.uid : '';
  const uidRef = useRef(uid);
  uidRef.current = uid;
  useEffect(() => {
    ensurePushChannel().catch(() => {});
  }, []);
  useEffect(() => {
    if (uid) syncPushForUser(uid).catch(() => {});
  }, [uid]);
  useEffect(() => {
    // The event carries the new token; it is never read or logged here.
    // syncPushForUser fetches it again, checks the in-app choice and the OS
    // permission, and never asks.
    const onRefresh = () => {
      try {
        const current = uidRef.current;
        if (current) syncPushForUser(current).catch(() => {});
      } catch (err) {
        // Fail soft.
      }
    };
    return listenForTokenRefresh(onRefresh);
  }, []);
  return null;
}

// Adds the tokenReceived listener and returns a cleanup that removes it, even
// if the unmount happens before addListener resolves. Swallows every error.
function listenForTokenRefresh(onRefresh) {
  let cancelled = false;
  let handle = null;
  const removeHandle = (h) => {
    try {
      Promise.resolve(h?.remove?.()).catch(() => {});
    } catch (err) {
      // Fail soft.
    }
  };
  (async () => {
    try {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      if (cancelled) return;
      const h = await FirebaseMessaging.addListener('tokenReceived', onRefresh);
      if (cancelled) removeHandle(h);
      else handle = h;
    } catch (err) {
      // Plugin missing or failing: auth-change sync still registers.
    }
  })();
  return () => {
    cancelled = true;
    if (handle) removeHandle(handle);
    handle = null;
  };
}
