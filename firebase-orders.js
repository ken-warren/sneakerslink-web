/* =========================================================
   FIREBASE ORDER ENGINE
   ---------------------------------------------------------
   Loaded as a <script type="module">, this talks to Firestore
   + Firebase Auth and exposes a plain-object API on
   `window.SLOrders` so the rest of the site (script.js,
   admin.html, track-order.html) — all classic, non-module
   scripts — can call it without needing to become modules
   themselves.

   If firebase-config.js still has placeholder values, or the
   network/Firebase project isn't reachable, every method
   fails gracefully (rejects) rather than throwing — callers
   are expected to catch and fall back to a "cloud sync isn't
   set up yet" message. See SETUP.md to configure a real
   project.
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

const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_");

let app, db, auth;
if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

export const ORDER_STAGES = [
  { key: "placed", label: "Order Placed", icon: "fa-receipt" },
  { key: "confirmed", label: "Confirmed", icon: "fa-check-circle" },
  { key: "packed", label: "Packed", icon: "fa-box" },
  { key: "out", label: "Out for Delivery", icon: "fa-truck" },
  { key: "delivered", label: "Delivered", icon: "fa-home" },
];

function requireDb() {
  if (!isConfigured) {
    throw new Error(
      "Firebase isn't configured yet — add your project keys to firebase-config.js (see SETUP.md)."
    );
  }
}

function generateOrderId() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `SL-${stamp}${rand}`;
}

/** Create an order in Firestore. Resolves with the order object (incl. id). */
async function createOrder(items, total) {
  requireDb();
  const id = generateOrderId();
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
  await setDoc(doc(db, "orders", id), order);
  return { ...order, placedAt: Date.now(), updatedAt: Date.now() };
}

/** One-time lookup of a single order by its exact reference. */
async function getOrder(id) {
  requireDb();
  const snap = await getDoc(doc(db, "orders", id.trim().toUpperCase()));
  return snap.exists() ? snap.data() : null;
}

/**
 * Live-subscribe to a single order so the tracker page updates the
 * instant admin changes its status. Returns an unsubscribe function.
 */
function subscribeOrder(id, onChange, onError) {
  requireDb();
  return onSnapshot(
    doc(db, "orders", id.trim().toUpperCase()),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    onError
  );
}

/**
 * Live-subscribe to the most recent N orders — admin only
 * (Firestore security rules require auth for listing/querying).
 */
function subscribeAllOrders(onChange, onError, max = 50) {
  requireDb();
  const q = query(collection(db, "orders"), orderBy("placedAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => d.data())), onError);
}

/** Admin only — update an order's status. */
async function updateOrderStatus(id, status) {
  requireDb();
  await updateDoc(doc(db, "orders", id.trim().toUpperCase()), {
    status,
    updatedAt: serverTimestamp(),
  });
}

async function adminSignIn(email, password) {
  requireDb();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

async function adminSignOut() {
  requireDb();
  await signOut(auth);
}

function onAdminAuthChange(callback) {
  if (!isConfigured) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

window.SLOrders = {
  isConfigured,
  ORDER_STAGES,
  createOrder,
  getOrder,
  subscribeOrder,
  subscribeAllOrders,
  updateOrderStatus,
  adminSignIn,
  adminSignOut,
  onAdminAuthChange,
};

// Let the rest of the (non-module) page know the module has finished
// loading and window.SLOrders is ready to use.
window.dispatchEvent(new CustomEvent("slorders:ready"));
