# Setting up cloud order tracking (Firebase)

This connects checkout, `track-order.html`, and `admin.html` to a real,
free cloud database — so you can actually mark orders as Confirmed / Packed /
Out for Delivery / Delivered, and customers see it update live.

It takes about 10–15 minutes, all through the Firebase website — no coding.

---

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Add project**, name it something like `sneakerslink` → continue.
3. You can disable Google Analytics for this project (not needed) → **Create project**.

## 2. Register a web app and get your config keys

1. On the project's Overview page, click the **`</>`** (web) icon to add a web app.
2. Give it a nickname like `SneakersLink Web` → **Register app**.
   (Skip "Firebase Hosting" here — not required.)
3. Firebase shows you a `firebaseConfig` object like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "sneakerslink.firebaseapp.com",
     projectId: "sneakerslink",
     storageBucket: "sneakerslink.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123",
   };
   ```

4. Open **`firebase-config.js`** in this project and replace the placeholder
   values with your real ones (keep the `export const firebaseConfig = {...}`
   structure — just swap the values inside).

## 3. Turn on Firestore (the database)

1. In the left sidebar: **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** → pick a location close to you → **Enable**.
3. Once it's created, open the **Rules** tab and replace the default rules with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /orders/{orderId} {
         allow get: if true;                     // customers can look up ONE order by its exact reference
         allow list: if request.auth != null;     // only a signed-in admin can browse ALL orders
         allow create: if true;                   // the storefront can create new orders at checkout
         allow update: if request.auth != null;   // only a signed-in admin can change an order's status
         allow delete: if false;
       }
     }
   }
   ```

4. Click **Publish**.

   > **What this does:** a customer can only ever fetch an order if they
   > already know its exact reference (e.g. `SL-AB12CDE`) — they can't browse
   > or list other people's orders. Only someone signed in as an admin can see
   > the full order list or change a status. Order *creation* is left open
   > since checkout happens with no one signed in — fine for a small shop, but
   > if this ever gets targeted by spam order-creation, look into adding
   > [Firebase App Check](https://firebase.google.com/docs/app-check) later.

## 4. Turn on Authentication and create your admin login

1. **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password** → Save.
3. Go to the **Users** tab → **Add user** → enter the email and password
   *you* want to log into `admin.html` with → **Add user**.

   This is not a customer account — it's just you. Don't share it, and don't
   build a public sign-up flow pointing at it.

## 5. Put the site online

Firebase's SDK needs the site served over `http(s)`, not opened directly as a
local file. Any of these work — pick whichever's easiest:

- **Netlify (easiest, no install):** go to <https://app.netlify.com/drop> and
  drag the whole project folder onto the page. You get a live URL in seconds.
- **GitHub Pages:** push this folder to a GitHub repo → Settings → Pages →
  deploy from the `main` branch.
- **Firebase Hosting:** since you already have a Firebase project, `npm
  install -g firebase-tools`, then `firebase init hosting` and `firebase
  deploy` from this folder (needs Node.js installed).

## 6. Test it end-to-end

1. On the live site: add a sneaker to your cart → checkout → note the order
   reference shown (e.g. `SL-AB12CDE`).
2. Open `yoursite.com/admin.html`, sign in with the admin account from step 4.
   The order should appear immediately.
3. Change its status in the dropdown (e.g. to **Packed**).
4. Open `yoursite.com/track-order.html`, enter the same reference — the
   status updates live, even without refreshing.

---

### Notes

- Until you complete this setup, the site still works — checkout and tracking
  quietly fall back to a local, per-browser simulation (status estimated from
  time elapsed) so nothing breaks. `track-order.html` shows a small note when
  it's running in this fallback mode.
- `admin.html` is not linked from the site's navigation on purpose — bookmark
  the URL yourself. It's still safe if someone else finds it: without signing
  in, they only see a login screen, and Firestore's rules (step 3) block
  anyone unauthenticated from reading or changing order data.
- Firebase's free "Spark" tier comfortably covers a small shop's order volume
  at no cost.
