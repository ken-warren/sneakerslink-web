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

try {
  if (isConfigured) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);

    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
  }
} catch (error) {
  console.error("SneakersLink Firebase initialization error:", error);
}

/* =========================================================
   HELPERS
   ========================================================= */

function requireFirebase() {
  if (!isConfigured) {
    throw new Error("Firebase isn't configured. Check firebase-config.js.");
  }

  if (!app || !db || !auth) {
    throw new Error("Firebase failed to initialize. Check firebase-config.js.");
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
   Firestore:
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
  const user = requireUser();

  validateAvatar(file);

  if (!storage) {
    throw new Error("Firebase Storage is not available.");
  }

  const avatarRef = ref(storage, `profile-images/${user.uid}/avatar`);

  const snapshot = await uploadBytes(avatarRef, file, {
    contentType: file.type,

    cacheControl: "public,max-age=3600",
  });

  const downloadURL = await getDownloadURL(snapshot.ref);

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
    if (error?.code !== "storage/object-not-found") {
      throw error;
    }
  }

  await updateAuthProfile(user, {
    photoURL: null,
  });

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
   ---------------------------------------------------------
   IMPORTANT:
   - Does not artificially delay an already restored user.
   - Always exposes the actual Firebase auth state.
   ========================================================= */

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
