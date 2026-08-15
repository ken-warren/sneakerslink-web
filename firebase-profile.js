/* =========================================================
   FIREBASE CUSTOMER PROFILE ENGINE
   ---------------------------------------------------------
   Customer profile data lives in:

       Firestore
       users/{uid}

   Profile images live in:

       Firebase Storage
       profile-images/{uid}/avatar

   This file is loaded as a <script type="module"> and exposes
   a plain-object API through window.SLProfile so existing
   classic scripts do not need to become modules.

   IMPORTANT
   ---------------------------------------------------------
   This module does NOT handle:
   - cart functionality
   - order creation
   - order tracking
   - admin functionality

   Those remain in firebase-orders.js.
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
  updateDoc,
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
   HELPERS
   ========================================================= */

function requireFirebase() {
  if (!isConfigured) {
    throw new Error("Firebase isn't configured yet. Check firebase-config.js.");
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

  return auth.currentUser || null;
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
   IMPORTANT:
   This MUST match Firestore rules:

       match /users/{userId}

   Therefore every profile is stored at:

       users/{authenticated-user-uid}
   ========================================================= */

function getProfileRef(uid) {
  requireFirebase();

  if (!uid) {
    throw new Error("A Firebase Authentication UID is required.");
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

/**
 * Load the currently authenticated customer's profile.
 *
 * Profile location:
 *
 *     users/{uid}
 *
 * If the document does not exist, it is created automatically.
 */
async function getProfile() {
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

/**
 * Update customer profile fields.
 *
 * Only approved fields are accepted.
 */
async function updateProfile(fields = {}) {
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
     Keep Firebase Authentication displayName synchronized
     with the Firestore profile.
     ------------------------------------------------------- */

  if (Object.prototype.hasOwnProperty.call(updates, "displayName")) {
    await updateAuthProfile(user, {
      displayName: updates.displayName,
    });
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

  /*
   * Maximum profile image size:
   * 5 MB
   */

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("Profile images must be smaller than 5 MB.");
  }
}

/* =========================================================
   UPLOAD AVATAR
   ========================================================= */

/**
 * Upload/replace customer's profile avatar.
 *
 * Storage path:
 *
 *     profile-images/{uid}/avatar
 *
 * The same path is reused so the new image replaces
 * the previous image.
 */
async function uploadAvatar(file) {
  const user = requireUser();

  validateAvatar(file);

  if (!storage) {
    throw new Error("Firebase Storage is not available.");
  }

  const avatarRef = ref(storage, `profile-images/${user.uid}/avatar`);

  const snapshot = await uploadBytes(avatarRef, file, {
    contentType: file.type,
  });

  const downloadURL = await getDownloadURL(snapshot.ref);

  /*
   * Update Firebase Authentication profile
   * as well as Firestore.
   */

  await updateAuthProfile(user, {
    photoURL: downloadURL,
  });

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
  const user = requireUser();

  if (!storage) {
    throw new Error("Firebase Storage is not available.");
  }

  const avatarRef = ref(storage, `profile-images/${user.uid}/avatar`);

  try {
    await deleteObject(avatarRef);
  } catch (error) {
    /*
     * If the image does not exist,
     * continue with clearing the profile URL.
     */

    if (error?.code !== "storage/object-not-found") {
      throw error;
    }
  }

  /*
   * Clear Firebase Authentication photo.
   */

  await updateAuthProfile(user, {
    photoURL: null,
  });

  /*
   * Clear Firestore photo URL.
   */

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
   AUTH STATE
   ========================================================= */

/**
 * Subscribe to Firebase Authentication changes.
 *
 * This is especially important on profile.html because
 * Firebase may still be restoring the user's session when
 * the page initially loads.
 */
function onProfileAuthChange(callback) {
  if (!isConfigured || !auth) {
    callback(null);

    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
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
