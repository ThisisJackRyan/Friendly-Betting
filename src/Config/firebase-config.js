// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth} from "firebase/auth"
import { getFirestore } from "firebase/firestore"
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);


export const auth = getAuth(app);
export const db = getFirestore(app);
