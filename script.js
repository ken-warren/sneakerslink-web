/* =========================================================
   SneakersLink — production storefront interactions
   ========================================================= */
(() => {
  "use strict";

  const STORAGE_KEY = "sneakerslink_cart";
  const THEME_KEY = "sl_theme";
  const COUPON_KEY = "sl_coupon";
  const RECENT_ORDERS_KEY = "sl_recent_orders";
  const LOCAL_ORDERS_KEY = "sl_local_orders";
  const WHATSAPP_NUMBER = "254768372955";
  const MAX_QTY = 99;

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

  const money = (value) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);

  const parsePrice = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (!value) return 0;

    const cleaned = String(value)
      .replace(/KES|KSh|Kes/gi, "")
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "");

    return Number(cleaned) || 0;
  };

  const safeStorageGet = (key, fallback = null) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  };

  const safeStorageSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };

  const safeStorageRemove = (key) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const normaliseId = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  function normaliseCartItem(item) {
    if (!item || !item.id) return null;

    return {
      id: String(item.id),
      name: String(item.name || "Sneaker").trim(),
      brand: String(item.brand || "").trim(),
      price: Math.max(0, Number(item.price) || 0),
      image: String(item.image || ""),
      quantity: Math.min(
        MAX_QTY,
        Math.max(
          1,
          Math.floor(
            Number(item.quantity) || 1
          )
        )
      ),
      size: item.size ? String(item.size) : "",
    };
  }

  function getCart() {
    const raw = safeStorageGet(
      STORAGE_KEY,
      "[]"
    );

    try {
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map(normaliseCartItem)
        .filter(Boolean);
    } catch {
      safeStorageRemove(STORAGE_KEY);
      return [];
    }
  }

  function emitCartUpdate(cart) {
    window.dispatchEvent(
      new CustomEvent(
        "sneakerslink:cart-updated",
        {
          detail: {
            cart: [...cart],
          },
        }
      )
    );
  }

  function saveCart(cart) {
    const clean = cart
      .map(normaliseCartItem)
      .filter(Boolean);

    safeStorageSet(
      STORAGE_KEY,
      JSON.stringify(clean)
    );

    updateCartBadge();
    emitCartUpdate(clean);
  }

  function getCartCount() {
    return getCart().reduce(
      (sum, item) =>
        sum + item.quantity,
      0
    );
  }

  function getCartSubtotal() {
    return getCart().reduce(
      (sum, item) =>
        sum +
        item.price *
          item.quantity,
      0
    );
  }

  function getCoupon() {
    try {
      const coupon = JSON.parse(
        safeStorageGet(
          COUPON_KEY,
          "null"
        )
      );

      return coupon?.code ===
        "SL500" &&
        Number(coupon.discount) > 0
        ? {
            code: "SL500",
            discount: 500,
          }
        : null;
    } catch {
      return null;
    }
  }

  function getTotals() {
    const subtotal =
      getCartSubtotal();

    const coupon =
      getCoupon();

    const discount = Math.min(
      subtotal,
      coupon?.discount || 0
    );

    return {
      subtotal,
      discount,
      total: Math.max(
        0,
        subtotal - discount
      ),
      coupon,
      shipping: 0,
    };
  }

  function updateCartBadge(
    bump = false
  ) {
    const count =
      getCartCount();

    $$(
      "[data-cart-count], .cart-count"
    ).forEach((badge) => {
      badge.textContent =
        count > 99
          ? "99+"
          : String(count);

      badge.classList.toggle(
        "cart-count--visible",
        count > 0
      );

      if (bump) {
        badge.classList.remove(
          "cart-count--bump"
        );

        void badge.offsetWidth;

        badge.classList.add(
          "cart-count--bump"
        );

        window.setTimeout(
          () =>
            badge.classList.remove(
              "cart-count--bump"
            ),
          350
        );
      }
    });
  }

  function getProductFromCard(
    card
  ) {
    if (!card) return null;

    const image = $("img", card);

    const brand =
      card.dataset.brand ||
      $(".des span", card)
        ?.textContent?.trim() ||
      "";

    const name =
      card.dataset.name ||
      $(".des h5", card)
        ?.textContent?.trim() ||
      "Sneaker";

    const price =
      parsePrice(
        card.dataset.price
      ) ||
      parsePrice(
        $(".des h4", card)
          ?.textContent
      );

    const imageSrc =
      image?.getAttribute(
        "src"
      ) ||
      image?.src ||
      "";

    const id =
      card.dataset.productId ||
      card.dataset.id ||
      normaliseId(
        `${brand}-${name}`
      );

    return normaliseCartItem({
      id,
      name,
      brand,
      price,
      image: imageSrc,
      quantity: 1,
      size:
        card.dataset.size ||
        "",
    });
  }

  function addToCart(
    product,
    sourceElement = null
  ) {
    const cleanProduct =
      normaliseCartItem(
        product
      );

    if (!cleanProduct) {
      return;
    }

    const cart =
      getCart();

    const existing =
      cart.find(
        (item) =>
          item.id ===
            cleanProduct.id &&
          item.size ===
            cleanProduct.size
      );

    if (existing) {
      existing.quantity =
        Math.min(
          MAX_QTY,
          existing.quantity +
            cleanProduct.quantity
        );
    } else {
      cart.push(
        cleanProduct
      );
    }

    saveCart(cart);
    updateCartBadge(true);

    if (sourceElement) {
      sourceElement.classList.remove(
        "add-cart-btn--pop"
      );

      void sourceElement.offsetWidth;

      sourceElement.classList.add(
        "add-cart-btn--pop"
      );

      window.setTimeout(
        () =>
          sourceElement.classList.remove(
            "add-cart-btn--pop"
          ),
        350
      );

      flyToCart(
        sourceElement
      );
    }

    showToast(
      `${cleanProduct.name} added to your cart.`
    );
  }

  function flyToCart(
    sourceElement
  ) {
    const image =
      sourceElement
        ?.closest(".pro")
        ?.querySelector("img");

    const cartIcon =
      $(
        ".cart[href='cart.html'], .cart, [data-cart-count]"
      )?.closest("a") ||
      $(".cart");

    if (!image || !cartIcon) {
      return;
    }

    const imageRect =
      image.getBoundingClientRect();

    const cartRect =
      cartIcon.getBoundingClientRect();

    const clone =
      image.cloneNode(true);

    clone.className =
      "fly-clone";

    Object.assign(
      clone.style,
      {
        left:
          `${imageRect.left}px`,
        top:
          `${imageRect.top}px`,
        width:
          `${imageRect.width}px`,
        height:
          `${imageRect.height}px`,
        opacity: "0.9",
      }
    );

    document.body.appendChild(
      clone
    );

    requestAnimationFrame(
      () => {
        Object.assign(
          clone.style,
          {
            left:
              `${
                cartRect.left +
                cartRect.width /
                  2
              }px`,
            top:
              `${
                cartRect.top +
                cartRect.height /
                  2
              }px`,
            width: "24px",
            height: "24px",
            opacity: "0.15",
            transform:
              "scale(.6)",
          }
        );
      }
    );

    window.setTimeout(
      () => clone.remove(),
      850
    );
  }

  function initProductCards() {
    $$(".pro").forEach(
      (card, index) => {
        card.style.setProperty(
          "--i",
          index
        );

        const addButton =
          $(".add-cart-btn", card);

        if (addButton) {
          addButton.addEventListener(
            "click",
            (event) => {
              event.preventDefault();
              event.stopPropagation();

              addToCart(
                getProductFromCard(
                  card
                ),
                addButton
              );
            }
          );
        }

        const href =
          card.dataset.href ||
          card.dataset.url;

        if (href) {
          card.setAttribute(
            "tabindex",
            "0"
          );

          card.setAttribute(
            "role",
            "link"
          );

          card.addEventListener(
            "click",
            (event) => {
              if (
                event.target.closest(
                  "button,a,input,select"
                )
              ) {
                return;
              }

              window.location.href =
                href;
            }
          );

          card.addEventListener(
            "keydown",
            (event) => {
              if (
                (
                  event.key ===
                    "Enter" ||
                  event.key ===
                    " "
                ) &&
                !event.target.closest(
                  "button,a,input,select"
                )
              ) {
                event.preventDefault();
                window.location.href =
                  href;
              }
            }
          );
        }
      }
    );
  }

  function renderCartPage() {
    const table =
      $("#cart table") ||
      $("#cartTable");

    const tbody =
      $("#cart tbody") ||
      $("#cart table tbody");

    if (!table || !tbody) {
      return;
    }

    const cart =
      getCart();

    tbody.innerHTML = "";

    const emptyMessage =
      $("#emptyCartMsg");

    if (!cart.length) {
      table.classList.add(
        "cart-table--empty"
      );

      if (emptyMessage) {
        emptyMessage.hidden =
          false;
      }

      const row =
        document.createElement(
          "tr"
        );

      row.innerHTML = `
        <td colspan="6">
          <div class="empty-cart-msg">
            <p>Your cart is currently empty.</p>
            <a href="shop.html">Continue shopping →</a>
          </div>
        </td>`;

      tbody.appendChild(row);

      updateCartTotals();

      return;
    }

    table.classList.remove(
      "cart-table--empty"
    );

    if (emptyMessage) {
      emptyMessage.hidden =
        true;
    }

    cart.forEach(
      (item) => {
        const row =
          document.createElement(
            "tr"
          );

        row.dataset.cartId =
          item.id;

        row.dataset.cartSize =
          item.size;

        row.innerHTML = `
        <td>
          <button type="button"
            class="remove-item"
            data-remove-item="${escapeHtml(item.id)}"
            data-remove-size="${escapeHtml(item.size)}"
            aria-label="Remove ${escapeHtml(item.name)}">
            <i class="far fa-times-circle"
               aria-hidden="true"></i>
          </button>
        </td>

        <td>
          <img
            src="${escapeHtml(item.image)}"
            alt="${escapeHtml(item.name)}"
            loading="lazy">
        </td>

        <td>
          <strong>
            ${escapeHtml(item.name)}
          </strong>

          ${
            item.brand
              ? `<small class="cart-item-brand">
                  ${escapeHtml(item.brand)}
                </small>`
              : ""
          }

          ${
            item.size
              ? `<small class="cart-item-size">
                  Size: ${escapeHtml(item.size)}
                </small>`
              : ""
          }
        </td>

        <td>
          ${money(item.price)}
        </td>

        <td>
          <input
            type="number"
            min="1"
            max="${MAX_QTY}"
            value="${item.quantity}"
            class="cart-qty"
            data-cart-qty="${escapeHtml(item.id)}"
            data-cart-size="${escapeHtml(item.size)}"
            inputmode="numeric"
            aria-label="Quantity for ${escapeHtml(item.name)}">
        </td>

        <td>
          ${money(
            item.price *
              item.quantity
          )}
        </td>`;

        tbody.appendChild(row);
      }
    );

    updateCartTotals();
  }

  function updateCartTotals() {
    const totals =
      getTotals();

    const setMoney = (
      selectors,
      value
    ) => {
      const el =
        selectors
          .map(
            (selector) =>
              $(selector)
          )
          .find(Boolean);

      if (el) {
        el.textContent =
          money(value);
      }
    };

    setMoney(
      [
        "#cartSubtotal",
        "#subtotal-value",
        "#subtotal .subtotal-value",
        "[data-cart-subtotal]",
      ],
      totals.subtotal
    );

    setMoney(
      [
        "#cartTotal",
        "#cart-total",
        "#total-value",
        "[data-cart-total]",
      ],
      totals.total
    );

    $$(
      "[data-subtotal]"
    ).forEach(
      (el) =>
        (el.textContent =
          money(
            totals.subtotal
          ))
    );

    $$(
      "[data-discount]"
    ).forEach(
      (el) =>
        (el.textContent =
          `−${money(
            totals.discount
          )}`)
    );

    $$(
      "[data-total]"
    ).forEach(
      (el) =>
        (el.textContent =
          money(
            totals.total
          ))
    );

    const discountRow =
      $("#discountRow");

    if (discountRow) {
      discountRow.hidden =
        totals.discount <=
        0;
    }

    const couponMsg =
      $("#couponMsg");

    if (
      couponMsg &&
      totals.coupon
    ) {
      couponMsg.textContent =
        `${totals.coupon.code} applied — ${money(
          totals.discount
        )} discount.`;
    }

    updateCartBadge();
  }

  function updateCartQuantity(
    id,
    size,
    quantity
  ) {
    const cart =
      getCart();

    const item =
      cart.find(
        (product) =>
          product.id === id &&
          String(
            product.size || ""
          ) ===
            String(
              size || ""
            )
      );

    if (!item) {
      return;
    }

    const parsed =
      Number.parseInt(
        quantity,
        10
      );

    item.quantity =
      Number.isFinite(
        parsed
      )
        ? Math.min(
            MAX_QTY,
            Math.max(
              1,
              parsed
            )
          )
        : 1;

    saveCart(cart);
    renderCartPage();
  }

  function removeCartItem(
    id,
    size,
    sourceElement = null
  ) {
    const cart =
      getCart();

    const item =
      cart.find(
        (product) =>
          product.id === id &&
          String(
            product.size || ""
          ) ===
            String(
              size || ""
            )
      );

    if (!item) {
      return;
    }

    const remove = () => {
      saveCart(
        cart.filter(
          (product) =>
            !(
              product.id ===
                id &&
              String(
                product.size || ""
              ) ===
                String(
                  size || ""
                )
            )
        )
      );

      renderCartPage();

      showToast(
        `${item.name} removed from your cart.`,
        "warn"
      );
    };

    const row =
      sourceElement?.closest(
        "tr"
      );

    if (row) {
      row.classList.add(
        "row-removing"
      );

      window.setTimeout(
        remove,
        220
      );
    } else {
      remove();
    }
  }

  function initCartEvents() {
    document.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            "[data-remove-item]"
          );

        if (!button) {
          return;
        }

        event.preventDefault();

        removeCartItem(
          button.dataset
            .removeItem,
          button.dataset
            .removeSize ||
            "",
          button
        );
      }
    );

    document.addEventListener(
      "change",
      (event) => {
        const input =
          event.target.closest(
            "[data-cart-qty]"
          );

        if (!input) {
          return;
        }

        updateCartQuantity(
          input.dataset
            .cartQty,
          input.dataset
            .cartSize ||
            "",
          input.value
        );
      }
    );
  }

  function applyCoupon() {
    const input =
      $("#couponInput") ||
      $("#coupon input");

    const button =
      $("#applyCouponBtn") ||
      $("#coupon button");

    if (!input || !button) {
      return;
    }

    const code =
      input.value
        .trim()
        .toUpperCase();

    if (!code) {
      showToast(
        "Enter a coupon code.",
        "warn"
      );

      input.focus();

      return;
    }

    if (code !== "SL500") {
      safeStorageRemove(
        COUPON_KEY
      );

      updateCouponTotalsAndMessage(
        "That coupon code is not valid.",
        true
      );

      return;
    }

    if (
      getCartSubtotal() <
      2000
    ) {
      showToast(
        "SL500 requires a cart subtotal of at least KES 2,000.",
        "warn"
      );

      return;
    }

    safeStorageSet(
      COUPON_KEY,
      JSON.stringify({
        code: "SL500",
        discount: 500,
      })
    );

    updateCouponTotalsAndMessage(
      "SL500 applied — KES 500 discount."
    );

    showToast(
      "Coupon applied."
    );
  }

  function updateCouponTotalsAndMessage(
    message,
    warning = false
  ) {
    const msg =
      $("#couponMsg") ||
      $(
        ".coupon-msg",
        $("#coupon") ||
          document
      );

    if (msg) {
      msg.textContent =
        message;
    }

    if (warning) {
      showToast(
        message,
        "warn"
      );
    }

    updateCartTotals();
  }

  function initCoupon() {
    const button =
      $("#applyCouponBtn") ||
      $("#coupon button");

    button?.addEventListener(
      "click",
      applyCoupon
    );

    const input =
      $("#couponInput") ||
      $("#coupon input");

    input?.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key ===
          "Enter"
        ) {
          event.preventDefault();
          applyCoupon();
        }
      }
    );
  }

  function getPreferredTheme() {
    const saved =
      safeStorageGet(
        THEME_KEY
      );

    if (
      saved === "dark" ||
      saved === "light"
    ) {
      return saved;
    }

    return window
      .matchMedia?.(
        "(prefers-color-scheme: dark)"
      ).matches
      ? "dark"
      : "light";
  }

  function applyTheme(
    theme,
    persist = true
  ) {
    const safeTheme =
      theme === "dark"
        ? "dark"
        : "light";

    document.documentElement.setAttribute(
      "data-theme",
      safeTheme
    );

    if (persist) {
      safeStorageSet(
        THEME_KEY,
        safeTheme
      );
    }

    const toggle =
      $("#themeToggle");

    if (toggle) {
      const dark =
        safeTheme ===
        "dark";

      toggle.setAttribute(
        "aria-label",
        dark
          ? "Switch to light mode"
          : "Switch to dark mode"
      );

      toggle.setAttribute(
        "title",
        dark
          ? "Switch to light mode"
          : "Switch to dark mode"
      );
    }
  }

  function initTheme() {
    applyTheme(
      document.documentElement.getAttribute(
        "data-theme"
      ) ||
        getPreferredTheme(),
      false
    );

    $("#themeToggle")?.addEventListener(
      "click",
      () => {
        const next =
          document.documentElement.getAttribute(
            "data-theme"
          ) ===
          "dark"
            ? "light"
            : "dark";

        applyTheme(next);

        showToast(
          next === "dark"
            ? "Dark mode enabled."
            : "Light mode enabled."
        );
      }
    );
  }

  function initAccountMenu() {
    const guestLinks = $("#accountGuestLinks");
    const menu = $("#accountMenu");
    const toggleBtn = $("#accountToggle");
    const dropdown = $("#accountDropdown");
    const emailEl = $("#accountDropdownEmail");
    const signOutBtn = $("#accountSignOutBtn");
    const inlineThemeBtn = $("#accountThemeToggle");
    const inlineThemeLabel = $("#accountThemeLabel");

    if (!guestLinks && !menu) return; // page has no account area

    function setLoggedInView(user) {
      if (guestLinks) guestLinks.hidden = true;
      if (menu) menu.hidden = false;
      if (emailEl) {
        emailEl.textContent =
          (user && (user.email || user.displayName)) || "Signed in";
      }
    }

    function setLoggedOutView() {
      if (guestLinks) guestLinks.hidden = false;
      if (menu) menu.hidden = true;
      closeDropdown();
    }

    function openDropdown() {
      dropdown?.classList.add("is-open");
      toggleBtn?.classList.add("is-open");
      toggleBtn?.setAttribute("aria-expanded", "true");
    }

    function closeDropdown() {
      dropdown?.classList.remove("is-open");
      toggleBtn?.classList.remove("is-open");
      toggleBtn?.setAttribute("aria-expanded", "false");
    }

    toggleBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown?.classList.contains("is-open") ? closeDropdown() : openDropdown();
    });

    document.addEventListener("click", (e) => {
      if (menu && !menu.hidden && !menu.contains(e.target)) closeDropdown();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDropdown();
    });

    signOutBtn?.addEventListener("click", async () => {
      try {
        if (window.SLAuth?.logout) await window.SLAuth.logout();
        showToast("Signed out.");
      } catch (error) {
        console.error("Sign out failed:", error);
        showToast("Couldn't sign out — please try again.", "warn");
      }
      closeDropdown();
    });

    if (inlineThemeBtn) {
      const syncLabel = () => {
        const isDark =
          document.documentElement.getAttribute("data-theme") === "dark";
        if (inlineThemeLabel)
          inlineThemeLabel.textContent = isDark ? "Light Mode" : "Dark Mode";
      };
      syncLabel();
      inlineThemeBtn.addEventListener("click", () => {
        const next =
          document.documentElement.getAttribute("data-theme") === "dark"
            ? "light"
            : "dark";
        applyTheme(next);
        syncLabel();
        closeDropdown();
      });
    }

    // React to auth state as soon as it's known. firebase-auth.js is a
    // deferred module, so window.SLAuth may not exist the instant
    // DOMContentLoaded fires — listen for its ready event as a fallback.
    function wireAuthState() {
      if (!window.SLAuth) return false;
      window.SLAuth.onAuthStateChanged((user) => {
        if (user) setLoggedInView(user);
        else setLoggedOutView();
      });
      return true;
    }

    if (!wireAuthState()) {
      window.addEventListener("slauth:ready", wireAuthState, { once: true });
    }
  }

  function initMobileNavigation() {
    const check =
      $("#check");

    const navbar =
      $("#navbar");

    if (!check || !navbar) {
      return;
    }

    const button =
      $(".navbutton");

    button?.setAttribute(
      "aria-controls",
      "navbar"
    );

    button?.setAttribute(
      "aria-expanded",
      "false"
    );

    $$("#navbar a").forEach(
      (link) =>
        link.addEventListener(
          "click",
          () => {
            check.checked =
              false;

            button?.setAttribute(
              "aria-expanded",
              "false"
            );
          }
        )
    );

    check.addEventListener(
      "change",
      () => {
        button?.setAttribute(
          "aria-expanded",
          String(
            check.checked
          )
        );
      }
    );

    document.addEventListener(
      "click",
      (event) => {
        if (
          check.checked &&
          !event.target.closest(
            "nav"
          )
        ) {
          check.checked =
            false;

          button?.setAttribute(
            "aria-expanded",
            "false"
          );
        }
      }
    );
  }

  function initActiveNavigation() {
    const current =
      (
        window.location
          .pathname
          .split("/")
          .pop() ||
        "index.html"
      ).toLowerCase();

    $$("#navbar a").forEach(
      (link) => {
        const page =
          (
            link
              .getAttribute(
                "href"
              ) ||
            ""
          )
            .split("#")[0]
            .split("/")
            .pop()
            .toLowerCase();

        link.classList.toggle(
          "active",
          page ===
            current
        );
      }
    );
  }

  function initNavbarScroll() {
    const nav =
      $("nav");

    if (!nav) {
      return;
    }

    const update =
      () =>
        nav.classList.toggle(
          "nav--scrolled",
          window.scrollY >
            20
        );

    update();

    window.addEventListener(
      "scroll",
      update,
      {
        passive: true,
      }
    );
  }

  function initScrollReveal() {
    $$(
      ".pro-container .pro, #feature .ft-box, #banner, #sm-banner .banner-box, #banner3 .banner-box, #newsletter"
    ).forEach(
      (el) =>
        el.classList.add(
          "reveal"
        )
    );

    const elements =
      $$(".reveal");

    if (
      !(
        "IntersectionObserver" in
        window
      )
    ) {
      elements.forEach(
        (el) =>
          el.classList.add(
            "reveal--in"
          )
      );

      return;
    }

    const observer =
      new IntersectionObserver(
        (entries, obs) => {
          entries.forEach(
            (entry) => {
              if (
                !entry.isIntersecting
              ) {
                return;
              }

              entry.target.classList.add(
                "reveal--in"
              );

              obs.unobserve(
                entry.target
              );
            }
          );
        },
        {
          threshold: 0.08,
          rootMargin:
            "0px 0px -30px 0px",
        }
      );

    elements.forEach(
      (el) =>
        observer.observe(el)
    );
  }

  function ensureToastRoot() {
    let root =
      $(".toast-root") ||
      $("#toast-root");

    if (root) {
      return root;
    }

    root =
      document.createElement(
        "div"
      );

    root.className =
      "toast-root";

    root.setAttribute(
      "aria-live",
      "polite"
    );

    root.setAttribute(
      "aria-atomic",
      "true"
    );

    document.body.appendChild(
      root
    );

    return root;
  }

  function showToast(
    message,
    type = "success",
    duration = 3200
  ) {
    if (!message) {
      return;
    }

    const root =
      ensureToastRoot();

    const toast =
      document.createElement(
        "div"
      );

    toast.className =
      `toast${
        type === "warn"
          ? " toast--warn"
          : ""
      }`;

    toast.innerHTML = `
      <i class="fas ${
        type === "warn"
          ? "fa-exclamation-circle"
          : "fa-check-circle"
      }"
         aria-hidden="true"></i>
      <span>
        ${escapeHtml(message)}
      </span>`;

    root.appendChild(
      toast
    );

    requestAnimationFrame(
      () =>
        toast.classList.add(
          "toast--show"
        )
    );

    window.setTimeout(
      () => {
        toast.classList.remove(
          "toast--show"
        );

        window.setTimeout(
          () =>
            toast.remove(),
          350
        );
      },
      duration
    );
  }

  function initBackToTop() {
    const button =
      $("#backToTop");

    if (!button) {
      return;
    }

    const update =
      () =>
        button.classList.toggle(
          "back-to-top--visible",
          window.scrollY >
            450
        );

    update();

    window.addEventListener(
      "scroll",
      update,
      {
        passive: true,
      }
    );

    button.addEventListener(
      "click",
      () =>
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        })
    );
  }

  function initNewsletter() {
    const form =
      $("#newsletterForm");

    if (!form) {
      return;
    }

    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();

        const input =
          $(
            "input[type='email']",
            form
          );

        if (
          !input ||
          !input.checkValidity()
        ) {
          input?.classList.add(
            "field-error"
          );

          showToast(
            "Please enter a valid email address.",
            "warn"
          );

          window.setTimeout(
            () =>
              input?.classList.remove(
                "field-error"
              ),
            500
          );

          return;
        }

        safeStorageSet(
          "sl_newsletter_email",
          input.value
            .trim()
            .toLowerCase()
        );

        input.value =
          "";

        showToast(
          "Thanks! You are subscribed to SneakersLink updates."
        );
      }
    );
  }

  function getProductDetailData() {
    const details =
      $(".single-pro-details");

    if (!details) {
      return null;
    }

    const name =
      details.dataset
        .productName ||
      $(
        "#productName",
        details
      )?.textContent?.trim() ||
      document.body.dataset
        .productName ||
      $("h4", details)
        ?.textContent?.trim() ||
      "Sneaker";

    const price =
      parsePrice(
        details.dataset
          .productPrice
      ) ||
      parsePrice(
        $(
          "#productPrice",
          details
        )?.textContent
      ) ||
      parsePrice(
        $("h2", details)
          ?.textContent
      );

    const image =
      $("#mainImg")
        ?.getAttribute(
          "src"
        ) || "";

    const brand =
      details.dataset
        .brand ||
      document.body.dataset
        .brand ||
      "";

    return {
      id:
        details.dataset
          .productId ||
        document.body.dataset
          .productId ||
        normaliseId(
          `${brand}-${name}`
        ),
      name,
      brand,
      price,
      image,
    };
  }

  function initProductPage() {
    const mainImage =
      $("#mainImg");

    const details =
      $(".single-pro-details");

    if (!mainImage || !details) {
      return;
    }

    $$(
      ".small-img-col img, .small-img"
    ).forEach(
      (thumbnail) => {
        thumbnail.setAttribute(
          "tabindex",
          "0"
        );

        const change =
          () => {
            const src =
              thumbnail.getAttribute(
                "src"
              );

            if (src) {
              mainImage.src =
                src;

              mainImage.alt =
                thumbnail.alt ||
                mainImage.alt;
            }
          };

        thumbnail.addEventListener(
          "click",
          change
        );

        thumbnail.addEventListener(
          "keydown",
          (event) => {
            if (
              event.key ===
                "Enter" ||
              event.key ===
                " "
            ) {
              event.preventDefault();
              change();
            }
          }
        );
      }
    );

    const button =
      $(
        "#mainAddToCart",
        details
      ) ||
      $(
        "#addToCart",
        details
      );

    if (!button) {
      return;
    }

    button.addEventListener(
      "click",
      () => {
        const sizeSelect =
          $(
            "#sizeSelect",
            details
          );

        const quantityInput =
          $(
            "#qtyInput",
            details
          );

        const size =
          sizeSelect?.value?.trim() ||
          "";

        if (
          sizeSelect &&
          (
            !size ||
            size
              .toLowerCase()
              .includes(
                "select"
              )
          )
        ) {
          showToast(
            "Please select a size before adding this product.",
            "warn"
          );

          sizeSelect.focus();

          return;
        }

        const quantity =
          Math.min(
            MAX_QTY,
            Math.max(
              1,
              Number.parseInt(
                quantityInput
                  ?.value ||
                  "1",
                10
              ) || 1
            )
          );

        const product =
          getProductDetailData();

        addToCart(
          {
            ...product,
            size,
            quantity,
          },
          button
        );
      }
    );
  }

  function getRecentOrderIds() {
    try {
      const ids =
        JSON.parse(
          safeStorageGet(
            RECENT_ORDERS_KEY,
            "[]"
          )
        );

      return Array.isArray(
        ids
      )
        ? ids
            .filter(Boolean)
            .slice(0, 10)
        : [];
    } catch {
      return [];
    }
  }

  function rememberOrder(id) {
    const ids = [
      id,
      ...getRecentOrderIds().filter(
        (existing) =>
          existing !== id
      ),
    ].slice(0, 10);

    safeStorageSet(
      RECENT_ORDERS_KEY,
      JSON.stringify(ids)
    );
  }

  function getLocalOrders() {
    try {
      const orders =
        JSON.parse(
          safeStorageGet(
            LOCAL_ORDERS_KEY,
            "[]"
          )
        );

      return Array.isArray(
        orders
      )
        ? orders
        : [];
    } catch {
      return [];
    }
  }

  function saveLocalOrder(
    order
  ) {
    const orders = [
      order,
      ...getLocalOrders().filter(
        (existing) =>
          existing.id !==
          order.id
      ),
    ].slice(0, 20);

    safeStorageSet(
      LOCAL_ORDERS_KEY,
      JSON.stringify(
        orders
      )
    );
  }

  function generateLocalOrderId() {
    const time =
      Date.now()
        .toString(36)
        .toUpperCase()
        .slice(-6);

    const random =
      Math.random()
        .toString(36)
        .slice(2, 7)
        .toUpperCase();

    return `SL-${time}${random}`;
  }

  function buildWhatsAppMessage(
    order
  ) {
    const lines = [
      "Hello SneakersLink, I'd like to complete my order.",
      "",
      `Order reference: ${order.id}`,

      ...order.items.map(
        (item) =>
          `• ${item.name}${
            item.size
              ? ` (Size ${item.size})`
              : ""
          } × ${item.qty} — ${money(
            item.price *
              item.qty
          )}`
      ),

      "",

      `Subtotal: ${money(
        order.subtotal
      )}`,

      ...(order.discount
        ? [
            `Discount: −${money(
              order.discount
            )}`,
          ]
        : []),

      `Total: ${money(
        order.total
      )}`,

      "",

      "Please confirm availability, delivery details and payment instructions.",
    ];

    return lines.join(
      "\n"
    );
  }

  async function checkoutViaWhatsApp() {
    const cart =
      getCart();

    if (!cart.length) {
      showToast(
        "Your cart is empty.",
        "warn"
      );

      return;
    }

    const totals =
      getTotals();

    /*
     * Open the tab synchronously from the click gesture so
     * popup blockers do not prevent the WhatsApp hand-off
     * while Firebase is creating the order.
     */
    const whatsappWindow =
      window.open(
        "about:blank",
        "_blank",
        "noopener,noreferrer"
      );

    const button =
      $("#checkoutBtn");

    if (button) {
      button.disabled =
        true;

      button.dataset
        .originalText ||=
        button.textContent;

      button.textContent =
        "Creating order…";
    }

    const items =
      cart.map(
        (item) => ({
          name:
            item.name,
          size:
            item.size,
          qty:
            item.quantity,
          price:
            item.price,
          img:
            item.image,
        })
      );

    let order = {
      id:
        generateLocalOrderId(),

      items,

      subtotal:
        totals.subtotal,

      discount:
        totals.discount,

      total:
        totals.total,

      status:
        "placed",

      placedAt:
        Date.now(),

      updatedAt:
        Date.now(),
    };

    try {
      if (
        window.SLOrders
          ?.isConfigured &&
        typeof window.SLOrders
          .createOrder ===
          "function"
      ) {
        const created =
          await window.SLOrders.createOrder(
            items,
            totals.total,
            {
              subtotal:
                totals.subtotal,

              discount:
                totals.discount,

              coupon:
                totals.coupon
                  ?.code ||
                "",
            }
          );

        order = {
          ...order,
          ...created,

          subtotal:
            totals.subtotal,

          discount:
            totals.discount,

          total:
            totals.total,
        };
      } else {
        saveLocalOrder(
          order
        );
      }
    } catch (error) {
      console.error(
        "Order creation failed:",
        error
      );

      saveLocalOrder(
        order
      );

      showToast(
        "Cloud order tracking is unavailable, but your WhatsApp order can still continue.",
        "warn"
      );
    } finally {
      saveLocalOrder(
        order
      );

      rememberOrder(
        order.id
      );

      if (button) {
        button.disabled =
          false;

        button.textContent =
          button.dataset
            .originalText ||
          "Checkout via WhatsApp";
      }
    }

    const message =
      encodeURIComponent(
        buildWhatsAppMessage(
          order
        )
      );

    const url =
      `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;

    if (
      whatsappWindow &&
      !whatsappWindow.closed
    ) {
      whatsappWindow.location.href =
        url;
    } else {
      window.location.href =
        url;
    }

    showToast(
      `Order ${order.id} created. Opening WhatsApp…`
    );
  }

  function initCheckout() {
    $(
      "#checkoutBtn"
    )?.addEventListener(
      "click",
      checkoutViaWhatsApp
    );
  }

  function renderTrackResult(
    order
  ) {
    const result =
      $("#trackResult");

    const notFound =
      $("#trackNotFound");

    if (!result) {
      return;
    }

    notFound &&
      (notFound.hidden =
        true);

    result.hidden =
      false;

    const status =
      order?.status ||
      "placed";

    const stages =
      window.SLOrders
        ?.ORDER_STAGES ||
      [
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

    const currentIndex =
      Math.max(
        0,
        stages.findIndex(
          (stage) =>
            stage.key ===
            status
        )
      );

    result.innerHTML = `
      <div class="track-result-card">

        <div class="track-result-head">
          <div>
            <span class="track-eyebrow">
              Order reference
            </span>

            <h3>
              ${escapeHtml(
                order.id ||
                  "Order"
              )}
            </h3>
          </div>

          <strong>
            ${money(
              order.total
            )}
          </strong>
        </div>

        <ol class="order-timeline">

          ${stages
            .map(
              (
                stage,
                index
              ) => `
            <li class="${
              index <=
              currentIndex
                ? "is-complete"
                : ""
            } ${
                index ===
                currentIndex
                  ? "is-current"
                  : ""
              }">

              <span class="timeline-icon">
                <i
                  class="fas ${
                    stage.icon
                  }"
                  aria-hidden="true">
                </i>
              </span>

              <span>
                ${escapeHtml(
                  stage.label
                )}
              </span>

            </li>
          `
            )
            .join("")}

        </ol>

        <p class="track-updated">
          ${
            order.updatedAt
              ? `Last updated ${formatDate(
                  order.updatedAt
                )}`
              : "Status is being processed."
          }
        </p>

      </div>`;
  }

  function formatDate(
    value
  ) {
    let ms = value;

    if (
      value?.toMillis
    ) {
      ms =
        value.toMillis();
    }

    if (
      value?.seconds
    ) {
      ms =
        value.seconds *
        1000;
    }

    const date =
      new Date(ms);

    return Number.isNaN(
      date.getTime()
    )
      ? "recently"
      : date.toLocaleString(
          "en-KE",
          {
            dateStyle:
              "medium",
            timeStyle:
              "short",
          }
        );
  }

  function renderRecentOrders() {
    const container =
      $("#recentOrders");

    const list =
      $("ul", container || document);

    if (!container || !list) {
      return;
    }

    const ids =
      getRecentOrderIds();

    if (!ids.length) {
      container.hidden =
        true;

      return;
    }

    list.innerHTML =
      ids
        .map(
          (id) => `
      <li>
        <button
          type="button"
          class="recent-order-btn"
          data-order-id="${escapeHtml(
            id
          )}">
          ${escapeHtml(id)}
        </button>
      </li>`
        )
        .join("");

    container.hidden =
      false;

    $$(".recent-order-btn", container)
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () => {
              const input =
                $("#trackOrderId");

              if (input) {
                input.value =
                  button.dataset
                    .orderId;

                $(
                  "#trackForm"
                )?.requestSubmit();
              }
            }
          );
        }
      );
  }

  let activeTrackUnsubscribe =
    null;

  async function trackOrder(
    orderId
  ) {
    const cleanId =
      String(
        orderId || ""
      )
        .trim()
        .toUpperCase();

    if (!cleanId) {
      showToast(
        "Enter your order reference.",
        "warn"
      );

      return;
    }

    activeTrackUnsubscribe?.();

    activeTrackUnsubscribe =
      null;

    const result =
      $("#trackResult");

    if (result) {
      result.hidden =
        false;

      result.innerHTML =
        `<div class="track-loading">
          Looking up ${escapeHtml(
            cleanId
          )}…
        </div>`;
    }

    try {
      if (
        window.SLOrders
          ?.isConfigured &&
        typeof window.SLOrders
          .subscribeOrder ===
          "function"
      ) {
        activeTrackUnsubscribe =
          window.SLOrders.subscribeOrder(
            cleanId,

            (order) => {
              if (!order) {
                if (result) {
                  result.hidden =
                    true;
                }

                $(
                  "#trackNotFound"
                ) &&
                  ($(
                    "#trackNotFound"
                  ).hidden =
                    false);

                return;
              }

              renderTrackResult(
                {
                  ...order,
                  id: cleanId,
                }
              );
            },

            (error) => {
              console.error(
                "Order tracking error:",
                error
              );

              showToast(
                "We couldn't retrieve that order right now.",
                "warn"
              );
            }
          );
      } else {
        const order =
          getLocalOrders().find(
            (item) =>
              item.id ===
              cleanId
          );

        if (order) {
          renderTrackResult(
            order
          );
        } else {
          if (result) {
            result.hidden =
              true;
          }

          $(
            "#trackNotFound"
          ) &&
            ($(
              "#trackNotFound"
            ).hidden =
              false);
        }
      }
    } catch (error) {
      console.error(error);

      const order =
        getLocalOrders().find(
          (item) =>
            item.id ===
            cleanId
        );

      if (order) {
        renderTrackResult(
          order
        );
      } else {
        if (result) {
          result.hidden =
            true;
        }

        $(
          "#trackNotFound"
        ) &&
          ($(
            "#trackNotFound"
          ).hidden =
            false);
      }
    }
  }

  function initTrackOrder() {
    const form =
      $("#trackForm") ||
      $(".track-form");

    const input =
      $("#trackOrderId") ||
      $("input", form || document);

    if (!form || !input) {
      return;
    }

    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();

        trackOrder(
          input.value
        );
      }
    );

    renderRecentOrders();

    if (
      input.value.trim()
    ) {
      trackOrder(
        input.value
      );
    }
  }

  function initStorageSync() {
    window.addEventListener(
      "storage",
      (event) => {
        if (
          event.key ===
          STORAGE_KEY
        ) {
          updateCartBadge();
          renderCartPage();
        }

        if (
          event.key ===
          COUPON_KEY
        ) {
          updateCartTotals();
        }

        if (
          event.key ===
            THEME_KEY &&
          event.newValue
        ) {
          applyTheme(
            event.newValue,
            false
          );
        }
      }
    );
  }

  window.SneakersLinkCart = {
    get:
      getCart,

    count:
      getCartCount,

    subtotal:
      getCartSubtotal,

    totals:
      getTotals,

    add:
      addToCart,

    remove:
      (
        id,
        size = ""
      ) =>
        removeCartItem(
          id,
          size
        ),

    updateQuantity:
      (
        id,
        size,
        quantity
      ) =>
        updateCartQuantity(
          id,
          size,
          quantity
        ),

    clear: () => {
      saveCart([]);

      renderCartPage();
    },
  };

  function init() {
    initTheme();

    initAccountMenu();

    updateCartBadge();

    initMobileNavigation();

    initActiveNavigation();

    initNavbarScroll();

    initProductCards();

    initCartEvents();

    renderCartPage();

    initCoupon();

    initScrollReveal();

    initBackToTop();

    initNewsletter();

    initProductPage();

    initCheckout();

    initTrackOrder();

    initStorageSync();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once: true,
      }
    );
  } else {
    init();
  }
})();