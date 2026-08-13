/* =========================================================
   FIREBASE ORDER ENGINE
   ---------------------------------------------------------
   Loaded as a <script type="module">, this talks to Firestore
   + Firebase Auth and exposes a plain-object API on
   `window.SLOrders` so the rest of the site (script.js,
   admin.html, track-order.html) — all classic, non-module
   scripts — can call it without needing to become modules.

   CUSTOMER SYSTEM ADDITIONS
   ---------------------------------------------------------
   - Orders can be associated with the authenticated customer.
   - Existing guest checkout remains supported.
   - Existing order/tracking/admin APIs are preserved.
   - Firebase Auth state is exposed for the customer system.
   - No cart logic is handled here.
   ========================================================= */

import { firebaseConfig } from "./firebase-config.js";

import {
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


/* =========================================================
   FIREBASE INITIALISATION
   ========================================================= */

const isConfigured =
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("YOUR_");

let app;
let db;
let auth;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}


/* =========================================================
   ORDER STAGES
   ========================================================= */

export const ORDER_STAGES = [
  {
    key: "placed",
    label: "Order Placed",
    icon: "fa-receipt",
  },
  {
    key: "confirmed",
    label: "Confirmed",
    icon: "fa-check-circle",
  },
  {
    key: "packed",
    label: "Packed",
    icon: "fa-box",
  },
  {
    key: "out",
    label: "Out for Delivery",
    icon: "fa-truck",
  },
  {
    key: "delivered",
    label: "Delivered",
    icon: "fa-home",
  },
];


/* =========================================================
   FIREBASE HELPERS
   ========================================================= */

function requireDb() {
  if (!isConfigured) {
    throw new Error(
      "Firebase isn't configured yet — add your project keys to firebase-config.js (see SETUP.md)."
    );
  }
}

function requireAuth() {
  requireDb();

  if (!auth) {
    throw new Error("Firebase Authentication is not available.");
  }
}


/* =========================================================
   ORDER ID
   ========================================================= */

function generateOrderId() {
  const stamp = Date.now()
    .toString(36)
    .toUpperCase()
    .slice(-5);

  const rand = Math.random()
    .toString(36)
    .toUpperCase()
    .slice(2, 5);

  return `SL-${stamp}${rand}`;
}


/* =========================================================
   CUSTOMER / AUTH HELPERS
   ========================================================= */

/**
 * Returns the currently authenticated Firebase user.
 *
 * Returns null when nobody is signed in.
 */
function getCurrentUser() {
  if (!isConfigured || !auth) {
    return null;
  }

  return auth.currentUser || null;
}


/**
 * Returns a small plain-object representation of the current
 * Firebase user.
 *
 * This prevents the rest of the site from needing to know
 * anything about Firebase User objects.
 */
function getCurrentCustomer() {
  const user = getCurrentUser();

  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    photoURL: user.photoURL || "",
    emailVerified: !!user.emailVerified,
  };
}


/**
 * Subscribe to Firebase Authentication state changes.
 *
 * Used by the profile/account UI to react to:
 *
 * login
 * logout
 * registration
 * page refresh
 */
function onCustomerAuthChange(callback) {
  if (!isConfigured || !auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    callback(
      user
        ? {
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "",
            photoURL: user.photoURL || "",
            emailVerified: !!user.emailVerified,
          }
        : null
    );
  });
}


/**
 * Customer login.
 *
 * This is intentionally separate from the existing
 * adminSignIn function so existing admin.html behaviour
 * remains untouched.
 */
async function customerSignIn(email, password) {
  requireAuth();

  const cred = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  return cred.user;
}


/**
 * Customer logout.
 *
 * Existing adminSignOut remains unchanged.
 */
async function customerSignOut() {
  requireAuth();

  await signOut(auth);
}


/* =========================================================
   CREATE ORDER
   ========================================================= */

/**
 * Create an order in Firestore.
 *
 * Existing callers can continue using:
 *
 *   createOrder(items, total)
 *
 * If a customer is authenticated, the order automatically
 * receives:
 *
 *   userId
 *   customerEmail
 *
 * Guest orders continue to work without those fields.
 */
async function createOrder(items, total) {
  requireDb();

  const id = generateOrderId();

  const user = getCurrentUser();

  const order = {
    id,

    items: items.map((i) => ({
      name: i.name,
      size: i.size || "",
      qty: i.qty,
      price: i.price,
      img: i.img,
    })),

    total,

    status: "placed",

    placedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };


  /* -------------------------------------------------------
     Associate the order with the signed-in customer.

     These fields are deliberately optional so existing
     guest checkout continues to function.
     ------------------------------------------------------- */

  if (user) {
    order.userId = user.uid;
    order.customerEmail = user.email || "";
  }


  await setDoc(
    doc(db, "orders", id),
    order
  );


  /*
   * Return a normal JavaScript object to the existing
   * checkout code.

   * Firestore serverTimestamp() values are not immediately
   * resolved in the local object, so preserve the previous
   * behaviour of returning Date.now().
   */
  return {
    ...order,
    placedAt: Date.now(),
    updatedAt: Date.now(),
  };
}


/* =========================================================
   GET SINGLE ORDER
   ========================================================= */

/**
 * One-time lookup of a single order by exact reference.
 */
async function getOrder(id) {
  requireDb();

  const cleanId = String(id || "")
    .trim()
    .toUpperCase();

  if (!cleanId) {
    return null;
  }

  const snap = await getDoc(
    doc(db, "orders", cleanId)
  );

  return snap.exists()
    ? snap.data()
    : null;
}


/* =========================================================
   LIVE ORDER SUBSCRIPTION
   ========================================================= */

/**
 * Live-subscribe to a single order so the tracker page
 * updates immediately when admin changes its status.
 *
 * Returns an unsubscribe function.
 */
function subscribeOrder(id, onChange, onError) {
  requireDb();

  const cleanId = String(id || "")
    .trim()
    .toUpperCase();

  if (!cleanId) {
    throw new Error("An order reference is required.");
  }

  return onSnapshot(
    doc(db, "orders", cleanId),
    (snap) => {
      onChange(
        snap.exists()
          ? snap.data()
          : null
      );
    },
    onError
  );
}


/* =========================================================
   ADMIN — ALL ORDERS
   ========================================================= */

/**
 * Live-subscribe to the most recent N orders.
 *
 * Existing Firestore security rules should continue to
 * control who is actually allowed to perform this query.
 */
function subscribeAllOrders(
  onChange,
  onError,
  max = 50
) {
  requireDb();

  const q = query(
    collection(db, "orders"),
    orderBy("placedAt", "desc"),
    limit(max)
  );

  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((d) => d.data())
      );
    },
    onError
  );
}


/* =========================================================
   ADMIN — UPDATE ORDER STATUS
   ========================================================= */

/**
 * Admin only — update an order's status.
 */
async function updateOrderStatus(id, status) {
  requireDb();

  const cleanId = String(id || "")
    .trim()
    .toUpperCase();

  if (!cleanId) {
    throw new Error("An order reference is required.");
  }

  await updateDoc(
    doc(db, "orders", cleanId),
    {
      status,
      updatedAt: serverTimestamp(),
    }
  );
}


/* =========================================================
   ADMIN AUTH
   ---------------------------------------------------------
   These functions are intentionally preserved separately
   from customer authentication.
   ========================================================= */

async function adminSignIn(email, password) {
  requireAuth();

  const cred = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  return cred.user;
}


async function adminSignOut() {
  requireAuth();

  await signOut(auth);
}


function onAdminAuthChange(callback) {
  if (!isConfigured || !auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(
    auth,
    callback
  );
}


/* =========================================================
   PUBLIC API
   ---------------------------------------------------------
   Everything below remains available through window.SLOrders
   to classic scripts.
   ========================================================= */

window.SLOrders = {
  /* Configuration */
  isConfigured,

  /* Order system */
  ORDER_STAGES,
  createOrder,
  getOrder,
  subscribeOrder,
  subscribeAllOrders,
  updateOrderStatus,

  /* Customer authentication */
  getCurrentUser,
  getCurrentCustomer,
  customerSignIn,
  customerSignOut,
  onCustomerAuthChange,

  /* Existing admin authentication */
  adminSignIn,
  adminSignOut,
  onAdminAuthChange,
};


/* =========================================================
   READY EVENT
   ========================================================= */

window.dispatchEvent(
  new CustomEvent("slorders:ready")
);