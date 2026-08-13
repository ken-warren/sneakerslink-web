/* =========================================================
   FIREBASE CUSTOMER PROFILE ENGINE
   ---------------------------------------------------------
   Customer profile data lives in:

       Firestore
       customers/{uid}

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
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("YOUR_");

let app;
let db;
let auth;
let storage;

if (isConfigured) {
  app = initializeApp(firebaseConfig);

  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
}


/* =========================================================
   HELPERS
   ========================================================= */

function requireFirebase() {
  if (!isConfigured) {
    throw new Error(
      "Firebase isn't configured yet — add your project keys to firebase-config.js (see SETUP.md)."
    );
  }
}


function requireAuth() {
  requireFirebase();

  if (!auth) {
    throw new Error(
      "Firebase Authentication is not available."
    );
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
    throw new Error(
      "You must be signed in to access your profile."
    );
  }

  return user;
}


/* =========================================================
   PROFILE DEFAULTS
   ========================================================= */

function createDefaultProfile(user) {
  return {
    uid: user.uid,

    email: user.email || "",

    displayName:
      user.displayName || "",

    phone: "",

    address: "",

    city: "",

    postalCode: "",

    country: "",

    photoURL:
      user.photoURL || "",

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

    email:
      data?.email ??
      user.email ??
      "",

    displayName:
      data?.displayName ??
      user.displayName ??
      "",

    phone:
      data?.phone ??
      "",

    address:
      data?.address ??
      "",

    city:
      data?.city ??
      "",

    postalCode:
      data?.postalCode ??
      "",

    country:
      data?.country ??
      "",

    photoURL:
      data?.photoURL ??
      user.photoURL ??
      "",

    createdAt:
      data?.createdAt ??
      null,

    updatedAt:
      data?.updatedAt ??
      null,
  };
}


/* =========================================================
   GET PROFILE
   ========================================================= */

/**
 * Load the currently authenticated customer's profile.
 *
 * If no profile document exists yet, a new profile document
 * is created automatically.
 */
async function getProfile() {
  const user = requireUser();

  const profileRef = doc(
    db,
    "customers",
    user.uid
  );

  const snap = await getDoc(profileRef);

  if (!snap.exists()) {
    const newProfile =
      createDefaultProfile(user);

    await setDoc(
      profileRef,
      newProfile
    );

    return normaliseProfile(
      {
        ...newProfile,
        createdAt: null,
        updatedAt: null,
      },
      user
    );
  }

  return normaliseProfile(
    snap.data(),
    user
  );
}


/* =========================================================
   UPDATE PROFILE
   ========================================================= */

/**
 * Update customer profile fields.
 *
 * Only the fields below are accepted.
 *
 * This prevents arbitrary Firestore fields from accidentally
 * being written by the profile UI.
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
    if (
      Object.prototype.hasOwnProperty.call(
        fields,
        field
      )
    ) {
      updates[field] =
        String(fields[field] ?? "").trim();
    }
  });

  if (
    Object.keys(updates).length === 0
  ) {
    return getProfile();
  }

  updates.updatedAt =
    serverTimestamp();

  const profileRef = doc(
    db,
    "customers",
    user.uid
  );

  await setDoc(
    profileRef,
    updates,
    {
      merge: true,
    }
  );

  return getProfile();
}


/* =========================================================
   AVATAR VALIDATION
   ========================================================= */

function validateAvatar(file) {
  if (!file) {
    throw new Error(
      "Please select an image."
    );
  }

  if (!file.type.startsWith("image/")) {
    throw new Error(
      "Please select a valid image file."
    );
  }

  /*
   * Keep profile images reasonably small.
   *
   * 5 MB is large enough for normal phone/camera images
   * while preventing accidental huge uploads.
   */
  const maxSize =
    5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error(
      "Profile images must be smaller than 5 MB."
    );
  }
}


/* =========================================================
   UPLOAD AVATAR
   ========================================================= */

/**
 * Upload/replace the customer's profile avatar.
 *
 * Storage path:
 *
 * profile-images/{uid}/avatar
 *
 * The same path is reused so a new upload replaces the
 * previous avatar rather than creating endless files.
 */
async function uploadAvatar(file) {
  const user = requireUser();

  validateAvatar(file);

  if (!storage) {
    throw new Error(
      "Firebase Storage is not available."
    );
  }

  const avatarRef = ref(
    storage,
    `profile-images/${user.uid}/avatar`
  );


  const snapshot =
    await uploadBytes(
      avatarRef,
      file,
      {
        contentType: file.type,
      }
    );


  const downloadURL =
    await getDownloadURL(
      snapshot.ref
    );


  const profileRef = doc(
    db,
    "customers",
    user.uid
  );


  await setDoc(
    profileRef,
    {
      photoURL: downloadURL,
      updatedAt: serverTimestamp(),
    },
    {
      merge: true,
    }
  );


  return downloadURL;
}


/* =========================================================
   DELETE AVATAR
   ========================================================= */

/**
 * Remove the customer's profile avatar from Storage and
 * clear photoURL from Firestore.
 */
async function deleteAvatar() {
  const user = requireUser();

  if (!storage) {
    throw new Error(
      "Firebase Storage is not available."
    );
  }

  const avatarRef = ref(
    storage,
    `profile-images/${user.uid}/avatar`
  );

  try {
    await deleteObject(
      avatarRef
    );
  } catch (error) {
    /*
     * Firebase returns an error when the file doesn't exist.
     *
     * That situation should not prevent us from clearing
     * the Firestore profile URL.
     */
    if (
      error?.code !==
      "storage/object-not-found"
    ) {
      throw error;
    }
  }


  const profileRef = doc(
    db,
    "customers",
    user.uid
  );


  await updateDoc(
    profileRef,
    {
      photoURL: "",
      updatedAt: serverTimestamp(),
    }
  );
}


/* =========================================================
   AUTH STATE
   ========================================================= */

/**
 * Subscribe to customer authentication changes.
 *
 * The profile page can use this to redirect a logged-out
 * customer to the login/register flow.
 */
function onProfileAuthChange(callback) {
  if (
    !isConfigured ||
    !auth
  ) {
    callback(null);

    return () => {};
  }

  return onAuthStateChanged(
    auth,
    (user) => {
      callback(
        user
          ? {
              uid: user.uid,
              email:
                user.email || "",
              displayName:
                user.displayName || "",
              photoURL:
                user.photoURL || "",
              emailVerified:
                !!user.emailVerified,
            }
          : null
      );
    }
  );
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

window.dispatchEvent(
  new CustomEvent(
    "slprofile:ready"
  )
);