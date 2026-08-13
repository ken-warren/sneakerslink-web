# SneakersLink

An e-commerce website for a Nairobi-based sneaker store — browse sneakers, view
product details, add items to a cart, and check out via WhatsApp/M-Pesa.

## What's in this version

This is a modernized rebuild of the original static template. No framework or
build step was introduced — it's still plain HTML/CSS/JS by design — but the
site is now fully functional, animated, and free of the markup bugs that were
in the original.

### Fixed
- `script.js` was empty — nothing on the site actually worked. It now powers a
  real cart, forms, and all the interactive bits below.
- Invalid/broken HTML: unclosed `<div>`s on the shop and single-product pages,
  a duplicate `class` attribute in the nav, a duplicate `id="sneakers1"` used
  on two different sections, an empty stray `<div>` in every newsletter block,
  a deprecated `<marquee>` tag, and an `<li>` list that wasn't wrapped in a
  `<ul>`.
- Dead UI: a hidden/unused cart icon in the nav (`#lg-bag`), "Add to cart"
  buttons that linked to `href="#"` and did nothing, and a staff photo with no
  `src` hidden behind a `2px × 2px` CSS bug.
- A confusing login/signup flow where the same button both switched tabs and
  submitted the form (first click looked like nothing happened). Now it's a
  clear tab switcher plus one dedicated submit button.
- Accessibility: meaningful `alt` text on icons/logos/payment badges, lazy
  loading on product/blog imagery, keyboard-operable product cards.

### Added
- **Working cart** — add to cart from any product grid or the product page,
  persisted in `localStorage` so it survives a refresh or page change. Live
  badge count in the nav, quantity/remove controls on the cart page, and a
  **"Checkout via WhatsApp"** button that pre-fills your order as a message.
- **Real order tracking + an admin dashboard.** Checkout creates an order with
  a reference like `SL-AB12CDE`. `track-order.html` lets anyone with that
  reference watch it move through Placed → Confirmed → Packed → Out for
  Delivery → Delivered, updating live with no refresh needed. `admin.html` is
  a sign-in-protected dashboard where you actually set that status per order.
  Both are backed by a free Firebase project you set up yourself — see
  **[SETUP.md](./SETUP.md)**. Until that's done, the site still works end to
  end using a local, per-browser simulation as a fallback.
- **Micro-interactions** — toast notifications, a "fly to cart" animation on
  add-to-cart, product card hover/zoom, button press states, an animated
  WhatsApp floating action button, and a back-to-top button.
- **Scroll-reveal animations** on product cards, feature boxes, banners, and
  blog posts (skipped automatically for people with reduced-motion enabled).
- **Real client-side form validation** on the login/signup page (email
  format, password length/match, inline error states, password visibility
  toggle) and on the contact and newsletter forms — all with friendly toast
  feedback.

### Not included (by design)
The login/signup page still doesn't persist customer accounts anywhere (the
only real backend account is the single admin login used to manage orders),
and "Pay" routes to WhatsApp rather than a real payment gateway. Both would be
natural next steps if this needs to grow from a portfolio/storefront-lite
site into a full production store.

## Structure

```
index.html         Home page
shop.html           Full product grid
sproduct.html       Single product detail page
cart.html           Cart (JS-rendered) + checkout, creates an order
login.html          Customer sign up / sign in (self-contained, own styles)
track-order.html    Customer-facing order status lookup
admin.html          Sign-in protected dashboard to update order status
about.html          About the store
contact.html        Contact form + map
blog.html           Blog listing
style.css           All styling (original rules + a modern enhancements layer)
script.js           Site interactivity (cart, nav, animations, forms, orders)
firebase-config.js  Your Firebase project keys go here (see SETUP.md)
firebase-orders.js  Talks to Firestore/Auth, exposed as window.SLOrders
SETUP.md            Step-by-step guide to connect the cloud database
img/                Product photos, banners, videos, icons
```

## Running it locally

No build step needed — just serve the folder with any static server, e.g.:

```
npx serve .
```

(Open `index.html` directly as a `file://` URL works for browsing the store,
but the order-tracking pages need `http(s)` — see SETUP.md for hosting.)
