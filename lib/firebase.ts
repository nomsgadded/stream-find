import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC7uHBrIdRYCH5BZwAB0-5Ze_AHCxKLcmE",
  authDomain: "stream-find.firebaseapp.com",
  projectId: "stream-find",
  storageBucket: "stream-find.firebasestorage.app",
  messagingSenderId: "550071829510",
  appId: "1:550071829510:web:aa1ae033f9c8fb397daf87",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
export const firestore = getFirestore(app);
