/* =========================================================
   FIREBASE CONFIG
   ---------------------------------------------------------
   SneakersLink Firebase project configuration.

   IMPORTANT: SECURITY BEST PRACTICES
   ==========================================================
   1. For production: Move these values to environment variables
      via a build tool (Vite, webpack, etc.) and reference
      import.meta.env.VITE_FIREBASE_* variables.

      Example (for Vite):
      const firebaseConfig = {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      };

   2. Ensure Firestore rules restrict database access to
      authenticated users only. Never rely on API keys for
      security—use proper Firestore security rules.

   3. Firebase API keys are public by design (client-side apps
      need them), but Firestore rules and Storage rules are your
      real security layer. See SETUP.md for proper configuration.

   4. Setup: Copy .env.example to .env and fill in your Firebase
      project credentials from Firebase Console.
      Never commit .env files to git.

   MODULES USING THIS CONFIG:
   - firebase-auth.js (Authentication: login, register, password reset)
   - firebase-profile.js (User profile: update info, upload avatar)
   - firebase-orders.js (Order management: create, track orders)
   ========================================================= */

export const firebaseConfig = {
  apiKey: "AIzaSyDSj98ZRoDnSRqlwWGPQvGCO4NLJ1vW5Lg",
  authDomain: "my-ecommerce-141f3.firebaseapp.com",
  projectId: "my-ecommerce-141f3",
  storageBucket: "my-ecommerce-141f3.firebasestorage.app",
  messagingSenderId: "906549881554",
  appId: "1:906549881554:web:7612e5c2326ff3fd0c9b0b",
};
