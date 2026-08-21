/* =========================================================
   SneakersLink — Customer Notifications
   ---------------------------------------------------------
   Firestore:
       notifications/{notificationId}
           uid        — owning customer's Firebase Auth UID
           type       — "order" | "promo"
           title      — short heading
           message    — body text
           link       — optional page to open when tapped
           read       — boolean
           createdAt  — server timestamp

   This module only READS notifications and marks them read —
   it powers the bell icon in the nav. Notifications are WRITTEN
   from the modules that actually know something happened:
     - firebase-orders.js   -> order status changes
     - firebase-auth.js     -> welcome / first-signup message

   Each of those writes with its own Firestore handle rather
   than depending on this module being loaded first, so the
   bell UI (this file) and the writers stay decoupled.

   Query note: this deliberately filters with `where("uid", ...)`
   only and sorts client-side, instead of adding `orderBy` to the
   same query — that would require a Firestore composite index
   to be created manually in the console before it would work,
   which the rest of this project's queries avoid for the same
   reason (see getCustomerOrders in firebase-orders.js).

   Suggested Firestore Security Rule:

       match /notifications/{notificationId} {
         allow read, update: if request.auth != null
                              && request.auth.uid == resource.data.uid;
         allow create: if request.auth != null;
       }

   Public API:
       window.SLNotifications
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
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================================================
   FIREBASE INITIALISATION
   ========================================================= */

const isConfigured = Boolean(
  firebaseConfig?.apiKey && !String(firebaseConfig.apiKey).startsWith("YOUR_"),
);

let app = null;
let db = null;

if (isConfigured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  db = getFirestore(app);
}

const MAX_NOTIFICATIONS = 40;

/* =========================================================
   HELPERS
   ========================================================= */

function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function sortByNewest(list) {
  return [...list].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

/* =========================================================
   SUBSCRIBE
   ---------------------------------------------------------
   Real-time list of a customer's notifications, newest first.
   Returns an unsubscribe function — always call it on logout
   or when the caller no longer needs updates.
   ========================================================= */

function subscribe(uid, callback) {
  if (typeof callback !== "function") {
    throw new TypeError("Notification callback must be a function.");
  }

  if (!isConfigured || !db || !uid) {
    callback([]);

    return () => {};
  }

  const notifQuery = query(
    collection(db, "notifications"),
    where("uid", "==", uid),
    limit(MAX_NOTIFICATIONS),
  );

  return onSnapshot(
    notifQuery,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      callback(sortByNewest(list));
    },
    (error) => {
      console.warn("[SneakersLink] Notification subscription error:", error);

      callback([]);
    },
  );
}

/* =========================================================
   MARK AS READ
   ========================================================= */

async function markAsRead(notificationId) {
  if (!isConfigured || !db || !notificationId) {
    return;
  }

  try {
    await updateDoc(doc(db, "notifications", notificationId), {
      read: true,
    });
  } catch (error) {
    console.warn("[SneakersLink] Could not mark notification as read:", error);
  }
}

async function markAllAsRead(notificationIds = []) {
  if (!isConfigured || !db || !notificationIds.length) {
    return;
  }

  await Promise.all(
    notificationIds.map((id) =>
      updateDoc(doc(db, "notifications", id), { read: true }).catch((error) => {
        console.warn("[SneakersLink] Could not mark notification as read:", error);
      }),
    ),
  );
}

/* =========================================================
   PUBLIC API
   ========================================================= */

window.SLNotifications = {
  isConfigured,
  subscribe,
  markAsRead,
  markAllAsRead,
};

/* =========================================================
   READY EVENT
   ========================================================= */

window.dispatchEvent(new CustomEvent("slnotifications:ready"));
