/* =========================================================
   SneakersLink — site-wide interactions
   Cart engine (localStorage), nav behaviour, scroll reveal,
   toasts, and small per-page form flows.
   ========================================================= */

(function () {
  "use strict";

  /* ---------- helpers ---------- */
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const money = (n) =>
    "Kes " + Number(n).toLocaleString("en-KE", { maximumFractionDigits: 0 });

  const parsePrice = (text) => {
    const digits = String(text).replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : 0;
  };

  const slugify = (text) =>
    String(text)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  /* =========================================================
     TOAST NOTIFICATIONS
     ========================================================= */
  function ensureToastRoot() {
    let root = $("#toastRoot");
    if (!root) {
      root = document.createElement("div");
      root.id = "toastRoot";
      root.className = "toast-root";
      document.body.appendChild(root);
    }
    return root;
  }

  function showToast(message, opts = {}) {
    const root = ensureToastRoot();
    const toast = document.createElement("div");
    toast.className = "toast" + (opts.type ? ` toast--${opts.type}` : "");
    toast.innerHTML = `<i class="fas fa-check-circle"></i><span>${message}</span>`;
    root.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("toast--show"));

    setTimeout(() => {
      toast.classList.remove("toast--show");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, 2600);
  }

  /* =========================================================
     CART ENGINE (shared across every page via localStorage)
     ========================================================= */
  const CART_KEY = "sl_cart_v1";

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadges();
  }

  function addToCart(item) {
    const cart = getCart();
    const existing = cart.find((p) => p.id === item.id && p.size === item.size);
    if (existing) {
      existing.qty += item.qty || 1;
    } else {
      cart.push({ ...item, qty: item.qty || 1 });
    }
    saveCart(cart);
    renderCartPage();
  }

  function removeFromCart(id, size) {
    let cart = getCart();
    cart = cart.filter((p) => !(p.id === id && p.size === size));
    saveCart(cart);
    renderCartPage();
  }

  function setQty(id, size, qty) {
    const cart = getCart();
    const item = cart.find((p) => p.id === id && p.size === size);
    if (item) item.qty = Math.max(1, Math.min(20, qty | 0));
    saveCart(cart);
    renderCartPage();
  }

  function cartCount() {
    return getCart().reduce((sum, p) => sum + p.qty, 0);
  }

  function cartTotal() {
    return getCart().reduce((sum, p) => sum + p.qty * p.price, 0);
  }

  function updateCartBadges() {
    const count = cartCount();
    $$("[data-cart-count]").forEach((el) => {
      el.textContent = count;
      el.classList.toggle("cart-count--visible", count > 0);
      el.classList.add("cart-count--bump");
      setTimeout(() => el.classList.remove("cart-count--bump"), 260);
    });
  }

  /* ---------- fly-to-cart micro animation ---------- */
  function flyToCart(sourceImg) {
    const cartIcon = $(".cart");
    if (!sourceImg || !cartIcon) return;

    const start = sourceImg.getBoundingClientRect();
    const end = cartIcon.getBoundingClientRect();

    const clone = sourceImg.cloneNode(true);
    clone.className = "fly-clone";
    clone.style.width = start.width + "px";
    clone.style.height = start.height + "px";
    clone.style.left = start.left + "px";
    clone.style.top = start.top + "px";
    document.body.appendChild(clone);

    requestAnimationFrame(() => {
      clone.style.left = end.left + "px";
      clone.style.top = end.top + "px";
      clone.style.width = "16px";
      clone.style.height = "16px";
      clone.style.opacity = "0.3";
      clone.style.transform = "rotate(20deg)";
    });

    clone.addEventListener("transitionend", () => clone.remove(), { once: true });
    setTimeout(() => clone.remove(), 900);
  }

  /* ---------- wire "add to cart" buttons on product-grid cards ---------- */
  function wireAddToCartButtons() {
    $$(".add-cart-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const card = btn.closest(".pro");
        if (!card) return;

        const nameEl = card.querySelector(".des h5");
        const priceEl = card.querySelector(".des h4");
        const imgEl = card.querySelector("img");
        if (!nameEl || !priceEl || !imgEl) return;

        const name = nameEl.textContent.trim();
        const price = parsePrice(priceEl.textContent);
        const img = imgEl.getAttribute("src");

        addToCart({ id: slugify(name), name, price, img, size: "" });
        showToast(`${name} added to cart`);
        flyToCart(imgEl);

        btn.classList.add("add-cart-btn--pop");
        setTimeout(() => btn.classList.remove("add-cart-btn--pop"), 260);
      });
    });
  }

  /* ---------- make whole product cards (with data-href) clickable ---------- */
  function wireProductCardNavigation() {
    $$(".pro[data-href]").forEach((card) => {
      card.style.cursor = "pointer";
      card.addEventListener("click", (e) => {
        if (e.target.closest(".add-cart-btn")) return;
        window.location.href = card.dataset.href;
      });
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "link");
      card.addEventListener("keypress", (e) => {
        if (e.key === "Enter") window.location.href = card.dataset.href;
      });
    });
  }

  /* ---------- single-product page (sproduct.html) ---------- */
  function wireSingleProductPage() {
    const btn = $("#mainAddToCart");
    if (!btn) return;

    const nameEl = $(".single-pro-details h4");
    const priceEl = $(".single-pro-details h2");
    const imgEl = $("#mainImg");
    const sizeEl = $("#sizeSelect");
    const qtyEl = $("#qtyInput");

    btn.addEventListener("click", () => {
      if (sizeEl && (sizeEl.value === "" || sizeEl.selectedIndex === 0)) {
        sizeEl.classList.add("field-error");
        showToast("Please select a size first", { type: "warn" });
        sizeEl.focus();
        setTimeout(() => sizeEl.classList.remove("field-error"), 900);
        return;
      }

      const name = nameEl ? nameEl.textContent.trim() : "Product";
      const price = priceEl ? parsePrice(priceEl.textContent) : 0;
      const img = imgEl ? imgEl.getAttribute("src") : "";
      const size = sizeEl ? sizeEl.value : "";
      const qty = qtyEl ? Math.max(1, parseInt(qtyEl.value, 10) || 1) : 1;

      addToCart({ id: slugify(name), name, price, img, size, qty });
      showToast(`${name} (Size ${size}) added to cart`);
      if (imgEl) flyToCart(imgEl);
    });
  }

  /* =========================================================
     CART PAGE RENDERING (cart.html)
     ========================================================= */
  function renderCartPage() {
    const body = $("#cartBody");
    if (!body) return; // not on cart.html

    const cart = getCart();
    const emptyMsg = $("#emptyCartMsg");
    const table = body.closest("table");

    if (cart.length === 0) {
      body.innerHTML = "";
      if (table) table.style.display = "none";
      if (emptyMsg) emptyMsg.hidden = false;
    } else {
      if (table) table.style.display = "";
      if (emptyMsg) emptyMsg.hidden = true;

      body.innerHTML = cart
        .map(
          (item) => `
        <tr data-id="${item.id}" data-size="${item.size || ""}">
          <td><button type="button" class="remove-item" aria-label="Remove ${item.name}"><i class="fas fa-times-circle"></i></button></td>
          <td><img src="${item.img}" alt="${item.name}"></td>
          <td>${item.name}${item.size ? ` <small>(Size ${item.size})</small>` : ""}</td>
          <td>${money(item.price)}</td>
          <td><input type="number" min="1" max="20" value="${item.qty}" class="qty-input"></td>
          <td>${money(item.price * item.qty)}</td>
        </tr>`
        )
        .join("");
    }

    const subtotal = cartTotal();
    const subtotalEl = $("#cartSubtotal");
    const totalEl = $("#cartTotal");
    if (subtotalEl) subtotalEl.textContent = money(subtotal);
    if (totalEl) totalEl.textContent = money(subtotal);
  }

  function wireCartPageEvents() {
    const body = $("#cartBody");
    if (!body) return;

    body.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".remove-item");
      if (!removeBtn) return;
      const row = removeBtn.closest("tr");
      row.classList.add("row-removing");
      setTimeout(() => {
        removeFromCart(row.dataset.id, row.dataset.size);
        showToast("Item removed from cart");
      }, 180);
    });

    body.addEventListener("change", (e) => {
      if (!e.target.classList.contains("qty-input")) return;
      const row = e.target.closest("tr");
      setQty(row.dataset.id, row.dataset.size, parseInt(e.target.value, 10) || 1);
    });

    const couponBtn = $("#applyCouponBtn");
    if (couponBtn) {
      couponBtn.addEventListener("click", () => {
        const input = $("#couponInput");
        const msg = $("#couponMsg");
        if (!input || !input.value.trim()) {
          if (msg) msg.textContent = "Enter a coupon code first.";
          return;
        }
        if (msg) {
          msg.textContent = "This code isn't valid right now — DM us on WhatsApp for current offers!";
        }
      });
    }

    const checkoutBtn = $("#checkoutBtn");
    if (checkoutBtn) {
      checkoutBtn.addEventListener("click", () => {
        const cart = getCart();
        if (cart.length === 0) {
          showToast("Your cart is empty", { type: "warn" });
          return;
        }
        const lines = cart
          .map((i) => `- ${i.name}${i.size ? ` (Size ${i.size})` : ""} x${i.qty} — ${money(i.price * i.qty)}`)
          .join("\n");
        const message = `Hi SneakersLink! I'd like to order:\n${lines}\n\nTotal: ${money(cartTotal())}`;
        window.open("https://wa.me/254768372955?text=" + encodeURIComponent(message), "_blank");
      });
    }
  }

  /* =========================================================
     NAVIGATION — mobile menu, scroll shrink, active-link close
     ========================================================= */
  function wireNav() {
    const nav = $("nav");
    const check = $("#check");
    const navLinks = $$("#navbar a");

    if (nav) {
      const onScroll = () => nav.classList.toggle("nav--scrolled", window.scrollY > 40);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    if (check) {
      navLinks.forEach((link) =>
        link.addEventListener("click", () => {
          check.checked = false;
        })
      );
    }
  }

  /* =========================================================
     BACK TO TOP
     ========================================================= */
  function wireBackToTop() {
    const btn = $("#backToTop");
    if (!btn) return;
    const toggle = () => btn.classList.toggle("back-to-top--visible", window.scrollY > 500);
    toggle();
    window.addEventListener("scroll", toggle, { passive: true });
    btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  /* =========================================================
     SCROLL-REVEAL ANIMATIONS
     ========================================================= */
  function wireScrollReveal() {
    const targets = $$(
      ".pro, .ft-box, .banner-box, .blog-box, section#header, section#feature, section#sneakers1 > h2, .staff, #contact-details, #form-details"
    );
    if (!("IntersectionObserver" in window) || targets.length === 0) {
      targets.forEach((t) => t.classList.add("reveal--in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal--in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    targets.forEach((t) => {
      t.classList.add("reveal");
      io.observe(t);
    });
  }

  /* =========================================================
     NEWSLETTER + CONTACT FORM (front-end only, no backend)
     ========================================================= */
  function wireNewsletterForm() {
    const form = $("#newsletterForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input[type='email']");
      if (!input || !input.checkValidity()) {
        showToast("Please enter a valid email address", { type: "warn" });
        input && input.focus();
        return;
      }
      showToast("You're subscribed! Watch your inbox for drops 🔥");
      form.reset();
    });
  }

  function wireContactForm() {
    const form = $("#contactForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        showToast("Please fill in every field before sending", { type: "warn" });
        return;
      }
      showToast("Message sent! We'll get back to you soon.");
      form.reset();
    });
  }

  /* =========================================================
     INIT
     ========================================================= */
  document.addEventListener("DOMContentLoaded", () => {
    wireNav();
    wireBackToTop();
    wireAddToCartButtons();
    wireProductCardNavigation();
    wireSingleProductPage();
    wireCartPageEvents();
    wireNewsletterForm();
    wireContactForm();
    renderCartPage();
    updateCartBadges();
    wireScrollReveal();
  });
})();
