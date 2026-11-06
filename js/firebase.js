// The ONE place where the Firebase config and SDK version live.
// Other modules import what they need from here; nothing else imports the SDK directly.
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, limit, serverTimestamp, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyClfoi9k0ylFwlOulpHMVuW7Ldfcd4yGFA",
  authDomain: "the-chocolate-story.firebaseapp.com",
  projectId: "the-chocolate-story",
  storageBucket: "the-chocolate-story.firebasestorage.app",
  messagingSenderId: "1025784042622",
  appId: "1:1025784042622:web:393ed47e07d53f475c742f",
  measurementId: "G-WJ69TV6ZT8"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const PROJECT_ID = firebaseConfig.projectId;

// Re-exported so the SDK URL/version above stays the single source of truth.
export { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut };
export { collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, limit, serverTimestamp, writeBatch };
