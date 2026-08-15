/* =========================================================
   SneakersLink — production storefront interactions
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
     CONFIG
     ========================================================= */

  const STORAGE_KEY = "sneakerslink_cart";
  const THEME_KEY = "sl_theme";
  const COUPON_KEY = "sl_coupon";
  const RECENT_ORDERS_KEY = "sl_recent_orders";
  const LOCAL_ORDERS_KEY = "sl_local_orders";

  const WHATSAPP_NUMBER = "254768372955";
  const MAX_QTY = 99;

  let appInitialised = false;
  let activeTrackUnsubscribe = null;

  /* =========================================================
     DOM HELPERS
     ========================================================= */

  const $ = (selector, context = document) =>
    context?.querySelector?.(selector) || null;

  const $$ = (selector, context = document) =>
    context?.querySelectorAll ? [...context.querySelectorAll(selector)] : [];

  /* =========================================================
     MONEY / PRICE HELPERS
     ========================================================= */

  const money = (value) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);

  const parsePrice = (value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    if (value === null || value === undefined || value === "") {
      return 0;
    }

    const cleaned = String(value)
      .replace(/KES|KSh|Kes/gi, "")
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "");

    return Number(cleaned) || 0;
  };

  /* =========================================================
     STORAGE HELPERS
     ========================================================= */

  const safeStorageGet = (key, fallback = null) => {
    try {
      const value = localStorage.getItem(key);

      return value === null ? fallback : value;
    } catch (error) {
      console.warn(`[SneakersLink] Storage read failed: ${key}`, error);

      return fallback;
    }
  };

  const safeStorageSet = (key, value) => {
    try {
      localStorage.setItem(key, value);

      return true;
    } catch (error) {
      console.warn(`[SneakersLink] Storage write failed: ${key}`, error);

      return false;
    }
  };

  const safeStorageRemove = (key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`[SneakersLink] Storage remove failed: ${key}`, error);
    }
  };

  /* =========================================================
     HTML / ID HELPERS
     ========================================================= */

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

  /* =========================================================
     CART
     ========================================================= */

  function normaliseCartItem(item) {
    if (!item || !item.id) {
      return null;
    }

    const parsedPrice = Number(item.price);
    const parsedQuantity = Number(item.quantity);

    return {
      id: String(item.id),
      name: String(item.name || "Sneaker").trim(),
      brand: String(item.brand || "").trim(),
      price: Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0,
      image: String(item.image || ""),
      quantity: Math.min(
        MAX_QTY,
        Math.max(
          1,
          Math.floor(Number.isFinite(parsedQuantity) ? parsedQuantity : 1),
        ),
      ),
      size: item.size ? String(item.size).trim() : "",
    };
  }

  function getCart() {
    const raw = safeStorageGet(STORAGE_KEY, "[]");

    try {
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        safeStorageRemove(STORAGE_KEY);

        return [];
      }

      return parsed.map(normaliseCartItem).filter(Boolean);
    } catch (error) {
      console.warn("[SneakersLink] Invalid cart data:", error);

      safeStorageRemove(STORAGE_KEY);

      return [];
    }
  }

  function emitCartUpdate(cart) {
    try {
      window.dispatchEvent(
        new CustomEvent("sneakerslink:cart-updated", {
          detail: {
            cart: [...cart],
          },
        }),
      );
    } catch (error) {
      console.warn("[SneakersLink] Cart event failed:", error);
    }
  }

  function saveCart(cart) {
    const clean = Array.isArray(cart)
      ? cart.map(normaliseCartItem).filter(Boolean)
      : [];

    safeStorageSet(STORAGE_KEY, JSON.stringify(clean));

    updateCartBadge();

    emitCartUpdate(clean);
  }

  function getCartCount() {
    return getCart().reduce((sum, item) => sum + item.quantity, 0);
  }

  function getCartSubtotal() {
    return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  /* =========================================================
     COUPONS
     ========================================================= */

  function getCoupon() {
    try {
      const raw = safeStorageGet(COUPON_KEY, null);

      if (!raw) {
        return null;
      }

      const coupon = JSON.parse(raw);

      if (coupon?.code === "SL500" && Number(coupon.discount) > 0) {
        return {
          code: "SL500",
          discount: 500,
        };
      }

      return null;
    } catch (error) {
      safeStorageRemove(COUPON_KEY);

      return null;
    }
  }

  function getTotals() {
    const subtotal = getCartSubtotal();

    const coupon = getCoupon();

    const discount = Math.min(subtotal, coupon?.discount || 0);

    return {
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount),
      coupon,
      shipping: 0,
    };
  }

  /* =========================================================
     CART BADGE
     ========================================================= */

  function updateCartBadge(bump = false) {
    const count = getCartCount();

    $$("[data-cart-count], .cart-count").forEach((badge) => {
      badge.textContent = count > 99 ? "99+" : String(count);

      badge.classList.toggle("cart-count--visible", count > 0);

      if (bump) {
        badge.classList.remove("cart-count--bump");

        void badge.offsetWidth;

        badge.classList.add("cart-count--bump");

        window.setTimeout(() => {
          badge.classList.remove("cart-count--bump");
        }, 350);
      }
    });
  }

  /* =========================================================
     PRODUCT DATA
     ========================================================= */

  function getProductFromCard(card) {
    if (!card) {
      return null;
    }

    const image = $("img", card);

    const brand =
      card.dataset.brand || $(".des span", card)?.textContent?.trim() || "";

    const name =
      card.dataset.name || $(".des h5", card)?.textContent?.trim() || "Sneaker";

    const price =
      parsePrice(card.dataset.price) ||
      parsePrice($(".des h4", card)?.textContent);

    const imageSrc = image?.getAttribute("src") || image?.src || "";

    const id =
      card.dataset.productId ||
      card.dataset.id ||
      normaliseId(`${brand}-${name}`);

    return normaliseCartItem({
      id,
      name,
      brand,
      price,
      image: imageSrc,
      quantity: 1,
      size: card.dataset.size || "",
    });
  }

  /* =========================================================
     ADD TO CART
     ========================================================= */

  function addToCart(product, sourceElement = null) {
    const cleanProduct = normaliseCartItem(product);

    if (!cleanProduct) {
      showToast("This product could not be added to your cart.", "warn");

      return;
    }

    const cart = getCart();

    const existing = cart.find(
      (item) => item.id === cleanProduct.id && item.size === cleanProduct.size,
    );

    if (existing) {
      existing.quantity = Math.min(
        MAX_QTY,
        existing.quantity + cleanProduct.quantity,
      );
    } else {
      cart.push(cleanProduct);
    }

    saveCart(cart);

    updateCartBadge(true);

    if (sourceElement) {
      sourceElement.classList.remove("add-cart-btn--pop");

      void sourceElement.offsetWidth;

      sourceElement.classList.add("add-cart-btn--pop");

      window.setTimeout(() => {
        sourceElement.classList.remove("add-cart-btn--pop");
      }, 350);

      flyToCart(sourceElement);
    }

    showToast(`${cleanProduct.name} added to your cart.`);
  }

  /* =========================================================
     FLY TO CART
     ========================================================= */

  function flyToCart(sourceElement) {
    const image = sourceElement?.closest(".pro")?.querySelector("img");

    const cartTarget =
      $(".cart[href='cart.html']") || $(".cart") || $("[data-cart-count]");

    const cartIcon = cartTarget?.closest("a, button") || cartTarget;

    if (!image || !cartIcon) {
      return;
    }

    const imageRect = image.getBoundingClientRect();

    const cartRect = cartIcon.getBoundingClientRect();

    if (
      !imageRect.width ||
      !imageRect.height ||
      !cartRect.width ||
      !cartRect.height
    ) {
      return;
    }

    const clone = image.cloneNode(true);

    clone.className = "fly-clone";

    Object.assign(clone.style, {
      position: "fixed",
      zIndex: "99999",
      pointerEvents: "none",
      left: `${imageRect.left}px`,
      top: `${imageRect.top}px`,
      width: `${imageRect.width}px`,
      height: `${imageRect.height}px`,
      opacity: "0.9",
      transition: "all .8s cubic-bezier(.22,.61,.36,1)",
    });

    document.body.appendChild(clone);

    requestAnimationFrame(() => {
      Object.assign(clone.style, {
        left: `${cartRect.left + cartRect.width / 2}px`,
        top: `${cartRect.top + cartRect.height / 2}px`,
        width: "24px",
        height: "24px",
        opacity: "0.15",
        transform: "translate(-50%, -50%) scale(.6)",
      });
    });

    window.setTimeout(() => {
      clone.remove();
    }, 850);
  }

  /* =========================================================
     PRODUCT CARDS
     ========================================================= */

  function initProductCards() {
    $$(".pro").forEach((card, index) => {
      card.style.setProperty("--i", index);

      const addButton = $(".add-cart-btn", card);

      if (addButton && !addButton.dataset.cartBound) {
        addButton.dataset.cartBound = "true";

        addButton.addEventListener("click", (event) => {
          event.preventDefault();

          event.stopPropagation();

          addToCart(getProductFromCard(card), addButton);
        });
      }

      const href = card.dataset.href || card.dataset.url;

      if (!href) {
        return;
      }

      if (!card.hasAttribute("tabindex")) {
        card.setAttribute("tabindex", "0");
      }

      card.setAttribute("role", "link");

      if (!card.dataset.navigationBound) {
        card.dataset.navigationBound = "true";

        card.addEventListener("click", (event) => {
          if (event.target.closest("button,a,input,select,textarea")) {
            return;
          }

          window.location.href = href;
        });

        card.addEventListener("keydown", (event) => {
          if (
            (event.key === "Enter" || event.key === " ") &&
            !event.target.closest("button,a,input,select,textarea")
          ) {
            event.preventDefault();

            window.location.href = href;
          }
        });
      }
    });
  }

  /* =========================================================
     CART PAGE
     ========================================================= */

  function renderCartPage() {
    const table = $("#cart table") || $("#cartTable");

    const tbody = $("#cart tbody") || $("#cart table tbody");

    if (!table || !tbody) {
      return;
    }

    const cart = getCart();

    tbody.innerHTML = "";

    const emptyMessage = $("#emptyCartMsg");

    if (!cart.length) {
      table.classList.add("cart-table--empty");

      if (emptyMessage) {
        emptyMessage.hidden = false;
      }

      const row = document.createElement("tr");

      row.innerHTML = `
        <td colspan="6">
          <div class="empty-cart-msg">
            <p>Your cart is currently empty.</p>
            <a href="shop.html">
              Continue shopping →
            </a>
          </div>
        </td>
      `;

      tbody.appendChild(row);

      updateCartTotals();

      return;
    }

    table.classList.remove("cart-table--empty");

    if (emptyMessage) {
      emptyMessage.hidden = true;
    }

    cart.forEach((item) => {
      const row = document.createElement("tr");

      row.dataset.cartId = item.id;

      row.dataset.cartSize = item.size;

      row.innerHTML = `
        <td>
          <button
            type="button"
            class="remove-item"
            data-remove-item="${escapeHtml(item.id)}"
            data-remove-size="${escapeHtml(item.size)}"
            aria-label="Remove ${escapeHtml(item.name)}">
            <i
              class="far fa-times-circle"
              aria-hidden="true">
            </i>
          </button>
        </td>

        <td>
          ${
            item.image
              ? `
                <img
                  src="${escapeHtml(item.image)}"
                  alt="${escapeHtml(item.name)}"
                  loading="lazy">
              `
              : ""
          }
        </td>

        <td>
          <strong>
            ${escapeHtml(item.name)}
          </strong>

          ${
            item.brand
              ? `
                <small class="cart-item-brand">
                  ${escapeHtml(item.brand)}
                </small>
              `
              : ""
          }

          ${
            item.size
              ? `
                <small class="cart-item-size">
                  Size: ${escapeHtml(item.size)}
                </small>
              `
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
          ${money(item.price * item.quantity)}
        </td>
      `;

      tbody.appendChild(row);
    });

    updateCartTotals();
  }

  /* =========================================================
     CART TOTALS
     ========================================================= */

  function updateCartTotals() {
    const totals = getTotals();

    const setMoney = (selectors, value) => {
      const element = selectors.map((selector) => $(selector)).find(Boolean);

      if (element) {
        element.textContent = money(value);
      }
    };

    setMoney(
      [
        "#cartSubtotal",
        "#subtotal-value",
        "#subtotal .subtotal-value",
        "[data-cart-subtotal]",
      ],
      totals.subtotal,
    );

    setMoney(
      ["#cartTotal", "#cart-total", "#total-value", "[data-cart-total]"],
      totals.total,
    );

    $$("[data-subtotal]").forEach((element) => {
      element.textContent = money(totals.subtotal);
    });

    $$("[data-discount]").forEach((element) => {
      element.textContent = `−${money(totals.discount)}`;
    });

    $$("[data-total]").forEach((element) => {
      element.textContent = money(totals.total);
    });

    const discountRow = $("#discountRow");

    if (discountRow) {
      discountRow.hidden = totals.discount <= 0;
    }

    const couponMsg = $("#couponMsg");

    if (couponMsg && totals.coupon) {
      couponMsg.textContent = `${totals.coupon.code} applied — ${money(
        totals.discount,
      )} discount.`;
    }

    updateCartBadge();
  }

  /* =========================================================
     UPDATE CART QUANTITY
     ========================================================= */

  function updateCartQuantity(id, size, quantity) {
    const cart = getCart();

    const item = cart.find(
      (product) =>
        product.id === id && String(product.size || "") === String(size || ""),
    );

    if (!item) {
      return;
    }

    const parsed = Number.parseInt(quantity, 10);

    if (!Number.isFinite(parsed)) {
      item.quantity = 1;
    } else {
      item.quantity = Math.min(MAX_QTY, Math.max(1, parsed));
    }

    saveCart(cart);

    renderCartPage();
  }

  /* =========================================================
     REMOVE CART ITEM
     ========================================================= */

  function removeCartItem(id, size, sourceElement = null) {
    const cart = getCart();

    const item = cart.find(
      (product) =>
        product.id === id && String(product.size || "") === String(size || ""),
    );

    if (!item) {
      return;
    }

    const remove = () => {
      const filtered = cart.filter(
        (product) =>
          !(
            product.id === id &&
            String(product.size || "") === String(size || "")
          ),
      );

      saveCart(filtered);

      renderCartPage();

      showToast(`${item.name} removed from your cart.`, "warn");
    };

    const row = sourceElement?.closest("tr");

    if (row) {
      row.classList.add("row-removing");

      window.setTimeout(remove, 220);
    } else {
      remove();
    }
  }

  /* =========================================================
     CART EVENTS
     ========================================================= */

  function initCartEvents() {
    if (document.body.dataset.cartEventsBound) {
      return;
    }

    document.body.dataset.cartEventsBound = "true";

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-item]");

      if (!button) {
        return;
      }

      event.preventDefault();

      removeCartItem(
        button.dataset.removeItem,
        button.dataset.removeSize || "",
        button,
      );
    });

    document.addEventListener("change", (event) => {
      const input = event.target.closest("[data-cart-qty]");

      if (!input) {
        return;
      }

      updateCartQuantity(
        input.dataset.cartQty,
        input.dataset.cartSize || "",
        input.value,
      );
    });
  }

  /* =========================================================
     COUPON
     ========================================================= */

  function applyCoupon() {
    const input = $("#couponInput") || $("#coupon input");

    if (!input) {
      return;
    }

    const code = input.value.trim().toUpperCase();

    if (!code) {
      showToast("Enter a coupon code.", "warn");

      input.focus();

      return;
    }

    if (code !== "SL500") {
      safeStorageRemove(COUPON_KEY);

      updateCouponTotalsAndMessage("That coupon code is not valid.", true);

      return;
    }

    if (getCartSubtotal() < 2000) {
      showToast(
        "SL500 requires a cart subtotal of at least KES 2,000.",
        "warn",
      );

      return;
    }

    safeStorageSet(
      COUPON_KEY,
      JSON.stringify({
        code: "SL500",
        discount: 500,
      }),
    );

    updateCouponTotalsAndMessage("SL500 applied — KES 500 discount.");

    showToast("Coupon applied.");
  }

  function updateCouponTotalsAndMessage(message, warning = false) {
    const msg = $("#couponMsg") || $(".coupon-msg", $("#coupon") || document);

    if (msg) {
      msg.textContent = message;
    }

    if (warning) {
      showToast(message, "warn");
    }

    updateCartTotals();
  }

  function initCoupon() {
    const button = $("#applyCouponBtn") || $("#coupon button");

    if (button && !button.dataset.couponBound) {
      button.dataset.couponBound = "true";

      button.addEventListener("click", applyCoupon);
    }

    const input = $("#couponInput") || $("#coupon input");

    if (input && !input.dataset.couponBound) {
      input.dataset.couponBound = "true";

      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();

          applyCoupon();
        }
      });
    }
  }

  /* =========================================================
     THEME
     ========================================================= */

  function getPreferredTheme() {
    const saved = safeStorageGet(THEME_KEY);

    if (saved === "dark" || saved === "light") {
      return saved;
    }

    try {
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  }

  function applyTheme(theme, persist = true) {
    const safeTheme = theme === "dark" ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", safeTheme);

    if (persist) {
      safeStorageSet(THEME_KEY, safeTheme);
    }

    const toggle = $("#themeToggle");

    if (toggle) {
      const dark = safeTheme === "dark";

      toggle.setAttribute(
        "aria-label",
        dark ? "Switch to light mode" : "Switch to dark mode",
      );

      toggle.setAttribute(
        "title",
        dark ? "Switch to light mode" : "Switch to dark mode",
      );

      toggle.setAttribute("aria-pressed", String(dark));
    }
  }

  function initTheme() {
    applyTheme(
      document.documentElement.getAttribute("data-theme") ||
        getPreferredTheme(),
      false,
    );

    const toggle = $("#themeToggle");

    if (toggle && !toggle.dataset.themeBound) {
      toggle.dataset.themeBound = "true";

      toggle.addEventListener("click", () => {
        const next =
          document.documentElement.getAttribute("data-theme") === "dark"
            ? "light"
            : "dark";

        applyTheme(next);

        showToast(
          next === "dark" ? "Dark mode enabled." : "Light mode enabled.",
        );
      });
    }
  }

  /* =========================================================
     ACCOUNT / AUTH
     ========================================================= */

  function initAccountMenu() {
    const guestLinks = $("#accountGuestLinks");

    const menu = $("#accountMenu");

    const toggleBtn = $("#accountToggle");

    const dropdown = $("#accountDropdown");

    const avatar = $("#accountAvatar");

    const dropdownAvatar = $("#accountDropdownAvatar");

    const nameEl = $("#accountDropdownName");

    const emailEl = $("#accountDropdownEmail");

    const signOutBtn = $("#accountSignOutBtn");

    const inlineThemeBtn = $("#accountThemeToggle");

    const inlineThemeLabel = $("#accountThemeLabel");

    if (!guestLinks && !menu) {
      return;
    }

    function closeDropdown() {
      dropdown?.classList.remove("is-open");

      toggleBtn?.classList.remove("is-open");

      toggleBtn?.setAttribute("aria-expanded", "false");
    }

    function openDropdown() {
      dropdown?.classList.add("is-open");

      toggleBtn?.classList.add("is-open");

      toggleBtn?.setAttribute("aria-expanded", "true");
    }

    function getCustomerName(user) {
      if (!user) {
        return "Profile";
      }

      const name = user.displayName || user.nickname || user.nickName || "";

      if (String(name).trim()) {
        return String(name).trim();
      }

      if (user.email) {
        return user.email.split("@")[0].trim();
      }

      return "Profile";
    }

    function updateAvatar(user, element) {
      if (!element) {
        return;
      }

      const name = getCustomerName(user);

      if (user?.photoURL) {
        element.innerHTML = `
          <img
            src="${escapeHtml(user.photoURL)}"
            alt="${escapeHtml(name)}"
          >
        `;

        return;
      }

      const initial = name.charAt(0).toUpperCase();

      element.innerHTML = `
        <span class="account-avatar-initial">
          ${escapeHtml(initial || "U")}
        </span>
      `;
    }

    function setLoggedInView(user) {
      if (guestLinks) {
        guestLinks.hidden = true;

        guestLinks.style.display = "none";
      }

      if (menu) {
        menu.hidden = false;

        menu.style.display = "";
      }

      const customerName = getCustomerName(user);

      if (nameEl) {
        nameEl.textContent = customerName;
      }

      const toggleName = $("#accountToggleName");

      if (toggleName) {
        toggleName.textContent = customerName;
      }

      if (emailEl) {
        emailEl.textContent = user?.email || "SneakersLink Account";
      }

      updateAvatar(user, avatar);

      updateAvatar(user, dropdownAvatar);

      document.body.classList.add("sl-user-logged-in");

      document.body.classList.remove("sl-user-logged-out");
    }

    function setLoggedOutView() {
      if (guestLinks) {
        guestLinks.hidden = false;

        guestLinks.style.display = "";
      }

      if (menu) {
        menu.hidden = true;

        menu.style.display = "none";
      }

      closeDropdown();

      document.body.classList.remove("sl-user-logged-in");

      document.body.classList.add("sl-user-logged-out");
    }

    if (toggleBtn && !toggleBtn.dataset.accountBound) {
      toggleBtn.dataset.accountBound = "true";

      toggleBtn.addEventListener("click", (event) => {
        event.stopPropagation();

        if (dropdown?.classList.contains("is-open")) {
          closeDropdown();
        } else {
          openDropdown();
        }
      });
    }

    if (!document.body.dataset.accountOutsideBound) {
      document.body.dataset.accountOutsideBound = "true";

      document.addEventListener("click", (event) => {
        if (menu && !menu.hidden && !menu.contains(event.target)) {
          closeDropdown();
        }
      });
    }

    if (!document.body.dataset.accountEscapeBound) {
      document.body.dataset.accountEscapeBound = "true";

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeDropdown();
        }
      });
    }

    if (signOutBtn && !signOutBtn.dataset.signoutBound) {
      signOutBtn.dataset.signoutBound = "true";

      signOutBtn.addEventListener("click", async () => {
        try {
          if (window.SLAuth && typeof window.SLAuth.logout === "function") {
            await window.SLAuth.logout();
          } else if (
            window.SLProfile &&
            typeof window.SLProfile.getCurrentUser === "function"
          ) {
            console.warn("[SneakersLink] SLAuth logout API unavailable.");
          }

          try {
            sessionStorage.removeItem("sneakerslink_new_signup");
          } catch {}

          closeDropdown();

          showToast("Signed out successfully.");
        } catch (error) {
          console.error("[SneakersLink] Sign out failed:", error);

          showToast("Couldn't sign out. Please try again.", "warn");
        }
      });
    }

    if (inlineThemeBtn && !inlineThemeBtn.dataset.themeBound) {
      inlineThemeBtn.dataset.themeBound = "true";

      const syncThemeLabel = () => {
        const isDark =
          document.documentElement.getAttribute("data-theme") === "dark";

        if (inlineThemeLabel) {
          inlineThemeLabel.textContent = isDark ? "Light Mode" : "Dark Mode";
        }
      };

      syncThemeLabel();

      inlineThemeBtn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");

        const next = current === "dark" ? "light" : "dark";

        applyTheme(next);

        syncThemeLabel();

        closeDropdown();
      });
    }

    let authStateWired = false;

    function handleAuthUser(user) {
      if (user) {
        setLoggedInView(user);
      } else {
        setLoggedOutView();
      }
    }

    function wireAuthState() {
      if (authStateWired) {
        return true;
      }

      if (
        window.SLAuth &&
        typeof window.SLAuth.onAuthStateChanged === "function"
      ) {
        authStateWired = true;

        window.SLAuth.onAuthStateChanged(handleAuthUser);

        return true;
      }

      if (
        window.SLProfile &&
        typeof window.SLProfile.onProfileAuthChange === "function"
      ) {
        authStateWired = true;

        window.SLProfile.onProfileAuthChange(handleAuthUser);

        return true;
      }

      return false;
    }

    if (!wireAuthState()) {
      window.addEventListener("slauth:ready", wireAuthState);

      window.addEventListener("slprofile:ready", wireAuthState);
    }
  }

  /* =========================================================
     MOBILE NAVIGATION
     ========================================================= */

  function initMobileNavigation() {
    const check = $("#check");

    const navbar = $("#navbar");

    if (!check || !navbar) {
      return;
    }

    const button = $(".navbutton");

    button?.setAttribute("aria-controls", "navbar");

    button?.setAttribute("aria-expanded", String(Boolean(check.checked)));

    $$("#navbar a").forEach((link) => {
      if (link.dataset.mobileNavBound) {
        return;
      }

      link.dataset.mobileNavBound = "true";

      link.addEventListener("click", () => {
        check.checked = false;

        button?.setAttribute("aria-expanded", "false");
      });
    });

    if (!check.dataset.mobileBound) {
      check.dataset.mobileBound = "true";

      check.addEventListener("change", () => {
        button?.setAttribute("aria-expanded", String(check.checked));
      });
    }

    if (!document.body.dataset.mobileOutsideBound) {
      document.body.dataset.mobileOutsideBound = "true";

      document.addEventListener("click", (event) => {
        if (check.checked && !event.target.closest("nav")) {
          check.checked = false;

          button?.setAttribute("aria-expanded", "false");
        }
      });
    }
  }

  /* =========================================================
     ACTIVE NAVIGATION
     ========================================================= */

  function initActiveNavigation() {
    const current = (
      window.location.pathname.split("/").pop() || "index.html"
    ).toLowerCase();

    $$("#navbar a").forEach((link) => {
      const href = link.getAttribute("href") || "";

      const page = href.split("#")[0].split("/").pop().toLowerCase();

      link.classList.toggle("active", page === current);
    });
  }

  /* =========================================================
     NAVBAR SCROLL
     ========================================================= */

  function initNavbarScroll() {
    const nav = $("nav");

    if (!nav) {
      return;
    }

    const update = () => {
      nav.classList.toggle("nav--scrolled", window.scrollY > 20);
    };

    update();

    window.addEventListener("scroll", update, {
      passive: true,
    });
  }

  /* =========================================================
     SCROLL REVEAL
     ========================================================= */

  function initScrollReveal() {
    const selector = `
      .pro-container .pro,
      #feature .ft-box,
      #banner,
      #sm-banner .banner-box,
      #banner3 .banner-box,
      #newsletter
    `;

    $$(selector).forEach((element) => {
      element.classList.add("reveal");
    });

    const elements = $$(".reveal");

    if (!elements.length) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => {
        element.classList.add("reveal--in");
      });

      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("reveal--in");

          obs.unobserve(entry.target);
        });
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -30px 0px",
      },
    );

    elements.forEach((element) => {
      observer.observe(element);
    });
  }

  /* =========================================================
     TOAST
     ========================================================= */

  function ensureToastRoot() {
    let root = $(".toast-root") || $("#toast-root");

    if (root) {
      return root;
    }

    root = document.createElement("div");

    root.className = "toast-root";

    root.setAttribute("aria-live", "polite");

    root.setAttribute("aria-atomic", "true");

    document.body.appendChild(root);

    return root;
  }

  function showToast(message, type = "success", duration = 3200) {
    if (!message) {
      return;
    }

    const root = ensureToastRoot();

    const toast = document.createElement("div");

    toast.className = `toast${type === "warn" ? " toast--warn" : ""}`;

    toast.innerHTML = `
      <i
        class="fas ${
          type === "warn" ? "fa-exclamation-circle" : "fa-check-circle"
        }"
        aria-hidden="true">
      </i>

      <span>
        ${escapeHtml(message)}
      </span>
    `;

    root.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("toast--show");
    });

    window.setTimeout(() => {
      toast.classList.remove("toast--show");

      window.setTimeout(() => {
        toast.remove();
      }, 350);
    }, duration);
  }

  /* =========================================================
     BACK TO TOP
     ========================================================= */

  function initBackToTop() {
    const button = $("#backToTop");

    if (!button) {
      return;
    }

    const update = () => {
      button.classList.toggle("back-to-top--visible", window.scrollY > 450);
    };

    update();

    window.addEventListener("scroll", update, {
      passive: true,
    });

    if (!button.dataset.backTopBound) {
      button.dataset.backTopBound = "true";

      button.addEventListener("click", () => {
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      });
    }
  }

  /* =========================================================
     NEWSLETTER
     ========================================================= */

  function initNewsletter() {
    const form = $("#newsletterForm");

    if (!form || form.dataset.newsletterBound) {
      return;
    }

    form.dataset.newsletterBound = "true";

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const input = $("input[type='email']", form);

      if (!input || !input.checkValidity()) {
        input?.classList.add("field-error");

        showToast("Please enter a valid email address.", "warn");

        window.setTimeout(() => {
          input?.classList.remove("field-error");
        }, 500);

        return;
      }

      safeStorageSet("sl_newsletter_email", input.value.trim().toLowerCase());

      input.value = "";

      showToast("Thanks! You are subscribed to SneakersLink updates.");
    });
  }

  /* =========================================================
     PRODUCT DETAIL
     ========================================================= */

  function getProductDetailData() {
    const details = $(".single-pro-details");

    if (!details) {
      return null;
    }

    const name =
      details.dataset.productName ||
      $("#productName", details)?.textContent?.trim() ||
      document.body.dataset.productName ||
      $("h4", details)?.textContent?.trim() ||
      "Sneaker";

    const price =
      parsePrice(details.dataset.productPrice) ||
      parsePrice($("#productPrice", details)?.textContent) ||
      parsePrice($("h2", details)?.textContent);

    const image = $("#mainImg")?.getAttribute("src") || "";

    const brand = details.dataset.brand || document.body.dataset.brand || "";

    const id =
      details.dataset.productId ||
      document.body.dataset.productId ||
      normaliseId(`${brand}-${name}`);

    return {
      id,
      name,
      brand,
      price,
      image,
    };
  }

  function initProductPage() {
    const mainImage = $("#mainImg");

    const details = $(".single-pro-details");

    if (!mainImage || !details) {
      return;
    }

    $$(".small-img-col img, .small-img").forEach((thumbnail) => {
      thumbnail.setAttribute("tabindex", "0");

      if (thumbnail.dataset.thumbnailBound) {
        return;
      }

      thumbnail.dataset.thumbnailBound = "true";

      const change = () => {
        const src = thumbnail.getAttribute("src");

        if (src) {
          mainImage.src = src;

          mainImage.alt = thumbnail.alt || mainImage.alt;
        }
      };

      thumbnail.addEventListener("click", change);

      thumbnail.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();

          change();
        }
      });
    });

    const button = $("#mainAddToCart", details) || $("#addToCart", details);

    if (!button || button.dataset.productBound) {
      return;
    }

    button.dataset.productBound = "true";

    button.addEventListener("click", () => {
      const sizeSelect = $("#sizeSelect", details);

      const quantityInput = $("#qtyInput", details);

      const size = sizeSelect?.value?.trim() || "";

      if (sizeSelect && (!size || size.toLowerCase().includes("select"))) {
        showToast("Please select a size before adding this product.", "warn");

        sizeSelect.focus();

        return;
      }

      let quantity = Number.parseInt(quantityInput?.value || "1", 10);

      if (!Number.isFinite(quantity)) {
        quantity = 1;
      }

      quantity = Math.min(MAX_QTY, Math.max(1, quantity));

      const product = getProductDetailData();

      if (!product) {
        showToast("Product information is unavailable.", "warn");

        return;
      }

      addToCart(
        {
          ...product,
          size,
          quantity,
        },
        button,
      );
    });
  }

  /* =========================================================
     ORDERS
     ========================================================= */

  function getRecentOrderIds() {
    try {
      const ids = JSON.parse(safeStorageGet(RECENT_ORDERS_KEY, "[]"));

      return Array.isArray(ids) ? ids.filter(Boolean).slice(0, 10) : [];
    } catch {
      return [];
    }
  }

  function rememberOrder(id) {
    if (!id) {
      return;
    }

    const ids = [
      id,
      ...getRecentOrderIds().filter((existing) => existing !== id),
    ].slice(0, 10);

    safeStorageSet(RECENT_ORDERS_KEY, JSON.stringify(ids));
  }

  function getLocalOrders() {
    try {
      const orders = JSON.parse(safeStorageGet(LOCAL_ORDERS_KEY, "[]"));

      return Array.isArray(orders) ? orders : [];
    } catch {
      return [];
    }
  }

  function saveLocalOrder(order) {
    if (!order?.id) {
      return;
    }

    const orders = [
      order,
      ...getLocalOrders().filter((existing) => existing.id !== order.id),
    ].slice(0, 20);

    safeStorageSet(LOCAL_ORDERS_KEY, JSON.stringify(orders));
  }

  function generateLocalOrderId() {
    const time = Date.now().toString(36).toUpperCase().slice(-6);

    const random = Math.random().toString(36).slice(2, 7).toUpperCase();

    return `SL-${time}${random}`;
  }

  /* =========================================================
     WHATSAPP ORDER MESSAGE
     ========================================================= */

  function buildWhatsAppMessage(order) {
    const lines = [
      "Hello SneakersLink, I'd like to complete my order.",
      "",
      `Order reference: ${order.id}`,

      ...order.items.map(
        (item) =>
          `• ${item.name}${
            item.size ? ` (Size ${item.size})` : ""
          } × ${item.qty} — ${money(item.price * item.qty)}`,
      ),

      "",
      `Subtotal: ${money(order.subtotal)}`,

      ...(order.discount ? [`Discount: −${money(order.discount)}`] : []),

      `Total: ${money(order.total)}`,

      "",

      "Please confirm availability, delivery details and payment instructions.",
    ];

    return lines.join("\n");
  }

  /* =========================================================
     WHATSAPP CHECKOUT
     ========================================================= */

  async function checkoutViaWhatsApp() {
    const cart = getCart();

    if (!cart.length) {
      showToast("Your cart is empty.", "warn");

      return;
    }

    const totals = getTotals();

    let whatsappWindow = null;

    try {
      whatsappWindow = window.open("about:blank", "_blank");

      if (whatsappWindow) {
        try {
          whatsappWindow.opener = null;
        } catch {}
      }
    } catch (error) {
      console.warn("[SneakersLink] WhatsApp popup failed:", error);
    }

    const button = $("#checkoutBtn");

    let originalText = "Checkout via WhatsApp";

    if (button) {
      button.disabled = true;

      originalText =
        button.dataset.originalText || button.textContent || originalText;

      button.dataset.originalText = originalText;

      button.textContent = "Creating order…";
    }

    const items = cart.map((item) => ({
      name: item.name,
      size: item.size,
      qty: item.quantity,
      price: item.price,
      img: item.image,
    }));

    let order = {
      id: generateLocalOrderId(),
      items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      status: "placed",
      placedAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      const ordersConfigured = Boolean(window.SLOrders?.isConfigured);

      const canCreateOrder = typeof window.SLOrders?.createOrder === "function";

      if (ordersConfigured && canCreateOrder) {
        const created = await window.SLOrders.createOrder(items, totals.total, {
          subtotal: totals.subtotal,
          discount: totals.discount,
          coupon: totals.coupon?.code || "",
        });

        if (created) {
          order = {
            ...order,
            ...created,
            subtotal: totals.subtotal,
            discount: totals.discount,
            total: totals.total,
          };
        }
      }

      saveLocalOrder(order);
    } catch (error) {
      console.error("[SneakersLink] Order creation failed:", error);

      saveLocalOrder(order);

      showToast(
        "Cloud order tracking is unavailable, but your WhatsApp order can still continue.",
        "warn",
      );
    } finally {
      saveLocalOrder(order);

      rememberOrder(order.id);

      if (button) {
        button.disabled = false;

        button.textContent = originalText;
      }
    }

    saveCart([]);

    safeStorageRemove(COUPON_KEY);

    renderCartPage();

    const message = encodeURIComponent(buildWhatsAppMessage(order));

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;

    if (whatsappWindow && !whatsappWindow.closed) {
      try {
        whatsappWindow.location.href = url;
      } catch {
        window.location.href = url;
      }
    } else {
      window.location.href = url;
    }

    showToast(`Order ${order.id} created. Opening WhatsApp…`);
  }

  function initCheckout() {
    const button = $("#checkoutBtn");

    if (!button || button.dataset.checkoutBound) {
      return;
    }

    button.dataset.checkoutBound = "true";

    button.addEventListener("click", checkoutViaWhatsApp);
  }

  /* =========================================================
     TRACK ORDER
     ========================================================= */

  function formatDate(value) {
    let ms = value;

    try {
      if (value && typeof value.toMillis === "function") {
        ms = value.toMillis();
      } else if (value && typeof value.seconds === "number") {
        ms = value.seconds * 1000;
      }
    } catch {}

    const date = new Date(ms);

    if (Number.isNaN(date.getTime())) {
      return "recently";
    }

    return date.toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function renderTrackResult(order) {
    const result = $("#trackResult");

    const notFound = $("#trackNotFound");

    if (!result) {
      return;
    }

    if (notFound) {
      notFound.hidden = true;
    }

    result.hidden = false;

    const status = order?.status || "placed";

    const stages =
      Array.isArray(window.SLOrders?.ORDER_STAGES) &&
      window.SLOrders.ORDER_STAGES.length
        ? window.SLOrders.ORDER_STAGES
        : [
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

    let currentIndex = stages.findIndex((stage) => stage.key === status);

    if (currentIndex < 0) {
      currentIndex = 0;
    }

    result.innerHTML = `
      <div class="track-result-card">

        <div class="track-result-head">

          <div>
            <span class="track-eyebrow">
              Order reference
            </span>

            <h3>
              ${escapeHtml(order.id || "Order")}
            </h3>
          </div>

          <strong>
            ${money(order.total)}
          </strong>

        </div>

        <ol class="order-timeline">

          ${stages
            .map(
              (stage, index) => `
                <li
                  class="${index <= currentIndex ? "is-complete" : ""} ${
                    index === currentIndex ? "is-current" : ""
                  }">

                  <span class="timeline-icon">
                    <i
                      class="fas ${escapeHtml(stage.icon || "fa-circle")}"
                      aria-hidden="true">
                    </i>
                  </span>

                  <span>
                    ${escapeHtml(stage.label || stage.key || "")}
                  </span>

                </li>
              `,
            )
            .join("")}

        </ol>

        <p class="track-updated">
          ${
            order.updatedAt
              ? `Last updated ${escapeHtml(formatDate(order.updatedAt))}`
              : "Status is being processed."
          }
        </p>

      </div>
    `;
  }

  function renderRecentOrders() {
    const container = $("#recentOrders");

    const list = container ? $("ul", container) : null;

    if (!container || !list) {
      return;
    }

    const ids = getRecentOrderIds();

    if (!ids.length) {
      container.hidden = true;

      list.innerHTML = "";

      return;
    }

    list.innerHTML = ids
      .map(
        (id) => `
            <li>
              <button
                type="button"
                class="recent-order-btn"
                data-order-id="${escapeHtml(id)}">
                ${escapeHtml(id)}
              </button>
            </li>
          `,
      )
      .join("");

    container.hidden = false;

    $$(".recent-order-btn", container).forEach((button) => {
      button.addEventListener("click", () => {
        const input = $("#trackOrderId");

        if (input) {
          input.value = button.dataset.orderId || "";

          const form = $("#trackForm");

          if (form?.requestSubmit) {
            form.requestSubmit();
          } else {
            form?.dispatchEvent(
              new Event("submit", {
                bubbles: true,
                cancelable: true,
              }),
            );
          }
        }
      });
    });
  }

  async function trackOrder(orderId) {
    const cleanId = String(orderId || "")
      .trim()
      .toUpperCase();

    if (!cleanId) {
      showToast("Enter your order reference.", "warn");

      return;
    }

    if (typeof activeTrackUnsubscribe === "function") {
      try {
        activeTrackUnsubscribe();
      } catch {}
    }

    activeTrackUnsubscribe = null;

    const result = $("#trackResult");

    const notFound = $("#trackNotFound");

    if (notFound) {
      notFound.hidden = true;
    }

    if (result) {
      result.hidden = false;

      result.innerHTML = `
        <div class="track-loading">
          Looking up ${escapeHtml(cleanId)}…
        </div>
      `;
    }

    try {
      const configured = Boolean(window.SLOrders?.isConfigured);

      const canSubscribe =
        typeof window.SLOrders?.subscribeOrder === "function";

      if (configured && canSubscribe) {
        activeTrackUnsubscribe = window.SLOrders.subscribeOrder(
          cleanId,
          (order) => {
            if (!order) {
              if (result) {
                result.hidden = true;
              }

              if (notFound) {
                notFound.hidden = false;
              }

              return;
            }

            renderTrackResult({
              ...order,
              id: order.id || cleanId,
            });
          },
          (error) => {
            console.error("[SneakersLink] Order tracking error:", error);

            if (result) {
              result.hidden = true;
            }

            if (notFound) {
              notFound.hidden = false;
            }

            showToast("We couldn't retrieve that order right now.", "warn");
          },
        );

        return;
      }

      const localOrder = getLocalOrders().find(
        (item) => String(item.id).toUpperCase() === cleanId,
      );

      if (localOrder) {
        renderTrackResult(localOrder);
      } else {
        if (result) {
          result.hidden = true;
        }

        if (notFound) {
          notFound.hidden = false;
        }
      }
    } catch (error) {
      console.error("[SneakersLink] Tracking failed:", error);

      const localOrder = getLocalOrders().find(
        (item) => String(item.id).toUpperCase() === cleanId,
      );

      if (localOrder) {
        renderTrackResult(localOrder);
      } else {
        if (result) {
          result.hidden = true;
        }

        if (notFound) {
          notFound.hidden = false;
        }

        showToast("We couldn't retrieve that order.", "warn");
      }
    }
  }

  function initTrackOrder() {
    const form = $("#trackForm") || $(".track-form");

    const input = $("#trackOrderId") || $("input", form || document);

    if (!form || !input) {
      return;
    }

    if (!form.dataset.trackBound) {
      form.dataset.trackBound = "true";

      form.addEventListener("submit", (event) => {
        event.preventDefault();

        trackOrder(input.value);
      });
    }

    renderRecentOrders();

    if (input.value.trim()) {
      trackOrder(input.value);
    }
  }

  /* =========================================================
     PERSONALIZED HOME WELCOME
     
     IMPORTANT:
     This is the ONLY home welcome implementation.
     ========================================================= */

  function initHomeWelcome() {
    const welcome = document.getElementById("homeWelcome");

    const welcomeText = document.getElementById("homeWelcomeText");

    if (!welcome || !welcomeText) {
      return;
    }

    /* -------------------------------------------------------
       CREATE THE WELCOME MESSAGE
       ------------------------------------------------------- */

    function showWelcomeMessage(normalMessage, customerName = "") {
      welcomeText.innerHTML = "";

      /*
       * Normal text
       *
       * Example:
       * "Welcome back,"
       */
      const normalSpan = document.createElement("span");

      normalSpan.className = "welcome-normal";

      normalSpan.textContent = normalMessage;

      welcomeText.appendChild(normalSpan);

      /*
       * Customer name
       *
       * Space is deliberately included before the name:
       * "Welcome back, Ken"
       */
      if (customerName) {
        const nameSpan = document.createElement("span");

        nameSpan.className = "welcome-name";

        nameSpan.textContent = ` ${customerName}`;

        welcomeText.appendChild(nameSpan);
      }

      /*
       * FOOTSTEPS
       *
       * Always positioned at the very end.
       */
      const footsteps = document.createElement("span");

      footsteps.className = "welcome-footsteps";

      /*
       * Three individual footsteps.
       *
       * They continuously animate one after another.
       */
      for (let i = 0; i < 3; i++) {
        const footstep = document.createElement("span");

        footstep.className = "welcome-footstep";

        footstep.textContent = "👣";

        footstep.style.setProperty("--footstep", i);

        footsteps.appendChild(footstep);
      }

      welcomeText.appendChild(footsteps);

      /*
       * Show welcome immediately.
       */
      welcome.hidden = false;

      welcome.classList.add("is-visible", "home-welcome-visible");
    }

    /* -------------------------------------------------------
       GET CUSTOMER NAME
       ------------------------------------------------------- */

    function getStoredCustomerName() {
      try {
        const storedUser =
          localStorage.getItem("sl_user") ||
          localStorage.getItem("currentUser") ||
          localStorage.getItem("user");

        if (!storedUser) {
          return "";
        }

        const user = JSON.parse(storedUser);

        return String(
          user.displayName ||
            user.name ||
            user.firstName ||
            user.fullName ||
            user.nickname ||
            user.nickName ||
            "",
        ).trim();
      } catch (error) {
        console.warn(
          "[SneakersLink] Could not read stored customer information.",
          error,
        );

        return "";
      }
    }

    /* -------------------------------------------------------
       CUSTOMER NAME FROM AUTH USER
       ------------------------------------------------------- */

    function getCustomerName(user) {
      if (!user) {
        return "";
      }

      const name =
        user.displayName ||
        user.nickname ||
        user.nickName ||
        user.name ||
        user.firstName ||
        user.fullName ||
        "";

      if (String(name).trim()) {
        return String(name).trim();
      }

      /*
       * Use email username as a fallback.
       */
      if (user.email) {
        return user.email.split("@")[0].trim();
      }

      return "";
    }

    /* -------------------------------------------------------
       INITIAL MESSAGE
       
       This happens immediately.
       It does NOT wait for Firebase.
       ------------------------------------------------------- */

    const storedName = getStoredCustomerName();

    if (storedName) {
      showWelcomeMessage("Welcome back,", storedName);
    } else {
      showWelcomeMessage("Welcome to SneakersLink!", "");
    }

    /* -------------------------------------------------------
       UPDATE WHEN AUTH USER IS AVAILABLE
       ------------------------------------------------------- */

    function updateForUser(user) {
      /*
       * Logged out / guest.
       */
      if (!user) {
        showWelcomeMessage("Welcome to SneakersLink!", "");

        return;
      }

      const nickname = getCustomerName(user);

      /*
       * Firebase user has no usable name.
       */
      if (!nickname) {
        showWelcomeMessage("Welcome to SneakersLink!", "");

        return;
      }

      /*
       * Check if this is a newly
       * registered customer.
       */
      let isNewSignup = false;

      try {
        isNewSignup =
          sessionStorage.getItem("sneakerslink_new_signup") === "true";
      } catch {
        isNewSignup = false;
      }

      if (isNewSignup) {
        showWelcomeMessage("Welcome!", nickname);
      } else {
        showWelcomeMessage("Welcome back,", nickname);
      }

      /*
       * Clear new-signup flag after
       * the welcome has been displayed.
       */
      if (isNewSignup) {
        window.setTimeout(() => {
          try {
            sessionStorage.removeItem("sneakerslink_new_signup");
          } catch {}
        }, 2500);
      }
    }

    /* -------------------------------------------------------
       AUTH STATE
       ------------------------------------------------------- */

    let authStateWired = false;

    function connectAuth() {
      if (authStateWired) {
        return true;
      }

      /*
       * Primary SneakersLink auth engine.
       */
      if (
        window.SLAuth &&
        typeof window.SLAuth.onAuthStateChanged === "function"
      ) {
        authStateWired = true;

        window.SLAuth.onAuthStateChanged((user) => {
          updateForUser(user);
        });

        return true;
      }

      /*
       * Firebase profile fallback.
       */
      if (
        window.SLProfile &&
        typeof window.SLProfile.onProfileAuthChange === "function"
      ) {
        authStateWired = true;

        window.SLProfile.onProfileAuthChange((user) => {
          updateForUser(user);
        });

        return true;
      }

      return false;
    }

    /*
     * If auth is already loaded,
     * connect immediately.
     */
    if (!connectAuth()) {
      /*
       * Otherwise wait for the existing
       * SneakersLink auth events.
       */
      window.addEventListener("slauth:ready", connectAuth, {
        once: true,
      });

      window.addEventListener("slprofile:ready", connectAuth, {
        once: true,
      });
    }
  }

  /* =========================================================
     STORAGE SYNC
     ========================================================= */

  function initStorageSync() {
    if (window.__sneakersLinkStorageSync) {
      return;
    }

    window.__sneakersLinkStorageSync = true;

    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) {
        updateCartBadge();

        renderCartPage();
      }

      if (event.key === COUPON_KEY) {
        updateCartTotals();
      }

      if (event.key === THEME_KEY && event.newValue) {
        applyTheme(event.newValue, false);
      }
    });
  }

  /* =========================================================
     PUBLIC CART API
     ========================================================= */

  window.SneakersLinkCart = {
    get: getCart,

    count: getCartCount,

    subtotal: getCartSubtotal,

    totals: getTotals,

    add: addToCart,

    remove: (id, size = "") => removeCartItem(id, size),

    updateQuantity: (id, size, quantity) =>
      updateCartQuantity(id, size, quantity),

    clear: () => {
      saveCart([]);

      renderCartPage();
    },
  };

  /* =========================================================
     MAIN INITIALISATION
     ========================================================= */

  function init() {
    if (appInitialised) {
      return;
    }

    appInitialised = true;

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

    /*
     * Home welcome is now initialized
     * exactly once.
     *
     * It displays immediately and then
     * updates when Firebase auth becomes
     * available.
     */
    initHomeWelcome();
  }

  /* =========================================================
     DOM READY
     ========================================================= */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true,
    });
  } else {
    init();
  }
})();
