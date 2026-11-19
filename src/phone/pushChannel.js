import { Capacitor } from '@capacitor/core';
import { PUSH_CHANNEL_COPY } from './pushCopy';
import { PUSH_CHANNEL_ID } from './pushConfig';
import { pushAvailable } from './pushTokens';

// Android notification channel (docs/PUSH.md). Every bet push names this
// channel (PUSH_CHANNEL_ID), so it has to exist before the first one lands.
// Created once at app start by PushSync. Android only (the plugin's
// createChannel is SDK 26+; iOS has no channels); nothing at all on the web or
// with push off. Never asks for permission, never throws, never logs.
// Creating a channel that already exists only updates its name and
// description, so running on every launch is safe.
const DEFAULT_IMPORTANCE = 3;

export async function ensurePushChannel() {
  try {
    if (!pushAvailable() || Capacitor.getPlatform() !== 'android') return false;
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    await FirebaseMessaging.createChannel({
      id: PUSH_CHANNEL_ID,
      name: PUSH_CHANNEL_COPY.name,
      description: PUSH_CHANNEL_COPY.description,
      importance: DEFAULT_IMPORTANCE,
    });
    return true;
  } catch (err) {
    // Old Android or a plugin error: FCM's default channel still delivers.
    return false;
  }
}
