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
- Accessibility: meaningful `alt` text on icons/logos/payment badges, lazy
  loading on product/blog imagery, keyboard-operable product cards.

### Added
- **Working cart** — add to cart from any product grid or the product page,
  persisted in `localStorage` so it survives a refresh or page change. Live
  badge count in the nav, quantity/remove controls on the cart page, and a
  **"Checkout via WhatsApp"** button that pre-fills your order as a message.
- **Micro-interactions** — toast notifications, a "fly to cart" animation on
  add-to-cart, product card hover/zoom, button press states, an animated
  WhatsApp floating action button, and a back-to-top button.
- **Scroll-reveal animations** on product cards, feature boxes, banners, and
  blog posts (skipped automatically for people with reduced-motion enabled).
- **Real client-side form validation** on the login/signup page (email
  format, password length/match, inline error states) and on the contact and
  newsletter forms — all with friendly toast feedback, since there's no
  backend wired up yet.

### Not included (by design)
There's still no backend — the login/signup page validates and simulates a
successful sign-in but doesn't persist accounts, and the "Pay" flow routes to
WhatsApp rather than a real payment gateway. Hooking this up to real auth,
inventory, and M-Pesa/Stripe would be the natural next step if this needs to
go from a portfolio/storefront-lite site to a full production store.

## Structure

```
index.html       Home page
shop.html        Full product grid
sproduct.html    Single product detail page
cart.html        Cart (JS-rendered from localStorage)
login.html       Sign up / sign in (self-contained, own inline styles)
about.html       About the store
contact.html     Contact form + map
blog.html        Blog listing
style.css        All styling (original rules + a modern enhancements layer)
script.js        All site interactivity (cart, nav, animations, forms)
img/             Product photos, banners, videos, icons
```

## Running it locally

No build step needed — just open `index.html` in a browser, or serve the
folder with any static server, e.g.:

```
npx serve .
```
