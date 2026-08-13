/* =========================================================
   FIREBASE CUSTOMER AUTH
   ---------------------------------------------------------
   Handles customer registration, login, logout,
   password reset, and customer profiles.
   Exposes the API as window.SLAuth so existing
   classic scripts can use it.
   ========================================================= */

import { firebaseConfig } from "./firebase-config.js";

import {
  getApps,
  getApp,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const isConfigured =
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("YOUR_");

let app = null;
let auth = null;
let db = null;

if (isConfigured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}


/**
 * Register a new customer.
 */
async function register(name, email, password) {
  if (!isConfigured) {
    throw new Error("Firebase is not configured.");
  }

  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  const user = credential.user;

  // Store the customer's name in Firebase Authentication.
  await updateProfile(user, {
    displayName: name,
  });

  // Store additional customer information in Firestore.
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    name: name,
    email: user.email,
    createdAt: serverTimestamp(),
  });

  return user;
}


/**
 * Sign an existing customer in.
 */
async function login(email, password) {
  if (!isConfigured) {
    throw new Error("Firebase is not configured.");
  }

  const credential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  return credential.user;
}


/**
 * Sign the current customer out.
 */
async function logout() {
  if (!isConfigured) {
    throw new Error("Firebase is not configured.");
  }

  await signOut(auth);
}


/**
 * Send password-reset email.
 */
async function resetPassword(email) {
  if (!isConfigured) {
    throw new Error("Firebase is not configured.");
  }

  await sendPasswordResetEmail(auth, email);
}


/**
 * Listen for changes to the logged-in customer.
 */
function onAuthChange(callback) {
  if (!isConfigured) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}


/**
 * Return the currently signed-in customer.
 */
function currentUser() {
  return auth ? auth.currentUser : null;
}


window.SLAuth = {
  isConfigured,

  register: registerUser,
  login: loginUser,

  logout: logoutUser,
  getCurrentUser,
  onUserAuthChange
};


// Tell the page that Firebase Auth is ready.
window.dispatchEvent(new CustomEvent("slauth:ready"));