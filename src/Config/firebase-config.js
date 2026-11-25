import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, initializeAuth, indexedDBLocalPersistence } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { isNativeApp } from '../platform/runtime';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDZjgosQcTQgNfvwAaFC_W6R5Sv0JjjxkM",
  authDomain: "friendly-betting-fb47e.firebaseapp.com",
  projectId: "friendly-betting-fb47e",
  storageBucket: "friendly-betting-fb47e.appspot.com",
  messagingSenderId: "897713635691",
  appId: "1:897713635691:web:70b530052a319f77e14c2e",
  measurementId: "G-74305KF5X4"
};

// Exported for the Firestore Lite read in subscribeBet's fresh-read backup
// (src/phone/api.js), which needs the same app (and so the same signed-in user).
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

if (typeof window !== "undefined") {
  isSupported()
    .then((ok) => {
      if (ok) getAnalytics(app);
    })
    .catch(() => {
      // Analytics is optional. The app still creates and shares bets without it.
    });
}

export const auth = typeof window === "undefined" ? null : isNativeApp()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app);

// iOS WKWebView (WebKit 26.4+) holds streamed Listen responses until a ~30s
// keep-alive, so live tallies stall (firebase-js-sdk #9789). Turning off fetch
// streams was not enough on device: WebKit can also buffer XHR streaming
// WebChannel responses. Force long polling, so every Listen response is a
// complete request that WebKit hands over at once. With long polling forced,
// WebChannel does not stream at all, so useFetchStreams is moot and left at
// the SDK default. Do not also set experimentalAutoDetectLongPolling: in
// @firebase/firestore 4.17.2 FirestoreSettingsImpl throws when both are true
// (dist/common-CLMydGSF.esm.js:8969, check at :1382), and force long polling
// already turns auto detect off (:8970).
const isNativeIOS = () =>
  typeof Capacitor.getPlatform === "function" && Capacitor.getPlatform() === "ios";

const isDev = () => process.env.NODE_ENV !== "production";

function createDb() {
  if (typeof window === "undefined" || !isNativeIOS()) {
    if (typeof window !== "undefined" && isDev()) console.info("Firestore: default transport");
    return getFirestore(app);
  }
  try {
    const iosDb = initializeFirestore(app, { experimentalForceLongPolling: true });
    if (isDev()) console.info("Firestore: iOS, force long polling");
    return iosDb;
  } catch {
    // Already initialized with other settings (for example Vite HMR re-runs
    // this module): reuse the existing instance.
    if (isDev()) console.warn("Firestore: iOS settings not applied, using the existing instance");
    return getFirestore(app);
  }
}

export const db = createDb();
