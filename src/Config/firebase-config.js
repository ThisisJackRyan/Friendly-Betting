import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, initializeAuth, indexedDBLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app);
