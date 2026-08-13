/* =========================================================
   SneakersLink — Firebase Order Service
   Production-ready order, tracking and admin status engine
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

const isConfigured = Boolean(
  firebaseConfig?.apiKey &&
  !String(firebaseConfig.apiKey).startsWith("YOUR_")
);

let app = null;
let db = null;
let auth = null;

if (isConfigured) {
  app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

  db = getFirestore(app);
  auth = getAuth(app);
}


/* =========================================================
   ORDER STATUSES
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

const VALID_STATUSES = new Set(
  ORDER_STAGES.map(
    (stage) => stage.key
  )
);


/* =========================================================
   FIREBASE REQUIREMENTS
   ========================================================= */

function requireDb() {
  if (!isConfigured || !db) {
    throw new Error(
      "Firebase is not configured. Add your Firebase project settings to firebase-config.js."
    );
  }
}


function requireAuth() {
  requireDb();

  if (!auth) {
    throw new Error(
      "Firebase Authentication is unavailable."
    );
  }
}


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function cleanOrderId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}


function cleanEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


function cleanText(value, maxLength = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}


function toSafeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function toSafeQuantity(value) {
  const quantity = Math.floor(
    toSafeNumber(value, 1)
  );

  return Math.min(
    99,
    Math.max(1, quantity)
  );
}


/* =========================================================
   ORDER ID GENERATOR
   ========================================================= */

function generateOrderId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues ===
      "function"
  ) {
    const bytes =
      new Uint8Array(8);

    globalThis.crypto.getRandomValues(
      bytes
    );

    const randomPart = [...bytes]
      .map((byte) =>
        byte
          .toString(36)
          .padStart(2, "0")
      )
      .join("")
      .slice(0, 12)
      .toUpperCase();

    return `SL-${randomPart}`;
  }

  return (
    `SL-${Date.now().toString(36)}` +
    Math.random()
      .toString(36)
      .slice(2, 8)
  ).toUpperCase();
}


/* =========================================================
   AUTH HELPERS
   ========================================================= */

function getCurrentUser() {
  return auth?.currentUser || null;
}


function getCurrentCustomer() {
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
      Boolean(user.emailVerified),
  };
}


function onCustomerAuthChange(callback) {
  if (
    typeof callback !==
    "function"
  ) {
    throw new TypeError(
      "Authentication callback must be a function."
    );
  }

  if (!auth) {
    callback(null);

    return () => {};
  }

  return onAuthStateChanged(
    auth,
    callback
  );
}


async function customerSignIn(
  email,
  password
) {
  requireAuth();

  const cleanEmailAddress =
    cleanEmail(email);

  if (!cleanEmailAddress) {
    throw new Error(
      "Please enter your email address."
    );
  }

  if (!password) {
    throw new Error(
      "Please enter your password."
    );
  }

  const credential =
    await signInWithEmailAndPassword(
      auth,
      cleanEmailAddress,
      password
    );

  return credential.user;
}


async function customerSignOut() {
  requireAuth();

  await signOut(auth);
}


/* =========================================================
   ORDER ITEM VALIDATION
   ========================================================= */

function sanitiseItems(items) {
  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    throw new Error(
      "Your order contains no products."
    );
  }

  if (items.length > 100) {
    throw new Error(
      "Your order contains too many items."
    );
  }

  return items.map(
    (item, index) => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        throw new Error(
          `Invalid order item at position ${index + 1}.`
        );
      }

      const name = cleanText(
        item.name ||
          "Sneaker",
        160
      );

      const size = cleanText(
        item.size || "",
        20
      );

      const price = Math.max(
        0,
        toSafeNumber(
          item.price,
          0
        )
      );

      const qty =
        toSafeQuantity(
          item.qty ??
            item.quantity
        );

      const img = cleanText(
        item.img ||
          item.image ||
          "",
        500
      );

      if (!name) {
        throw new Error(
          `Invalid product name at item ${index + 1}.`
        );
      }

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        throw new Error(
          `Invalid product price at item ${index + 1}.`
        );
      }

      return {
        name,
        size,
        qty,
        price,
        img,
      };
    }
  );
}


/* =========================================================
   ORDER METADATA VALIDATION
   ========================================================= */

function sanitiseMetadata(
  metadata = {}
) {
  if (
    !metadata ||
    typeof metadata !== "object"
  ) {
    metadata = {};
  }

  const subtotal = Math.max(
    0,
    toSafeNumber(
      metadata.subtotal,
      0
    )
  );

  const discount = Math.min(
    subtotal,
    Math.max(
      0,
      toSafeNumber(
        metadata.discount,
        0
      )
    )
  );

  return {
    subtotal,
    discount,

    coupon: cleanText(
      metadata.coupon ||
        "",
      40
    ),

    customerName: cleanText(
      metadata.customerName ||
        metadata.name ||
        "",
      120
    ),

    customerEmail: cleanEmail(
      metadata.customerEmail ||
        metadata.email ||
        ""
    ),

    customerPhone: cleanText(
      metadata.customerPhone ||
        metadata.phone ||
        "",
      40
    ),

    deliveryAddress: cleanText(
      metadata.deliveryAddress ||
        metadata.address ||
        "",
      500
    ),

    city: cleanText(
      metadata.city ||
        "",
      100
    ),
  };
}


/* =========================================================
   CREATE ORDER
   ========================================================= */

/**
 * Creates a new Firestore order.
 *
 * Collection:
 *
 * orders/{orderId}
 *
 * Initial status:
 *
 * placed
 */
async function createOrder(
  items,
  total,
  metadata = {}
) {
  requireDb();

  const cleanItems =
    sanitiseItems(items);

  const cleanMetadata =
    sanitiseMetadata(
      metadata
    );

  const cleanTotal =
    Math.max(
      0,
      toSafeNumber(
        total,
        0
      )
    );

  /*
   * Prevent inconsistent totals.
   *
   * If subtotal/discount are supplied, the expected total
   * should be subtotal - discount.
   */
  const expectedTotal =
    Math.max(
      0,
      cleanMetadata.subtotal -
        cleanMetadata.discount
    );

  /*
   * Use the explicitly supplied total, but never allow
   * a negative value.
   *
   * The frontend should always send:
   *
   * total = subtotal - discount
   */
  const finalTotal =
    cleanTotal >= 0
      ? cleanTotal
      : expectedTotal;

  const id =
    generateOrderId();

  const order = {
    id,

    items: cleanItems,

    total: finalTotal,

    subtotal:
      cleanMetadata.subtotal,

    discount:
      cleanMetadata.discount,

    coupon:
      cleanMetadata.coupon,

    customerName:
      cleanMetadata.customerName,

    customerEmail:
      cleanMetadata.customerEmail,

    customerPhone:
      cleanMetadata.customerPhone,

    deliveryAddress:
      cleanMetadata.deliveryAddress,

    city:
      cleanMetadata.city,

    status: "placed",

    placedAt:
      serverTimestamp(),

    updatedAt:
      serverTimestamp(),
  };

  await setDoc(
    doc(
      db,
      "orders",
      id
    ),
    order
  );

  /*
   * Return a client-safe representation.
   *
   * serverTimestamp() resolves asynchronously, so we use
   * the current client timestamp for the immediate response.
   */
  const now = Date.now();

  return {
    ...order,

    placedAt: now,

    updatedAt: now,
  };
}


/* =========================================================
   GET SINGLE ORDER
   ========================================================= */

async function getOrder(id) {
  requireDb();

  const cleanId =
    cleanOrderId(id);

  if (!cleanId) {
    return null;
  }

  const snapshot =
    await getDoc(
      doc(
        db,
        "orders",
        cleanId
      )
    );

  if (!snapshot.exists()) {
    return null;
  }

  return {
    ...snapshot.data(),
    id: snapshot.id,
  };
}


/* =========================================================
   REAL-TIME ORDER TRACKING
   ========================================================= */

/**
 * Subscribe to one order.
 *
 * Returns the unsubscribe function supplied by Firestore.
 */
function subscribeOrder(
  id,
  onChange,
  onError
) {
  requireDb();

  if (
    typeof onChange !==
    "function"
  ) {
    throw new TypeError(
      "onChange must be a function."
    );
  }

  const cleanId =
    cleanOrderId(id);

  if (!cleanId) {
    throw new Error(
      "An order reference is required."
    );
  }

  return onSnapshot(
    doc(
      db,
      "orders",
      cleanId
    ),

    (snapshot) => {
      if (
        !snapshot.exists()
      ) {
        onChange(null);

        return;
      }

      onChange({
        ...snapshot.data(),
        id: snapshot.id,
      });
    },

    (error) => {
      if (
        typeof onError ===
        "function"
      ) {
        onError(error);

        return;
      }

      console.error(
        "Order tracking error:",
        error
      );
    }
  );
}


/* =========================================================
   GET ALL ORDERS — ADMIN
   ========================================================= */

/**
 * Subscribe to recent orders.
 *
 * This should only be called from the admin dashboard.
 *
 * Firestore security rules must still enforce admin access.
 */
function subscribeAllOrders(
  onChange,
  onError,
  max = 50
) {
  requireDb();

  if (
    typeof onChange !==
    "function"
  ) {
    throw new TypeError(
      "onChange must be a function."
    );
  }

  const safeLimit =
    Math.min(
      100,
      Math.max(
        1,
        Math.floor(
          toSafeNumber(
            max,
            50
          )
        )
      )
    );

  const ordersQuery =
    query(
      collection(
        db,
        "orders"
      ),
      orderBy(
        "placedAt",
        "desc"
      ),
      limit(
        safeLimit
      )
    );

  return onSnapshot(
    ordersQuery,

    (snapshot) => {
      const orders =
        snapshot.docs.map(
          (orderDoc) => ({
            ...orderDoc.data(),
            id: orderDoc.id,
          })
        );

      onChange(orders);
    },

    (error) => {
      if (
        typeof onError ===
        "function"
      ) {
        onError(error);

        return;
      }

      console.error(
        "Admin order subscription error:",
        error
      );
    }
  );
}


/* =========================================================
   UPDATE ORDER STATUS — ADMIN
   ========================================================= */

async function updateOrderStatus(
  id,
  status
) {
  requireDb();

  const cleanId =
    cleanOrderId(id);

  if (!cleanId) {
    throw new Error(
      "An order reference is required."
    );
  }

  const cleanStatus =
    cleanText(
      status,
      30
    ).toLowerCase();

  if (
    !VALID_STATUSES.has(
      cleanStatus
    )
  ) {
    throw new Error(
      "Invalid order status."
    );
  }

  /*
   * Confirm that the order exists before updating it.
   */
  const orderRef =
    doc(
      db,
      "orders",
      cleanId
    );

  const snapshot =
    await getDoc(
      orderRef
    );

  if (!snapshot.exists()) {
    throw new Error(
      "Order not found."
    );
  }

  await updateDoc(
    orderRef,
    {
      status:
        cleanStatus,

      updatedAt:
        serverTimestamp(),
    }
  );

  return {
    id: cleanId,
    status: cleanStatus,
  };
}


/* =========================================================
   ADMIN AUTHENTICATION
   ========================================================= */

async function adminSignIn(
  email,
  password
) {
  requireAuth();

  const cleanEmailAddress =
    cleanEmail(email);

  if (!cleanEmailAddress) {
    throw new Error(
      "Please enter the administrator email."
    );
  }

  if (!password) {
    throw new Error(
      "Please enter the administrator password."
    );
  }

  /*
   * Firebase Authentication handles the actual credential
   * verification.
   *
   * Firestore security rules must additionally verify that
   * the authenticated UID exists under:
   *
   * admins/{uid}
   *
   * and has:
   *
   * enabled: true
   */
  const credential =
    await signInWithEmailAndPassword(
      auth,
      cleanEmailAddress,
      password
    );

  return credential.user;
}


async function adminSignOut() {
  requireAuth();

  await signOut(auth);
}


function onAdminAuthChange(
  callback
) {
  if (
    typeof callback !==
    "function"
  ) {
    throw new TypeError(
      "Authentication callback must be a function."
    );
  }

  if (!auth) {
    callback(null);

    return () => {};
  }

  return onAuthStateChanged(
    auth,
    callback
  );
}


/* =========================================================
   ORDER STATUS HELPERS
   ========================================================= */

function getOrderStage(
  status
) {
  const cleanStatus =
    cleanText(
      status,
      30
    ).toLowerCase();

  return (
    ORDER_STAGES.find(
      (stage) =>
        stage.key ===
        cleanStatus
    ) || null
  );
}


function getOrderStageIndex(
  status
) {
  const cleanStatus =
    cleanText(
      status,
      30
    ).toLowerCase();

  return ORDER_STAGES.findIndex(
    (stage) =>
      stage.key ===
      cleanStatus
  );
}


function getOrderProgress(
  status
) {
  const index =
    getOrderStageIndex(
      status
    );

  if (index < 0) {
    return 0;
  }

  if (
    ORDER_STAGES.length <= 1
  ) {
    return 100;
  }

  return Math.round(
    (index /
      (ORDER_STAGES.length -
        1)) *
      100
  );
}


/* =========================================================
   PUBLIC API
   ========================================================= */

window.SLOrders = {
  isConfigured,

  ORDER_STAGES,

  VALID_STATUSES,

  createOrder,

  getOrder,

  subscribeOrder,

  subscribeAllOrders,

  updateOrderStatus,

  getOrderStage,

  getOrderStageIndex,

  getOrderProgress,

  getCurrentUser,

  getCurrentCustomer,

  customerSignIn,

  customerSignOut,

  onCustomerAuthChange,

  adminSignIn,

  adminSignOut,

  onAdminAuthChange,
};


/* =========================================================
   READY EVENT
   ========================================================= */

window.dispatchEvent(
  new CustomEvent(
    "slorders:ready"
  )
);