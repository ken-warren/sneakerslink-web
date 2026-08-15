/* =========================================================
   FIREBASE CUSTOMER PROFILE ENGINE
   ---------------------------------------------------------
   Firestore:
       users/{uid}

   Firebase Storage:
       profile-images/{uid}/avatar

   Public API:
       window.SLProfile
   ========================================================= */

import { firebaseConfig } from "./firebase-config.js";

import {
  getApps,
  getApp,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged,
  updateProfile as updateAuthProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* =========================================================
   FIREBASE INITIALISATION
   ========================================================= */

const isConfigured =
  firebaseConfig &&
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("YOUR_");

let app = null;
let db = null;
let auth = null;
let storage = null;

if (isConfigured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
}

/* =========================================================
   AUTH STATE
   ---------------------------------------------------------
   IMPORTANT:
   Firebase Auth can take a short time to restore the
   existing browser session.

   We keep the latest user and expose a Promise that resolves
   exactly once when Firebase has completed its initial
   auth-state check.
   ========================================================= */

let currentAuthUser = null;
let authInitialised = false;

let resolveAuthReady;

const authReadyPromise = new Promise((resolve) => {
  resolveAuthReady = resolve;
});

if (auth) {
  onAuthStateChanged(auth, (user) => {
    currentAuthUser = user || null;

    /*
     * This callback is also Firebase's confirmation that
     * the initial authentication state has been resolved.
     */
    if (!authInitialised) {
      authInitialised = true;

      resolveAuthReady(currentAuthUser);
    }
  });
} else {
  /*
   * Firebase is not configured.
   * Resolve immediately so the page cannot remain
   * stuck waiting forever.
   */
  authInitialised = true;
  resolveAuthReady(null);
}

/* =========================================================
   HELPERS
   ========================================================= */

function requireFirebase() {
  if (!isConfigured) {
    throw new Error("Firebase isn't configured. Check firebase-config.js.");
  }
}

function requireAuth() {
  requireFirebase();

  if (!auth) {
    throw new Error("Firebase Authentication is not available.");
  }
}

function getCurrentUser() {
  if (!isConfigured || !auth) {
    return null;
  }

  return auth.currentUser || currentAuthUser || null;
}

/*
 * Wait until Firebase has completed its initial
 * authentication-state check.
 */
async function waitForAuthReady() {
  return authReadyPromise;
}

function requireUser() {
  requireAuth();

  const user = getCurrentUser();

  if (!user) {
    throw new Error("You must be signed in to access your profile.");
  }

  return user;
}

/* =========================================================
   PROFILE REFERENCE
   ---------------------------------------------------------
   MUST MATCH FIRESTORE RULES:

       match /users/{userId}

   Therefore:

       users/{uid}
   ========================================================= */

function getProfileRef(uid) {
  requireFirebase();

  if (!uid) {
    throw new Error("Firebase Authentication UID is required.");
  }

  return doc(db, "users", uid);
}

/* =========================================================
   PROFILE DEFAULTS
   ========================================================= */

function createDefaultProfile(user) {
  return {
    uid: user.uid,

    email: user.email || "",

    displayName: user.displayName || "",

    phone: "",

    address: "",

    city: "",

    postalCode: "",

    country: "",

    photoURL: user.photoURL || "",

    createdAt: serverTimestamp(),

    updatedAt: serverTimestamp(),
  };
}

/* =========================================================
   NORMALISE PROFILE
   ========================================================= */

function normaliseProfile(data, user) {
  return {
    uid: data?.uid || user.uid,

    email: data?.email ?? user.email ?? "",

    displayName: data?.displayName ?? user.displayName ?? "",

    phone: data?.phone ?? "",

    address: data?.address ?? "",

    city: data?.city ?? "",

    postalCode: data?.postalCode ?? "",

    country: data?.country ?? "",

    photoURL: data?.photoURL ?? user.photoURL ?? "",

    createdAt: data?.createdAt ?? null,

    updatedAt: data?.updatedAt ?? null,
  };
}

/* =========================================================
   GET PROFILE
   ========================================================= */

async function getProfile() {
  /*
   * Make absolutely sure Firebase has finished restoring
   * the authentication session before reading currentUser.
   */
  await waitForAuthReady();

  const user = requireUser();

  const profileRef = getProfileRef(user.uid);

  const snap = await getDoc(profileRef);

  if (!snap.exists()) {
    const newProfile = createDefaultProfile(user);

    await setDoc(profileRef, newProfile);

    return normaliseProfile(
      {
        ...newProfile,

        createdAt: null,

        updatedAt: null,
      },
      user,
    );
  }

  return normaliseProfile(snap.data(), user);
}

/* =========================================================
   UPDATE PROFILE
   ========================================================= */

async function updateProfile(fields = {}) {
  await waitForAuthReady();

  const user = requireUser();

  const allowedFields = [
    "displayName",
    "phone",
    "address",
    "city",
    "postalCode",
    "country",
  ];

  const updates = {};

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      updates[field] = String(fields[field] ?? "").trim();
    }
  });

  if (Object.keys(updates).length === 0) {
    return getProfile();
  }

  /* -------------------------------------------------------
     Synchronise Firebase Auth display name
     ------------------------------------------------------- */

  if (Object.prototype.hasOwnProperty.call(updates, "displayName")) {
    await updateAuthProfile(user, {
      displayName: updates.displayName,
    });

    /*
     * Keep our cached user object synchronised.
     */
    currentAuthUser = auth.currentUser || user;
  }

  updates.updatedAt = serverTimestamp();

  const profileRef = getProfileRef(user.uid);

  await setDoc(profileRef, updates, {
    merge: true,
  });

  return getProfile();
}

/* =========================================================
   AVATAR VALIDATION
   ========================================================= */

function validateAvatar(file) {
  if (!file) {
    throw new Error("Please select an image.");
  }

  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("Please select a valid image file.");
  }

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("Profile images must be smaller than 5 MB.");
  }
}

/* =========================================================
   UPLOAD AVATAR
   ========================================================= */

async function uploadAvatar(file) {
  await waitForAuthReady();

  const user = requireUser();

  validateAvatar(file);

  if (!storage) {
    throw new Error("Firebase Storage is not available.");
  }

  /* -------------------------------------------------------
     Storage location
     ------------------------------------------------------- */

  const avatarRef = ref(storage, `profile-images/${user.uid}/avatar`);

  /* -------------------------------------------------------
     Upload
     ------------------------------------------------------- */

  const snapshot = await uploadBytes(avatarRef, file, {
    contentType: file.type,

    cacheControl: "public,max-age=3600",
  });

  /* -------------------------------------------------------
     Get download URL
     ------------------------------------------------------- */

  const downloadURL = await getDownloadURL(snapshot.ref);

  /* -------------------------------------------------------
     Update Firebase Authentication
     ------------------------------------------------------- */

  await updateAuthProfile(user, {
    photoURL: downloadURL,
  });

  /* -------------------------------------------------------
     Update cached user
     ------------------------------------------------------- */

  currentAuthUser = auth.currentUser || user;

  /* -------------------------------------------------------
     Update Firestore
     ------------------------------------------------------- */

  const profileRef = getProfileRef(user.uid);

  await setDoc(
    profileRef,
    {
      photoURL: downloadURL,

      updatedAt: serverTimestamp(),
    },
    {
      merge: true,
    },
  );

  return downloadURL;
}

/* =========================================================
   DELETE AVATAR
   ========================================================= */

async function deleteAvatar() {
  await waitForAuthReady();

  const user = requireUser();

  if (!storage) {
    throw new Error("Firebase Storage is not available.");
  }

  const avatarRef = ref(storage, `profile-images/${user.uid}/avatar`);

  try {
    await deleteObject(avatarRef);
  } catch (error) {
    if (error?.code !== "storage/object-not-found") {
      throw error;
    }
  }

  /* -------------------------------------------------------
     Clear Firebase Auth photo
     ------------------------------------------------------- */

  await updateAuthProfile(user, {
    photoURL: null,
  });

  currentAuthUser = auth.currentUser || user;

  /* -------------------------------------------------------
     Clear Firestore photo
     ------------------------------------------------------- */

  const profileRef = getProfileRef(user.uid);

  await setDoc(
    profileRef,
    {
      photoURL: "",

      updatedAt: serverTimestamp(),
    },
    {
      merge: true,
    },
  );

  return true;
}

/* =========================================================
   AUTH CHANGE LISTENER
   ========================================================= */

function onProfileAuthChange(callback) {
  if (!isConfigured || !auth) {
    callback(null);

    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    currentAuthUser = user || null;

    if (!user) {
      callback(null);
      return;
    }

    callback({
      uid: user.uid,

      email: user.email || "",

      displayName: user.displayName || "",

      photoURL: user.photoURL || "",

      emailVerified: !!user.emailVerified,
    });
  });
}

/* =========================================================
   PUBLIC API
   ========================================================= */

window.SLProfile = {
  isConfigured,

  getCurrentUser,

  waitForAuthReady,

  getProfile,

  updateProfile,

  uploadAvatar,

  deleteAvatar,

  onProfileAuthChange,
};

/* =========================================================
   READY EVENT
   ========================================================= */

window.dispatchEvent(new CustomEvent("slprofile:ready"));
