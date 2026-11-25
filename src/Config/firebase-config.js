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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

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

// iOS WKWebView (WebKit 26.4+) holds Listen responses on fetch streams until a
// ~30s keep-alive, so live tallies stall. Workaround from the SDK maintainers:
// turn off fetch streams so WebChannel uses XHR.
// https://github.com/firebase/firebase-js-sdk/issues/9789
// In @firebase/firestore 4.17.2 the browser build registers Firestore with
// useFetchStreams: true and spreads our settings over it, so false wins here.
// Long polling auto detect is already on by default. useFetchStreams is not in
// the public Settings type, which is fine in JS.
const isNativeIOS = () =>
  typeof Capacitor.getPlatform === "function" && Capacitor.getPlatform() === "ios";

function createDb() {
  if (typeof window === "undefined" || !isNativeIOS()) return getFirestore(app);
  try {
    return initializeFirestore(app, { useFetchStreams: false });
  } catch {
    // Already initialized with other settings (for example Vite HMR re-runs
    // this module): reuse the existing instance.
    return getFirestore(app);
  }
}

export const db = createDb();
