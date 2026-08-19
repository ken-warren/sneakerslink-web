# SneakersLink — Project Progress

_Last updated: 2026-08-15 (Run 1)_

This file is the persistent record for multi-session audit/modernization work on
this codebase, per the project's continuity instructions. Read this before
starting any new run, then verify against the actual source (source always wins
if this doc and the code disagree).

---

## Run 1 summary (this run)

**Scope of this run:** Phase 1 (map the app) + a real Phase 2 audit pass,
prioritized per the stated order: broken functionality → security → auth/cart/
orders → navigation/core flows → responsive/accessibility/perf/polish.

**Headline finding:** this codebase is in noticeably better shape than a typical
"needs a full audit" starting point. Core modules (`script.js`,
`firebase-auth.js`, `firebase-orders.js`) already show defensive patterns:
safe localStorage read/write wrappers, `escapeHtml()` used consistently before
any `innerHTML` write with dynamic data, idempotent init (`appInitialised`
flag, `data-*-bound` guards on event listeners so re-running init doesn't
double-bind), numeric sanitization on cart/order data (qty clamped, price
clamped ≥ 0), friendly Firebase error mapping, and a documented Firestore
security-rules recommendation in `SETUP.md`. I did not find the kind of
broken/undefined-reference bugs the audit brief expects as a baseline — see
"Verified clean" below for what was actually checked.

I did **not** make sweeping rewrites, because the code doesn't show the
symptoms that would justify them, and rewriting working, defensive code
"to make it look different" is explicitly against the project's own rules
(section 11/16 of the audit brief). No files were changed in this run.

---

## Dependency map (verified)

| Page | style.css | script.js | firebase-auth.js | firebase-orders.js | firebase-profile.js |
|---|---|---|---|---|---|
| index.html | ✓ | ✓ | ✓ | ✓ | ✓ |
| shop.html | ✓ | ✓ | ✓ | – | – |
| sproduct.html | ✓ | ✓ | ✓ | – | – |
| cart.html | ✓ | ✓ | ✓ | ✓ | – |
| about.html | ✓ | ✓ | ✓ | – | – |
| blog.html | ✓ | ✓ | ✓ | – | – |
| contact.html | ✓ | ✓ | ✓ | – | – |
| track-order.html | ✓ | ✓ | ✓ | ✓ | ✓ |
| login.html | own inline `<style>` (mirrors style.css tokens) | – | ✓ | – | – |
| profile.html | own inline `<style>` | – | – | – | ✓ |
| admin.html | own inline `<style>` | – | – | ✓ | – |

`firebase-config.js` is imported by `firebase-auth.js`, `firebase-orders.js`,
`firebase-profile.js`. All Firebase modules attach to `window.SLAuth` /
`window.SLOrders` / `window.SLProfile` (plus a `window.SneakersLinkAuth` back-
compat alias) and dispatch `*:ready` custom events that `script.js` listens
for — this is how page-specific inline scripts (login/profile) and the shared
`script.js` stay decoupled from load order.

localStorage keys used: `sneakerslink_cart`, `sl_theme`, `sl_coupon`,
`sl_recent_orders`, `sl_local_orders`. sessionStorage key:
`sneakerslink_new_signup`. All are namespaced/prefixed — no collisions found.

## Verified clean (checked this run, no action needed)

- No duplicate `id=` attributes within any HTML file (initial grep hit was a
  false positive from `data-product-id`, not `id`).
- No missing `img/...` assets among direct `src="img/...` references.
- Every dynamic `innerHTML` write in `script.js` passes user/DB-sourced values
  through `escapeHtml()` first (checked all 11 call sites).
- Cart/init lifecycle is idempotent: `appInitialised` flag, `{once: true}` on
  `DOMContentLoaded`, and `data-*-bound` dataset flags before attaching cart/
  coupon listeners — rapid re-entry or multiple script evaluation won't
  double-bind handlers.
- `firebase-auth.js`: input validation before every Firebase call, try/catch
  with a friendly-error map on all auth operations, `merge: true` on
  Firestore profile writes so re-login doesn't clobber existing profile data.
- Font Awesome version differs across pages (5.15.4 CDN on most pages, 6.5.2
  cdnjs on `profile.html`/`track-order.html`). Confirmed via Font Awesome's
  own docs that v6's `all.css` auto-aliases v5 icon class names, so the
  FA5-style icon classes used by `script.js` (e.g. `fa-check-circle` in
  toasts) render correctly on the FA6 pages too — **not a functional bug**,
  just an inconsistent CDN pin. Low-priority cleanup candidate.

## Known findings / not yet fixed

1. **Order pricing is client-supplied (security, architectural).**
   `firebase-orders.js` clamps price to `≥ 0` and quantity to a safe integer
   range, but the actual price number still comes from the client's cart
   object, not a server-side product catalog. A user could edit
   `localStorage` before checkout and submit an order with an arbitrary
   total. This **cannot be fully fixed from the frontend** — it needs either
   Firestore Security Rules that validate price against a trusted
   `products` collection, or a Cloud Function that recomputes totals
   server-side before writing the order. `SETUP.md` already documents a
   baseline Firestore rules recommendation; it does not yet cover price
   validation. Flagging as an external dependency per the project's own
   rules — not something to fake-fix on the frontend.
2. **`login.html`, `profile.html`, `admin.html` duplicate ~250 lines each of
   design tokens/component CSS instead of sharing `style.css`.** Not a bug
   (values match `style.css`'s tokens, checked side-by-side), but a
   maintainability/DRY issue — a future palette change would need to be
   applied in 4 places instead of 1. Candidate for a future run: extract
   shared tokens into `style.css` (or a `base.css`) and have all pages import
   it, keeping only page-specific overrides inline.
3. **Coupon codes (`SL500`) are hardcoded client-side in `script.js`.**
   Fine for a single promo on a no-backend static site, but flagging since
   any user can read the code out of the JS source. Not fixed — this is a
   product/business decision (whether coupons need server enforcement), not
   an unambiguous bug.

## Not yet audited (remaining work for future runs)

Per the stated priority order, still to check in depth:
- `firebase-profile.js` (435 lines) — profile update flow, avatar upload,
  data persistence.
- `firebase-orders.js` beyond the sections reviewed — full order
  creation/tracking/admin-status-update path, Firestore query efficiency.
- Full responsive pass at actual breakpoints (checked media query count and
  CSS variable structure only, did not render/inspect layouts at each
  breakpoint).
- Accessibility pass (heading structure, ARIA on modals/nav, focus states,
  tab order) — not yet checked.
- `admin.html` full logic review (order status updates, auth gating for the
  admin panel — need to verify it isn't reachable/writable by non-admin
  users beyond whatever Firestore rules enforce).
- `track-order.html` (4795 lines — largest file) beyond the render function
  reviewed here.
- Performance pass: repeated DOM queries, Firebase call caching, debounced
  search on `shop.html`.

## Regression risks for future runs

- None yet, since no code was modified this run.

## Run 2 summary

**Scope:** item 1 from Run 1's next-tasks list — full audit of
`firebase-profile.js` and the profile page data flow.

### Bug found and fixed

**Firestore collection name drift between auth and profile modules.**
`firebase-auth.js`'s `createCustomerProfile()` was writing every logged-in
user's bootstrap profile to `customers/{uid}`. `firebase-profile.js` (the
module `profile.html` actually reads/writes) uses a completely different
document: `users/{uid}`. Confirmed via full-codebase grep that nothing
anywhere reads `customers/{uid}` — it was a write-only, always-effectively-
blank document created on *every single auth-state change* (i.e. most page
loads while logged in), while the real profile data a user enters
(phone/address/city/postalCode/country) lived only in `users/{uid}`. The two
functions' field schemas are identical (`uid`, `email`, `displayName`,
`phone`, `address`, `city`, `postalCode`, `country`, `photoURL`, `createdAt`,
`updatedAt`), which is strong evidence this was meant to be one shared
document and the collection name simply drifted between the two files at
some point.

**Fix applied:** `firebase-auth.js` now writes to `users/{uid}`, the same
document `firebase-profile.js` uses. This was safe to change — verified no
other file references the `customers` collection — and restores the
function's actual documented intent ("make sure an older customer account
that does not yet have a Firestore profile gets one"). File changed:
`firebase-auth.js` (one collection-name string + updated doc comment).

### Related issue found — NOT fixed, requires your action

**`SETUP.md`'s documented Firestore Security Rules only grant access to the
`orders` collection.** Firestore's "production mode" (which the same doc
tells you to choose when creating the database) denies all reads/writes by
default. As documented, this means `users/{uid}` — the actual profile
document, both before and after the fix above — has **no rules granting it
any access at all**, so profile reads/writes would fail with
`permission-denied` on a real deployment that only followed the documented
setup steps. This is a real gap, but:
- It lives in `SETUP.md`, which I'm not permitted to modify.
- It's a Firebase Console / infrastructure change, not something fixable
  from the supplied frontend source.

**What you'd need to add** to the Firestore rules (for your own reference —
not added anywhere in the repo): a `match /users/{uid}` block that allows a
signed-in user to read/write only their own document, e.g. permitting
`get`/`update`/`create` when `request.auth != null && request.auth.uid ==
uid`, denying everything else. Recommend adding this alongside the `orders`
rules already documented in `SETUP.md`, in the Firebase Console.

**Reassuring finding:** the frontend already degrades gracefully if this
happens today — `profile.html` has a dedicated error state (`#profileError`
/ `showError()`) for failed loads, a 15s timeout guard with a friendly
message on save, and never shows a blank/broken screen. So the *symptom*
(profile won't load/save until rules are added) is handled well; only the
underlying rules are missing.

### firebase-profile.js — rest of the audit (verified clean)

- `validateAvatar()` checks file type (`image/*`) and a 5MB size cap before
  any upload — reasonable client-side guard (server-side/Storage rules
  still need to enforce this for real security, same caveat as above).
- `uploadAvatar()`/`deleteAvatar()` correctly update both Firebase Auth's
  `photoURL` and the Firestore profile doc, and `deleteAvatar()` tolerates
  a `storage/object-not-found` error (e.g. deleting twice) without throwing.
- `updateProfile()` only ever writes an explicit allow-list of fields
  (`displayName`, `phone`, `address`, `city`, `postalCode`, `country`) —
  good defensive pattern, prevents arbitrary field injection from a caller.
- `onProfileAuthChange()` doesn't artificially delay already-known auth
  state, matching the comment's stated intent.

## Run 3 summary

**Scope:** item 1 from Run 2's next-tasks list — full read-through of
`firebase-orders.js` and `admin.html`.

### Critical finding, partially fixed: no real admin/customer distinction

**Before this run:** `admin.html`'s "Admin Sign In" form called
`adminSignIn(email, password)`, which was a byte-for-byte duplicate of an
unused `customerSignIn()` — a plain Firebase email/password sign-in with
**no role check of any kind**. Because `login.html` allows public
self-registration, any customer could create a normal account, navigate
directly to `admin.html`, sign in with their own credentials, and reach the
full order dashboard — every customer's name, phone, delivery address, and
order total, plus the ability to change any order's status via
`updateOrderStatus()` (which also had no auth/role check, only
`requireDb()`). The Firestore rules documented in `SETUP.md` don't close
this either — they grant `list`/`update` on `orders` to `if request.auth !=
null`, i.e. *any* signed-in user, not specifically an admin.

**What I fixed (frontend, this run):**
- Added `isAdminUser(uid)` to `firebase-orders.js` — checks for a Firestore
  document at `admins/{uid}` and returns whether it exists. Exported on
  `window.SLOrders.isAdminUser`.
- `admin.html` now calls this immediately after a successful sign-in, before
  ever rendering the dashboard or calling `subscribeAllOrders()`. If the
  signed-in account isn't in the `admins` allow-list, it shows a new "this
  account isn't an admin" state and never fetches order data.
- Removed the dead, duplicate `customerSignIn`/`customerSignOut` functions
  from `firebase-orders.js` (confirmed unused anywhere in the app —
  customer login goes through `firebase-auth.js`'s `SLAuth.login`) since
  they reinforced the illusion that "customer" and "admin" auth were two
  meaningfully different paths, when nothing ever actually distinguished
  them. `onCustomerAuthChange` was kept — `track-order.html` uses it.

**What this does NOT fix, and requires your action:**
This is a **client-side UI gate, not a security boundary**. It stops any
non-admin from *seeing* the dashboard through normal use of the site, but a
determined user could still call the Firestore SDK directly and bypass
`admin.html` entirely, because the actual data access is still controlled
by Firestore Security Rules — and the rules documented in `SETUP.md` don't
know about the new `admins` collection at all. To make this a real
boundary, two things need to happen outside the supplied source (documented
in code comments in `firebase-orders.js`, not added to `SETUP.md` since
that file is off-limits to me):
1. In the Firebase Console, create **one Firestore document**:
   `admins/{the-admin-account's-UID}` (any field, e.g. `{ role: "admin" }`)
   for each account that should have admin access.
2. Update the Firestore rules to require that document's existence for
   `orders` `list`/`update`, e.g.:
   ```
   match /admins/{uid} {
     allow read: if request.auth != null && request.auth.uid == uid;
   }
   match /orders/{orderId} {
     allow list, update: if request.auth != null
       && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
     // keep existing allow get: if true; and allow create: if true;
   }
   ```
Until step 2 is done, this is real defense-in-depth (blocks the UI path
entirely) but not a complete fix. I did not attempt to fake this being
"solved" — the dashboard now correctly refuses to show data to non-admins
in the app itself, but the underlying Firestore access is still only as
strict as whatever rules you have configured.

Files changed: `firebase-orders.js` (new `isAdminUser`, removed dead
`customerSignIn`/`customerSignOut`, updated exports), `admin.html` (new
access-denied state, admin check wired into the sign-in flow).

### Rest of firebase-orders.js — verified clean

- `sanitiseItems`/`sanitiseMetadata`/`createOrder`: numeric fields
  (price, qty, subtotal, discount, total) are all clamped to safe ranges
  (`≥ 0`, qty 1–99, max 100 items). Consistent with the client-trusted-price
  finding already logged in Run 1 — not a new issue, just re-confirmed while
  reading the full function. Given checkout here is WhatsApp-based (no
  automated payment capture — a human confirms the order over WhatsApp),
  the practical severity of a manipulated total is lower than it would be
  with an automated payment gateway, but the underlying gap is the same as
  already documented: total enforcement needs to happen server-side
  eventually if this ever adds real payments.
- `orderBelongsToUser()` / `getCustomerOrder()` / `subscribeCustomerOrder()`:
  correctly re-check ownership (`customerUid` or, as a documented fallback
  for older orders, `customerEmail`) after fetching — a user can't view
  another customer's order just by guessing/knowing its ID through these
  functions, even though the Firestore rule allows anyone to `get` a single
  order by exact reference (intentional, per `SETUP.md`, for the
  track-by-reference flow).
- `getCustomerOrders()` merges a UID-based query and an email-based query
  (for pre-UID legacy orders), de-duplicates, then re-validates ownership
  client-side before returning — good defensive layering, each individual
  piece checked out.
- `generateOrderId()` uses `crypto.getRandomValues` when available (12
  base-36 characters from 8 random bytes) with a `Date.now()`-based
  fallback — fine for human-readable order references; not intended or
  needed to be cryptographically unguessable given `allow get: if true`
  already means anyone with the reference can look up that one order (by
  design, so customers can track without an account).
- `updateOrderStatus()` validates the target status against `VALID_STATUSES`
  before writing — can't be set to an arbitrary string.

## Run 4 summary

**Scope:** items 1–2 from Run 3's next-tasks list — accessibility pass across
all pages, and responsive verification.

### Critical fix: stored XSS in admin.html

While auditing form accessibility I traced how `admin.html` renders order
data and found it was writing item names, sizes, and order IDs directly into
`innerHTML` **with no escaping at all**. I confirmed this was actually
reachable, not theoretical: a cart item's name is stored in the customer's
own `localStorage` (`script.js`'s cart normalizer only trims it), and
`firebase-orders.js`'s `cleanText()` only trims/truncates — HTML is never
stripped anywhere in the pipeline before the value reaches Firestore. That
means any customer could edit their own cart's item name via devtools to
include a script/`onerror` payload, place an order, and have it execute with
full privileges the moment an admin opened the dashboard — a stored XSS that
specifically targets the authenticated admin session. This is more severe
than the Run 3 access-control gap, because it doesn't depend on Firestore
rules being misconfigured — it fires the moment `admin.html`'s own render
code runs.

**Fix:** added an `escapeHtml()` helper to `admin.html` and applied it to
every interpolated field in the order-card template (item name, size, qty,
order id, status, formatted date/total). Verified `track-order.html` (the
customer-facing equivalent) already escaped correctly — the gap was
specific to `admin.html`. File changed: `admin.html`.

### Accessibility pass — completed

- **Missing `<h1>` on 6 of 11 pages** (`blog`, `cart`, `contact`, `shop`,
  `sproduct`, `admin`). Rather than retag existing visual headings (risky —
  this codebase styles headings by tag selector, e.g. `#header h2`,
  `.single-pro-details h4`, so renaming would require coordinated CSS
  changes across many rules), added a standard `.sr-only` visually-hidden
  utility class to `style.css` (and inline in `admin.html`, which doesn't
  load `style.css`) and one hidden page-title `<h1>` per page. Zero visual
  change; all 11 pages now have exactly one `<h1>`.
- **~20 form fields with no accessible name** (placeholder-only, no
  `<label>` or `aria-label`) across `contact.html`, `cart.html`,
  `admin.html`, `sproduct.html`, `login.html`, `profile.html`'s avatar file
  input, and the newsletter signup form duplicated across 5 pages. Added
  `aria-label` to all of them, matching an existing correct pattern already
  present on `index.html`'s newsletter form.
- Gave the admin dashboard's per-order status `<select>` a unique
  `aria-label` including the order ID — it's a repeated dynamic control, so
  "status" alone doesn't tell a screen-reader user which order they're on.
- **~15 images with empty `alt=""`** across `shop.html`, `sproduct.html`,
  `blog.html`, `about.html`. Rather than guess, I actually viewed each
  underlying image file and wrote accurate descriptions (e.g. shop/product
  grid images now read "Adidas Campus 00s 'Bliss Lilac'" pulled from the
  adjacent product name text; blog images got real content descriptions
  after visual inspection, e.g. "Aerial view of a giant sneaker placed in a
  busy city street crossing").

### Content/markup bugs found and fixed along the way

- **`contact.html` had a genuinely broken third staff entry**:
  `<img src="" alt="">` for "Imran Maundu" — no image file for this person
  exists in `img/staff/` at all (only `ken.png` and `salim.png` do). Fixed
  using an already-defined-but-completely-unused `.staff-avatar-fallback`
  CSS class (initials badge) that was clearly built for exactly this case
  and never wired up.
- **Found and fixed a real layout bug in the same section**: the CSS
  (`#form-details .staff > div`) expected each staff member wrapped in
  their own `<div>` to lay the avatar next to the name horizontally, but
  the HTML had no such wrapper — img/p/img/p/img/p sat as flat siblings
  directly inside `.staff`, so the intended side-by-side avatar+name layout
  likely never rendered; instead everything would stack in one column.
  Added the wrapper `<div>` per person, which also let the fallback-avatar
  fix above slot in cleanly.
- One malformed tag in `about.html` (`<img ... alt="" / loading="lazy">` —
  a stray `/` in the middle of the attribute list, not at the tag's end).
  Fixed while adding real alt text to the same image.

### Responsive verification — completed as far as this environment allows

**Limitation, stated plainly:** this sandbox has no network access, so I
cannot launch a real/headless browser to render the site (Google Fonts,
Font Awesome, and the Firebase SDKs are all loaded from CDNs that would
fail to load). Everything below is static-analysis verification, not a
visual render at each breakpoint — flagging this rather than claiming a
level of confidence I don't have.

What I checked and confirmed clean:
- **Viewport meta tag**: present and correct (`width=device-width,
  initial-scale=1.0`) on all 11 pages. (My first pass in the previous
  message flagged `login.html`/`profile.html`/`track-order.html` as
  missing it — that was a false alarm caused by a single-line grep pattern
  missing their multi-line-formatted `<meta>` tags; a proper multi-line
  check confirmed all three actually have it.)
- No fixed `width`/`min-width` rules over 360px outside a media query
  anywhere in `style.css` or the inline `<style>` blocks in
  `login.html`/`profile.html`/`admin.html` — nothing statically obvious
  that would force horizontal overflow on a small phone.
- `box-sizing: border-box` applied globally — prevents the classic
  padding/border overflow bug.
- The cart table (`cart.html`) uses fixed pixel column widths totaling
  ~1000px, which would be too wide for a phone — but it's correctly
  wrapped in a container with `overflow-x: auto`, so the table scrolls
  within itself rather than blowing out the whole page. This is the
  standard, accepted pattern for wide tables and matches the brief's actual
  requirement ("no *unintended* horizontal scrolling") — not a bug, though
  a stacked/card layout would be a nicer mobile UX if a future run wants to
  take it on as a polish item.
- 33 `@media` breakpoints across `style.css` spanning 340px–952px, plus
  `prefers-reduced-motion` and `hover: none` handling — a reasonably
  thorough responsive foundation already in place.

**What's still genuinely unverified:** actual visual rendering at each
breakpoint (text overlap, image aspect ratios, modal positioning, nav menu
open/close behavior on a real touch device). Recommend either a manual pass
in real browser dev tools, or a future run with network access enabled so
a headless browser can actually load the CDN assets and render the pages.

## Next recommended tasks (priority order)

1. Real browser-based responsive verification (needs network access in the
   sandbox, or a manual pass) — the one item this run could only partially
   complete.
2. CSS-consolidation cleanup and Font Awesome version unification (Run 1) —
   cosmetic/maintainability, not correctness.
3. Optional UX polish: convert the cart table to a stacked card layout on
   small screens instead of the current (correct, but less elegant)
   horizontal-scroll-within-container approach.

## Regression risk for next run

- `firebase-auth.js` writes to `users/{uid}` instead of `customers/{uid}`
  (Run 2) — re-verify no external tooling/rules still reference `customers`.
- `admin.html` requires an `admins/{uid}` Firestore document to show any
  data (Run 3) — expected, not a regression, until that document + updated
  rules are added in the Firebase Console.
- `firebase-orders.js` no longer exports `customerSignIn`/`customerSignOut`
  (Run 3) — confirmed unused in all shipped pages.
- New `.sr-only` CSS class added to `style.css` and duplicated inline in
  `admin.html` (which doesn't load `style.css`) — if a future run
  consolidates `admin.html`'s inline styles into `style.css`, make sure
  this class comes along and isn't dropped as "duplicate."
- `contact.html`'s staff section markup structure changed (added wrapper
  `<div>`s per person) — re-verify visually once rendering is possible,
  since this was a CSS-selector-driven fix I couldn't visually confirm in
  this environment.
