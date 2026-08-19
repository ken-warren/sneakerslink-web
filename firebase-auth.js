/* =========================================================
   SneakersLink — Firebase Authentication
   ---------------------------------------------------------
   Handles:
   - Customer registration
   - Customer login
   - Customer logout
   - Password reset
   - Auth state
   - Customer Firestore profile creation
   - Firebase Auth display-name synchronization
   - Safe Firebase initialization
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
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =========================================================
   FIREBASE INITIALISATION
   ========================================================= */

const isConfigured = Boolean(
  firebaseConfig?.apiKey &&
  !String(firebaseConfig.apiKey)
    .startsWith("YOUR_")
);

let app = null;
let auth = null;
let db = null;

if (isConfigured) {
  app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

  auth = getAuth(app);

  db = getFirestore(app);
}


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function requireFirebase() {
  if (
    !isConfigured ||
    !auth ||
    !db
  ) {
    throw new Error(
      "Firebase is not configured. Please check firebase-config.js."
    );
  }
}


function cleanEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}


function cleanText(
  value,
  maxLength = 500
) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}


function validateEmail(email) {
  const value =
    cleanEmail(email);

  if (!value) {
    throw new Error(
      "Please enter your email address."
    );
  }

  /*
   * This is only a basic client-side check.
   * Firebase performs the authoritative validation.
   */
  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(value)) {
    throw new Error(
      "Please enter a valid email address."
    );
  }

  return value;
}


function validatePassword(password) {
  if (!password) {
    throw new Error(
      "Please enter your password."
    );
  }

  if (
    String(password).length < 6
  ) {
    throw new Error(
      "Password must contain at least 6 characters."
    );
  }

  return String(password);
}


function getCurrentUser() {
  return (
    auth?.currentUser ||
    null
  );
}


/* =========================================================
   FIREBASE ERROR HANDLING
   ========================================================= */

function getFriendlyAuthError(
  error
) {
  const code =
    error?.code || "";

  const messages = {
    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/user-disabled":
      "This account has been disabled.",

    "auth/user-not-found":
      "No account was found with this email address.",

    "auth/wrong-password":
      "The email or password is incorrect.",

    "auth/invalid-credential":
      "The email or password is incorrect.",

    "auth/email-already-in-use":
      "An account already exists with this email address.",

    "auth/weak-password":
      "Your password is too weak. Please choose a stronger password.",

    "auth/operation-not-allowed":
      "Email and password authentication is not enabled for this Firebase project.",

    "auth/too-many-requests":
      "Too many attempts were made. Please try again later.",

    "auth/network-request-failed":
      "A network error occurred. Please check your connection.",

    "auth/requires-recent-login":
      "Please sign in again before performing this action.",

    "auth/expired-action-code":
      "This password-reset link has expired.",

    "auth/invalid-action-code":
      "This password-reset link is invalid or has already been used.",
  };

  return (
    messages[code] ||
    error?.message ||
    "Authentication failed. Please try again."
  );
}


/* =========================================================
   CREATE CUSTOMER PROFILE
   ========================================================= */

/**
 * Creates / bootstraps:
 *
 * users/{uid}
 *
 * This is the SAME Firestore document that firebase-profile.js
 * (the profile page) reads and updates. Keeping the collection
 * name in sync between the two modules is required — a prior
 * version of this function wrote to a separate "customers/{uid}"
 * collection that nothing else in the app ever read, which meant
 * profile data (phone/address/city/etc.) never appeared here.
 *
 * The function uses merge:true so it does not overwrite
 * existing profile information.
 */
async function createCustomerProfile(
  user,
  additionalData = {}
) {
  requireFirebase();

  if (!user?.uid) {
    throw new Error(
      "A valid authenticated user is required."
    );
  }

  const profileRef =
    doc(
      db,
      "users",
      user.uid
    );

  const existing =
    await getDoc(
      profileRef
    );

  const profileData = {
    uid: user.uid,

    email:
      user.email || "",

    displayName:
      user.displayName ||
      cleanText(
        additionalData.displayName ||
          "",
        120
      ),

    phone:
      cleanText(
        additionalData.phone ||
          "",
        40
      ),

    address:
      cleanText(
        additionalData.address ||
          "",
        500
      ),

    city:
      cleanText(
        additionalData.city ||
          "",
        100
      ),

    postalCode:
      cleanText(
        additionalData.postalCode ||
          "",
        30
      ),

    country:
      cleanText(
        additionalData.country ||
          "",
        100
      ),

    photoURL:
      user.photoURL || "",

    updatedAt:
      serverTimestamp(),
  };

  /*
   * Only set createdAt when this is a new customer.
   */
  if (!existing.exists()) {
    profileData.createdAt =
      serverTimestamp();
  }

  await setDoc(
    profileRef,
    profileData,
    {
      merge: true,
    }
  );

  return profileData;
}


/* =========================================================
   REGISTER CUSTOMER
   ========================================================= */

/**
 * Register a new customer using email/password.
 *
 * Returns the Firebase User object.
 */
async function register(
  email,
  password,
  profile = {}
) {
  requireFirebase();

  const cleanEmailAddress =
    validateEmail(email);

  const cleanPassword =
    validatePassword(password);

  try {
    const credential =
      await createUserWithEmailAndPassword(
        auth,
        cleanEmailAddress,
        cleanPassword
      );

    const user =
      credential.user;

    const displayName =
      cleanText(
        profile.displayName ||
          "",
        120
      );

    /*
     * Update Firebase Authentication profile.
     */
    if (displayName) {
      await updateProfile(
        user,
        {
          displayName,
        }
      );
    }

    /*
     * Create the matching Firestore customer profile.
     */
    await createCustomerProfile(
      user,
      {
        ...profile,
        displayName,
      }
    );

    return user;

  } catch (error) {
    console.error(
      "[SneakersLink] Registration error:",
      error
    );

    throw new Error(
      getFriendlyAuthError(
        error
      )
    );
  }
}


/* =========================================================
   LOGIN
   ========================================================= */

async function login(
  email,
  password
) {
  requireFirebase();

  const cleanEmailAddress =
    validateEmail(email);

  const cleanPassword =
    validatePassword(password);

  try {
    const credential =
      await signInWithEmailAndPassword(
        auth,
        cleanEmailAddress,
        cleanPassword
      );

    /*
     * Make sure an older customer account that does not yet
     * have a Firestore profile gets one.
     */
    await createCustomerProfile(
      credential.user
    );

    return credential.user;

  } catch (error) {
    console.error(
      "[SneakersLink] Login error:",
      error
    );

    throw new Error(
      getFriendlyAuthError(
        error
      )
    );
  }
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {
  requireFirebase();

  try {
    await signOut(auth);

    return true;

  } catch (error) {
    console.error(
      "[SneakersLink] Logout error:",
      error
    );

    throw new Error(
      getFriendlyAuthError(
        error
      )
    );
  }
}


/* =========================================================
   PASSWORD RESET
   ========================================================= */

async function resetPassword(
  email
) {
  requireFirebase();

  const cleanEmailAddress =
    validateEmail(email);

  try {
    await sendPasswordResetEmail(
      auth,
      cleanEmailAddress
    );

    return true;

  } catch (error) {
    console.error(
      "[SneakersLink] Password reset error:",
      error
    );

    throw new Error(
      getFriendlyAuthError(
        error
      )
    );
  }
}


/* =========================================================
   AUTH STATE
   ========================================================= */

/**
 * Listen for authentication changes.
 *
 * Example:
 *
 * SLAuth.onAuthStateChanged(user => {
 *   if (user) {
 *     console.log("Logged in:", user.email);
 *   }
 * });
 */
function onAuthStateChangedSafe(
  callback
) {
  if (
    typeof callback !==
    "function"
  ) {
    throw new TypeError(
      "Auth callback must be a function."
    );
  }

  if (!auth) {
    callback(null);

    return () => {};
  }

  return onAuthStateChanged(
    auth,
    async (user) => {
      if (user) {
        /*
         * Keep the customer's Firestore profile available.
         *
         * If this fails because of a temporary network issue,
         * don't force the user out of the application.
         */
        try {
          await createCustomerProfile(
            user
          );
        } catch (error) {
          console.warn(
            "[SneakersLink] Could not sync customer profile:",
            error
          );
        }
      }

      callback(user);
    }
  );
}


/* =========================================================
   GET USER
   ========================================================= */

function getUser() {
  return getCurrentUser();
}


/* =========================================================
   GET USER INFORMATION
   ========================================================= */

function getUserInfo() {
  const user =
    getCurrentUser();

  if (!user) {
    return null;
  }

  return {
    uid: user.uid,

    email:
      user.email || "",

    displayName:
      user.displayName || "",

    photoURL:
      user.photoURL || "",

    emailVerified:
      Boolean(
        user.emailVerified
      ),
  };
}


/* =========================================================
   UPDATE AUTH DISPLAY NAME
   ========================================================= */

async function setDisplayName(
  displayName
) {
  requireFirebase();

  const user =
    getCurrentUser();

  if (!user) {
    throw new Error(
      "You must be signed in."
    );
  }

  const cleanName =
    cleanText(
      displayName,
      120
    );

  if (!cleanName) {
    throw new Error(
      "Please enter your name."
    );
  }

  try {
    await updateProfile(
      user,
      {
        displayName:
          cleanName,
      }
    );

    /*
     * Keep Firestore synchronized.
     */
    await createCustomerProfile(
      user,
      {
        displayName:
          cleanName,
      }
    );

    return user;

  } catch (error) {
    console.error(
      "[SneakersLink] Display name update error:",
      error
    );

    throw new Error(
      getFriendlyAuthError(
        error
      )
    );
  }
}


/* =========================================================
   REFRESH CURRENT USER
   ========================================================= */

async function refreshUser() {
  requireFirebase();

  const user =
    getCurrentUser();

  if (!user) {
    return null;
  }

  /*
   * Firebase User has reload() for refreshing its state.
   */
  await user.reload();

  return auth.currentUser;
}


/* =========================================================
   AUTHENTICATION STATUS
   ========================================================= */

function isLoggedIn() {
  return Boolean(
    getCurrentUser()
  );
}


/* =========================================================
   PUBLIC API
   ========================================================= */

window.SLAuth = {
  isConfigured,

  register,

  login,

  logout,

  resetPassword,

  getUser,

  getUserInfo,

  isLoggedIn,

  setDisplayName,

  refreshUser,

  onAuthStateChanged:
    onAuthStateChangedSafe,
};


/* =========================================================
   BACKWARD COMPATIBILITY
   ---------------------------------------------------------
   These aliases make it easier to integrate the corrected
   authentication module with existing SneakersLink pages.
   ========================================================= */

window.SneakersLinkAuth = {
  register,

  login,

  logout,

  resetPassword,

  getUser,

  getUserInfo,

  isLoggedIn,

  setDisplayName,

  refreshUser,

  onAuthStateChanged:
    onAuthStateChangedSafe,
};


/* =========================================================
   AUTH MODULE READY EVENT
   ========================================================= */

window.dispatchEvent(
    new CustomEvent("slauth:ready")
);