'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { pushAvailable } from './pushTokens';
import {
  isGranted,
  isPromptable,
  openPushSettings,
  readPushSettings,
  resyncAfterResume,
  setPushOn,
} from './pushOptIn';
import { PUSH_COPY } from './pushCopy';

// The Notifications row in the Account sheet, above Log out (docs/PUSH.md).
// Renders nothing, and calls no plugin, with push off or on the web.
//
// - Permission granted: the toggle registers (on) or unregisters (off).
// - Still promptable (the first-bet sheet never showed): turning it on asks
//   the OS, from that tap only. Never on load.
// - Permission unreadable: renders nothing.
// - Anything else (denied): "Turned off in your phone’s settings." and Open
//   Settings. The toggle stays off and never asks: iOS and Android 13+ will
//   not ask again after a denial.
// On App resume the permission is read again, so coming back from Settings
// updates the row (and registers, if the user went there to turn it on).
export default function PushSettingsRow({ uid }) {
  if (!pushAvailable() || !uid) return null;
  return <PushSettingsRowInner key={uid} uid={uid} />;
}

function PushSettingsRowInner({ uid }) {
  const labelId = useId();
  const helperId = useId();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  // Open Settings was tapped: a grant on the way back turns it on.
  const wantOn = useRef(false);

  useEffect(() => {
    live.current = true;
    readPushSettings(uid)
      .then((next) => {
        if (live.current && next) setState(next);
      })
      .catch(() => {});
    return () => {
      live.current = false;
    };
  }, [uid]);

  useEffect(() => {
    let active = true;
    let handle = null;
    const onResume = () => {
      resyncAfterResume(uid, { wantOn: wantOn.current })
        .then((next) => {
          if (!live.current || !next) return;
          if (isGranted(next.permission)) wantOn.current = false;
          setState(next);
        })
        .catch(() => {});
    };
    import('@capacitor/app')
      .then(({ App }) => App.addListener('resume', onResume))
      .then((listener) => {
        if (active) handle = listener;
        else listener?.remove?.();
      })
      .catch(() => {});
    return () => {
      active = false;
      handle?.remove?.();
    };
  }, [uid]);

  // No state yet, or the permission could not be read: render nothing rather
  // than a misleading "turned off" row.
  if (!state || !state.permission) return null;

  const off = !isGranted(state.permission) && !isPromptable(state.permission);
  const checked = !off && state.on && isGranted(state.permission);

  const toggle = async () => {
    if (busy || off) return;
    setBusy(true);
    try {
      const next = await setPushOn(uid, !checked);
      if (live.current && next) setState(next);
    } catch {
      // Fail soft: the row keeps its last state.
    }
    if (live.current) setBusy(false);
  };

  const openSettings = () => {
    wantOn.current = true;
    openPushSettings().catch(() => {});
  };

  return (
    <div className="push-row">
      <div className="push-row-text">
        <p id={labelId} className="push-row-label">{PUSH_COPY.rowLabel}</p>
        <p id={helperId} className="push-row-helper">{off ? PUSH_COPY.rowHelperOff : PUSH_COPY.rowHelper}</p>
        {off && (
          <button type="button" className="push-row-settings" onClick={openSettings}>
            {PUSH_COPY.openSettings}
          </button>
        )}
      </div>
      <button
        type="button"
        role="switch"
        className="push-switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={helperId}
        aria-busy={busy || undefined}
        disabled={busy || off}
        onClick={toggle}
      >
        <span className="push-switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );
}
