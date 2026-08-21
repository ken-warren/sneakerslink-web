/* =========================================================
   SneakersLink — Firebase Order Service
   ---------------------------------------------------------
   Handles:
   - Order creation
   - Customer order lookup
   - Customer order history
   - Customer order tracking
   - Real-time order tracking
   - Admin order listing
   - Admin status updates
   - Order status helpers
   - Firebase Authentication helpers
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
    where,
    orderBy,
    limit,
    getDocs,
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
        shortLabel: "Placed",
        icon: "fa-receipt",
    },
    {
        key: "confirmed",
        label: "Confirmed",
        shortLabel: "Confirmed",
        icon: "fa-check-circle",
    },
    {
        key: "packed",
        label: "Packed",
        shortLabel: "Packed",
        icon: "fa-box",
    },
    {
        key: "out",
        label: "Out for Delivery",
        shortLabel: "Out for Delivery",
        icon: "fa-truck",
    },
    {
        key: "delivered",
        label: "Delivered",
        shortLabel: "Delivered",
        icon: "fa-home",
    },
];

const VALID_STATUSES = new Set(
    ORDER_STAGES.map(stage => stage.key)
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
   TIMESTAMP HELPER
   ========================================================= */

function normaliseTimestamp(value) {

    if (!value) {
        return null;
    }

    if (
        typeof value.toDate ===
        "function"
    ) {
        return value.toDate();
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "number") {

        const date =
            new Date(value);

        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date;
    }

    if (typeof value === "string") {

        const date =
            new Date(value);

        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date;
    }

    return null;
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

        const randomPart =
            [...bytes]
                .map(
                    byte =>
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
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        emailVerified:
            Boolean(user.emailVerified),
    };
}


function onCustomerAuthChange(
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


/*
 * NOTE: there is no separate "customer sign-in" here.
 * Customer login/logout is handled by firebase-auth.js
 * (window.SLAuth.login / .logout). This module previously
 * had its own customerSignIn/customerSignOut that duplicated
 * adminSignIn/adminSignOut exactly — same Firebase call, no
 * role distinction — and were unused anywhere in the app.
 * Removed to avoid implying "customer" and "admin" sign-in
 * were meaningfully different paths; see isAdminUser() below
 * for the actual admin/customer distinction.
 */


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
                typeof item !==
                    "object"
            ) {
                throw new Error(
                    `Invalid order item at position ${index + 1}.`
                );
            }

            const name =
                cleanText(
                    item.name ||
                    "Sneaker",
                    160
                );

            const size =
                cleanText(
                    item.size || "",
                    20
                );

            const price =
                Math.max(
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

            const img =
                cleanText(
                    item.img ||
                    item.image ||
                    "",
                    500
                );

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
   ORDER METADATA
   ========================================================= */

function sanitiseMetadata(
    metadata = {}
) {

    if (
        !metadata ||
        typeof metadata !==
            "object"
    ) {
        metadata = {};
    }

    const subtotal =
        Math.max(
            0,
            toSafeNumber(
                metadata.subtotal,
                0
            )
        );

    const discount =
        Math.min(
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

        coupon:
            cleanText(
                metadata.coupon ||
                "",
                40
            ),

        customerName:
            cleanText(
                metadata.customerName ||
                metadata.name ||
                "",
                120
            ),

        customerEmail:
            cleanEmail(
                metadata.customerEmail ||
                metadata.email ||
                ""
            ),

        customerPhone:
            cleanText(
                metadata.customerPhone ||
                metadata.phone ||
                "",
                40
            ),

        deliveryAddress:
            cleanText(
                metadata.deliveryAddress ||
                metadata.address ||
                "",
                500
            ),

        city:
            cleanText(
                metadata.city ||
                "",
                100
            ),

        customerUid:
            cleanText(
                metadata.customerUid ||
                metadata.uid ||
                "",
                150
            ),
    };
}


/* =========================================================
   CREATE ORDER
   ========================================================= */

async function createOrder(
    items,
    total,
    metadata = {}
) {

    requireDb();

    const cleanItems =
        sanitiseItems(items);

    const cleanMetadata =
        sanitiseMetadata(metadata);

    const currentUser =
        getCurrentUser();

    if (
        currentUser &&
        !cleanMetadata.customerUid
    ) {
        cleanMetadata.customerUid =
            currentUser.uid;
    }

    if (currentUser?.email) {

        cleanMetadata.customerEmail =
            cleanEmail(
                currentUser.email
            );
    }

    const cleanTotal =
        Math.max(
            0,
            toSafeNumber(
                total,
                0
            )
        );

    const expectedTotal =
        Math.max(
            0,
            cleanMetadata.subtotal -
                cleanMetadata.discount
        );

    const finalTotal =
        Number.isFinite(
            Number(total)
        )
            ? cleanTotal
            : expectedTotal;

    const id =
        generateOrderId();

    const order = {

        id,

        customerUid:
            cleanMetadata.customerUid,

        customerEmail:
            cleanMetadata.customerEmail,

        customerName:
            cleanMetadata.customerName,

        customerPhone:
            cleanMetadata.customerPhone,

        deliveryAddress:
            cleanMetadata.deliveryAddress,

        city:
            cleanMetadata.city,

        items:
            cleanItems,

        subtotal:
            cleanMetadata.subtotal,

        discount:
            cleanMetadata.discount,

        coupon:
            cleanMetadata.coupon,

        total:
            finalTotal,

        status:
            "placed",

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

    const now =
        Date.now();

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
   CUSTOMER OWNERSHIP
   ========================================================= */

function orderBelongsToUser(
    order,
    user
) {

    if (!order || !user) {
        return false;
    }

    /*
     * Preferred method:
     * Firebase UID.
     */
    if (
        order.customerUid &&
        order.customerUid ===
            user.uid
    ) {
        return true;
    }

    /*
     * Backward compatibility:
     * older orders may not contain UID.
     */
    if (
        !order.customerUid &&
        order.customerEmail &&
        user.email &&
        cleanEmail(
            order.customerEmail
        ) ===
            cleanEmail(
                user.email
            )
    ) {
        return true;
    }

    return false;
}


/* =========================================================
   GET CUSTOMER ORDER
   ---------------------------------------------------------
   Used by track-order.html.
   ========================================================= */

async function getCustomerOrder(
    id
) {

    requireAuth();

    const user =
        getCurrentUser();

    if (!user) {
        throw new Error(
            "Please sign in to track your order."
        );
    }

    const cleanId =
        cleanOrderId(id);

    if (!cleanId) {
        return null;
    }

    const order =
        await getOrder(cleanId);

    if (!order) {
        return null;
    }

    if (
        !orderBelongsToUser(
            order,
            user
        )
    ) {
        return null;
    }

    return order;
}


/* =========================================================
   GET ALL CUSTOMER ORDERS
   ---------------------------------------------------------
   Returns the customer's complete order history.
   ========================================================= */

async function getCustomerOrders(
    maxOrders = 100
) {

    requireAuth();

    const user =
        getCurrentUser();

    if (!user) {
        throw new Error(
            "Please sign in to view your orders."
        );
    }

    const safeLimit =
        Math.min(
            100,
            Math.max(
                1,
                Math.floor(
                    toSafeNumber(
                        maxOrders,
                        100
                    )
                )
            )
        );

    const ordersRef =
        collection(
            db,
            "orders"
        );

    /*
     * First attempt:
     * UID-based lookup.
     */
    let uidOrders = [];

    try {

        const uidQuery =
            query(
                ordersRef,
                where(
                    "customerUid",
                    "==",
                    user.uid
                ),
                limit(safeLimit)
            );

        const snapshot =
            await getDocs(
                uidQuery
            );

        uidOrders =
            snapshot.docs.map(
                orderDoc => ({
                    ...orderDoc.data(),
                    id: orderDoc.id,
                })
            );

    } catch (error) {

        console.warn(
            "UID order history lookup failed:",
            error
        );
    }


    /*
     * Second lookup:
     * email-based lookup.
     *
     * This supports older orders created
     * before customerUid was introduced.
     */
    let emailOrders = [];

    if (user.email) {

        try {

            const emailQuery =
                query(
                    ordersRef,
                    where(
                        "customerEmail",
                        "==",
                        cleanEmail(
                            user.email
                        )
                    ),
                    limit(safeLimit)
                );

            const snapshot =
                await getDocs(
                    emailQuery
                );

            emailOrders =
                snapshot.docs.map(
                    orderDoc => ({
                        ...orderDoc.data(),
                        id: orderDoc.id,
                    })
                );

        } catch (error) {

            console.warn(
                "Email order history lookup failed:",
                error
            );
        }
    }


    /*
     * Merge and remove duplicates.
     */
    const orderMap =
        new Map();

    [
        ...uidOrders,
        ...emailOrders,
    ].forEach(order => {

        if (
            order &&
            order.id
        ) {
            orderMap.set(
                order.id,
                order
            );
        }
    });


    /*
     * Final client-side ownership check.
     */
    const orders =
        [...orderMap.values()]
            .filter(
                order =>
                    orderBelongsToUser(
                        order,
                        user
                    )
            )
            .sort(
                (
                    a,
                    b
                ) => {

                    const dateA =
                        normaliseTimestamp(
                            a.placedAt
                        );

                    const dateB =
                        normaliseTimestamp(
                            b.placedAt
                        );

                    return (
                        (dateB?.getTime() || 0) -
                        (dateA?.getTime() || 0)
                    );
                }
            )
            .slice(
                0,
                safeLimit
            );

    return orders;
}


/* =========================================================
   SUBSCRIBE TO CUSTOMER ORDER
   ========================================================= */

function subscribeCustomerOrder(
    id,
    onChange,
    onError
) {

    requireAuth();

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

    const user =
        getCurrentUser();

    if (!user) {
        throw new Error(
            "Please sign in to track your order."
        );
    }

    return onSnapshot(

        doc(
            db,
            "orders",
            cleanId
        ),

        snapshot => {

            if (!snapshot.exists()) {

                onChange(null);

                return;
            }

            const order = {
                ...snapshot.data(),
                id: snapshot.id,
            };

            if (
                !orderBelongsToUser(
                    order,
                    user
                )
            ) {

                onChange(null);

                return;
            }

            onChange(order);
        },

        error => {

            if (
                typeof onError ===
                "function"
            ) {

                onError(error);

                return;
            }

            console.error(
                "Customer order tracking error:",
                error
            );
        }
    );
}


/* =========================================================
   GENERAL REAL-TIME ORDER
   ========================================================= */

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

        snapshot => {

            if (!snapshot.exists()) {

                onChange(null);

                return;
            }

            onChange({
                ...snapshot.data(),
                id: snapshot.id,
            });
        },

        error => {

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
   ADMIN — ALL ORDERS
   ========================================================= */

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

        snapshot => {

            const orders =
                snapshot.docs.map(
                    orderDoc => ({
                        ...orderDoc.data(),
                        id: orderDoc.id,
                    })
                );

            onChange(orders);
        },

        error => {

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
   ORDER STATUS NOTIFICATION
   ---------------------------------------------------------
   Writes directly to notifications/{id} rather than going
   through firebase-notifications.js — admin.html (the only
   page that calls updateOrderStatus) doesn't necessarily load
   that module, so this stays self-contained instead of
   depending on load order. Never throws: a notification
   failing to write must never fail the actual status update.
   ========================================================= */

async function notifyOrderStatus(
    customerUid,
    orderId,
    status
) {

    if (!customerUid) {
        return;
    }

    const stage =
        ORDER_STAGES.find(
            item => item.key === status
        );

    const stageLabel =
        stage?.label || status;

    try {

        const notifRef =
            doc(
                collection(
                    db,
                    "notifications"
                )
            );

        await setDoc(
            notifRef,
            {
                uid: customerUid,

                type: "order",

                title: `Order ${orderId}`,

                message:
                    `Your order is now: ${stageLabel}.`,

                link:
                    `track-order.html?order=${encodeURIComponent(orderId)}`,

                read: false,

                createdAt: serverTimestamp(),
            }
        );

    } catch (error) {

        console.warn(
            "[SneakersLink] Could not write order status notification:",
            error
        );
    }
}


/* =========================================================
   ADMIN — UPDATE STATUS
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

    /*
     * Fire-and-forget — the status update above has already
     * succeeded and must be returned to the admin regardless of
     * whether the customer notification write works.
     */
    notifyOrderStatus(
        snapshot.data()?.customerUid,
        cleanId,
        cleanStatus
    ).catch(() => {});

    return {
        id: cleanId,
        status: cleanStatus,
    };
}


/* =========================================================
   ADMIN AUTH
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
   ADMIN ROLE CHECK
   ---------------------------------------------------------
   IMPORTANT — READ BEFORE RELYING ON THIS:

   Signing in above only proves someone has a valid Firebase
   Authentication account — customers can create their own
   accounts from login.html, so "signed in" is NOT the same
   as "is an admin".

   This checks a Firestore allow-list document at
   admins/{uid}. Whoever should be allowed to use admin.html
   needs ONE document created for them:

       Firestore console -> Data -> Start collection "admins"
       -> Document ID: their Firebase Auth UID
       -> any field, e.g. { role: "admin" }

   This client-side check is a UI convenience only — it stops
   a non-admin from ever *seeing* the dashboard in normal use,
   but it is not a security boundary by itself, since a
   determined user could bypass client-side JavaScript
   entirely. The actual security boundary has to be Firestore
   Security Rules, e.g.:

       match /admins/{uid} {
         allow read: if request.auth != null
                     && request.auth.uid == uid;
       }
       match /orders/{orderId} {
         allow list, update: if request.auth != null
           && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
         ...
       }

   Without that rules change, anyone who knows (or guesses) a
   customer's Firebase project details could still call the
   Firestore SDK directly and bypass this page entirely — this
   function only protects the normal, in-app flow.
   ========================================================= */

async function isAdminUser(
    uid
) {

    requireDb();

    if (!uid) {
        return false;
    }

    try {

        const snapshot =
            await getDoc(
                doc(
                    db,
                    "admins",
                    uid
                )
            );

        return snapshot.exists();

    } catch (error) {

        console.warn(
            "[SneakersLink] Admin role check failed:",
            error
        );

        return false;
    }
}


/* =========================================================
   STATUS HELPERS
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
            stage =>
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
        stage =>
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
        ORDER_STAGES.length <=
        1
    ) {
        return 100;
    }

    return Math.round(
        (
            index /
            (ORDER_STAGES.length - 1)
        ) * 100
    );
}


function getOrderStatusLabel(
    status
) {

    const stage =
        getOrderStage(
            status
        );

    return stage
        ? stage.label
        : "Order Status";
}


/* =========================================================
   DISPLAY HELPERS
   ========================================================= */

function formatOrderDate(
    value
) {

    const date =
        normaliseTimestamp(
            value
        );

    if (!date) {
        return "";
    }

    return new Intl.DateTimeFormat(
        "en-KE",
        {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }
    ).format(date);
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

    getCustomerOrder,

    getCustomerOrders,

    subscribeOrder,

    subscribeCustomerOrder,

    subscribeAllOrders,

    updateOrderStatus,

    getOrderStage,

    getOrderStageIndex,

    getOrderProgress,

    getOrderStatusLabel,

    formatOrderDate,

    getCurrentUser,

    getCurrentCustomer,

    onCustomerAuthChange,

    adminSignIn,

    adminSignOut,

    onAdminAuthChange,

    isAdminUser,
};


/* =========================================================
   READY EVENT
   ========================================================= */

window.dispatchEvent(
    new CustomEvent(
        "slorders:ready"
    )
);