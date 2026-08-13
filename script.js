/* =========================================================
   SneakersLink — site-wide interactions
   ---------------------------------------------------------
   Includes:
   - Cart engine with localStorage
   - Cart badge
   - Add-to-cart buttons
   - Product-card navigation
   - Cart-page rendering
   - Quantity updates
   - Remove-item handling
   - Coupon handling
   - Theme toggle
   - Mobile navigation
   - Scroll reveal
   - Navbar scroll state
   - Toast notifications
   - Fly-to-cart animation
   - Back-to-top button
   - Newsletter form
   - Product-page helpers
   - Track-order helpers
   - Cross-tab cart synchronization

   Safe to load on every SneakersLink page.
   ========================================================= */

(function () {
  "use strict";

  /* =========================================================
     HELPERS
     ========================================================= */

  const $ = (selector, context = document) =>
    context.querySelector(selector);

  const $$ = (selector, context = document) =>
    Array.from(context.querySelectorAll(selector));

  const STORAGE_KEY = "sneakerslink_cart";
  const THEME_KEY = "sl_theme";

  const money = (value) => {
    const number = Number(value) || 0;

    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0
    }).format(number);
  };

  const parsePrice = (value) => {
    if (typeof value === "number") {
      return value;
    }

    if (!value) {
      return 0;
    }

    const cleaned = String(value)
      .replace(/KES/gi, "")
      .replace(/Kes/gi, "")
      .replace(/Ksh/gi, "")
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "");

    return Number(cleaned) || 0;
  };

  const safeStorageGet = (key, fallback = null) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      console.warn("localStorage read failed:", error);
      return fallback;
    }
  };

  const safeStorageSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn("localStorage write failed:", error);
      return false;
    }
  };

  const safeStorageRemove = (key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn("localStorage remove failed:", error);
    }
  };

  /* =========================================================
     CART STORAGE
     ========================================================= */

  function getCart() {
    const raw = safeStorageGet(STORAGE_KEY, "[]");

    try {
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => ({
          id: String(item.id || ""),
          name: String(item.name || "Sneaker"),
          brand: String(item.brand || ""),
          price: Number(item.price) || 0,
          image: String(item.image || ""),
          quantity: Math.max(1, Number(item.quantity) || 1),
          size: item.size ? String(item.size) : ""
        }))
        .filter((item) => item.id);
    } catch (error) {
      console.warn("Invalid cart data. Resetting cart.", error);
      return [];
    }
  }

  function saveCart(cart) {
    safeStorageSet(STORAGE_KEY, JSON.stringify(cart));

    updateCartBadge();

    window.dispatchEvent(
      new CustomEvent("sneakerslink:cart-updated", {
        detail: {
          cart
        }
      })
    );
  }

  function getCartCount() {
    return getCart().reduce(
      (total, item) => total + Math.max(0, Number(item.quantity) || 0),
      0
    );
  }

  function getCartSubtotal() {
    return getCart().reduce(
      (total, item) =>
        total +
        (Number(item.price) || 0) *
          Math.max(1, Number(item.quantity) || 1),
      0
    );
  }

  /* =========================================================
     CART BADGE
     ========================================================= */

  function updateCartBadge(bump = false) {
    const count = getCartCount();

    $$("[data-cart-count], .cart-count").forEach((badge) => {
      badge.textContent = count > 99 ? "99+" : String(count);

      if (count > 0) {
        badge.classList.add("cart-count--visible");
      } else {
        badge.classList.remove("cart-count--visible");
      }

      if (bump) {
        badge.classList.remove("cart-count--bump");

        void badge.offsetWidth;

        badge.classList.add("cart-count--bump");

        setTimeout(() => {
          badge.classList.remove("cart-count--bump");
        }, 300);
      }
    });
  }

  /* =========================================================
     PRODUCT DATA EXTRACTION
     ========================================================= */

  function getProductFromCard(card) {
    if (!card) {
      return null;
    }

    const image = $("img", card);
    const brandElement = $(".des span", card);
    const nameElement = $(".des h5", card);
    const priceElement = $(".des h4", card);

    const imageSrc =
      image?.getAttribute("src") ||
      image?.src ||
      "";

    const name =
      card.dataset.name ||
      nameElement?.textContent?.trim() ||
      "Sneaker";

    const brand =
      card.dataset.brand ||
      brandElement?.textContent?.trim() ||
      "";

    const price =
      parsePrice(card.dataset.price) ||
      parsePrice(priceElement?.textContent);

    const id =
      card.dataset.productId ||
      card.dataset.id ||
      `${brand}-${name}-${imageSrc}`
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

    return {
      id,
      name,
      brand,
      price,
      image: imageSrc,
      quantity: 1,
      size: card.dataset.size || ""
    };
  }

  /* =========================================================
     ADD TO CART
     ========================================================= */

  function addToCart(product, sourceElement = null) {
    if (!product) {
      return;
    }

    const cart = getCart();

    const existing = cart.find(
      (item) =>
        item.id === product.id &&
        String(item.size || "") === String(product.size || "")
    );

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        ...product,
        quantity: 1
      });
    }

    saveCart(cart);

    updateCartBadge(true);

    if (sourceElement) {
      sourceElement.classList.remove("add-cart-btn--pop");

      void sourceElement.offsetWidth;

      sourceElement.classList.add("add-cart-btn--pop");

      setTimeout(() => {
        sourceElement.classList.remove("add-cart-btn--pop");
      }, 300);

      flyToCart(sourceElement);
    }

    showToast(
      `${product.name} added to your cart.`,
      "success"
    );
  }

  /* =========================================================
     FLY TO CART
     ========================================================= */

  function flyToCart(sourceElement) {
    if (!sourceElement) {
      return;
    }

    const image =
      sourceElement.closest(".pro")?.querySelector("img");

    const cart =
      $(".cart") ||
      $('[href="cart.html"]');

    if (!image || !cart) {
      return;
    }

    const imageRect = image.getBoundingClientRect();
    const cartRect = cart.getBoundingClientRect();

    const clone = image.cloneNode(true);

    clone.classList.add("fly-clone");

    clone.style.left = `${imageRect.left}px`;
    clone.style.top = `${imageRect.top}px`;
    clone.style.width = `${imageRect.width}px`;
    clone.style.height = `${imageRect.height}px`;
    clone.style.opacity = "0.9";

    document.body.appendChild(clone);

    requestAnimationFrame(() => {
      clone.style.left =
        `${cartRect.left + cartRect.width / 2}px`;

      clone.style.top =
        `${cartRect.top + cartRect.height / 2}px`;

      clone.style.width = "24px";
      clone.style.height = "24px";
      clone.style.opacity = "0.2";
      clone.style.transform = "scale(0.6)";
    });

    setTimeout(() => {
      clone.remove();
    }, 800);
  }

  /* =========================================================
     PRODUCT CARD CLICK HANDLING
     ========================================================= */

  function initProductCards() {
    $$(".pro").forEach((card, index) => {
      card.style.setProperty("--i", index);

      const addButton = $(".add-cart-btn", card);

      if (addButton) {
        addButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const product = getProductFromCard(card);

          addToCart(product, addButton);
        });
      }

      card.addEventListener("click", (event) => {
        if (
          event.target.closest(".add-cart-btn") ||
          event.target.closest("a") ||
          event.target.closest("button") ||
          event.target.closest("input") ||
          event.target.closest("select")
        ) {
          return;
        }

        const href =
          card.dataset.href ||
          card.getAttribute("data-url");

        if (href) {
          window.location.href = href;
        }
      });

      card.addEventListener("keydown", (event) => {
        if (
          event.key !== "Enter" &&
          event.key !== " "
        ) {
          return;
        }

        if (
          event.target.closest(".add-cart-btn") ||
          event.target.closest("button")
        ) {
          return;
        }

        const href =
          card.dataset.href ||
          card.getAttribute("data-url");

        if (href) {
          event.preventDefault();
          window.location.href = href;
        }
      });

      if (
        card.dataset.href &&
        !card.hasAttribute("tabindex")
      ) {
        card.setAttribute("tabindex", "0");
      }
    });
  }

  /* =========================================================
     CART PAGE
     ========================================================= */

  function initCartPage() {
    const cartTable =
      $("#cart table") ||
      $("#cartTable");

    if (!cartTable) {
      return;
    }

    renderCartPage();
  }

  function renderCartPage() {
    const cart = getCart();

    const tbody =
      $("#cart tbody") ||
      $("#cart table tbody");

    if (!tbody) {
      return;
    }

    tbody.innerHTML = "";

    if (!cart.length) {
      renderEmptyCart(tbody);
      updateCartTotals();
      return;
    }

    cart.forEach((item) => {
      const row = document.createElement("tr");

      row.dataset.cartId = item.id;

      row.innerHTML = `
        <td>
          <button
            type="button"
            class="remove-item"
            data-remove-item="${escapeHtml(item.id)}"
            aria-label="Remove ${escapeHtml(item.name)}">
            <i class="far fa-times-circle"></i>
          </button>
        </td>

        <td>
          <img
            src="${escapeHtml(item.image)}"
            alt="${escapeHtml(item.name)}"
            loading="lazy">
        </td>

        <td>
          ${escapeHtml(item.name)}
          ${
            item.size
              ? `<small style="display:block;color:var(--text-muted);">Size: ${escapeHtml(item.size)}</small>`
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
            max="99"
            value="${item.quantity}"
            class="cart-qty"
            data-cart-qty="${escapeHtml(item.id)}"
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

  function renderEmptyCart(tbody) {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td colspan="6">
        <div class="empty-cart-msg">
          <p>Your cart is currently empty.</p>
          <a href="shop.html">Continue shopping</a>
        </div>
      </td>
    `;

    tbody.appendChild(row);
  }

  function updateCartTotals() {
    const cart = getCart();

    const subtotal = cart.reduce(
      (sum, item) =>
        sum + item.price * item.quantity,
      0
    );

    const subtotalElement =
      $("#subtotal-value") ||
      $("#subtotal .subtotal-value") ||
      $("[data-cart-subtotal]");

    if (subtotalElement) {
      subtotalElement.textContent = money(subtotal);
    }

    const totalElement =
      $("#cart-total") ||
      $("#total-value") ||
      $("[data-cart-total]");

    if (totalElement) {
      totalElement.textContent = money(subtotal);
    }

    /*
     * Existing subtotal tables often have:
     * subtotal row + shipping row + total row.
     * Update them conservatively by looking for
     * data attributes first.
     */

    $$("[data-subtotal]").forEach((element) => {
      element.textContent = money(subtotal);
    });

    $$("[data-total]").forEach((element) => {
      element.textContent = money(subtotal);
    });

    updateCartBadge();
  }

  /* =========================================================
     CART EVENT DELEGATION
     ========================================================= */

  function initCartEvents() {
    document.addEventListener("click", (event) => {
      const removeButton =
        event.target.closest("[data-remove-item]");

      if (removeButton) {
        event.preventDefault();

        const id =
          removeButton.getAttribute("data-remove-item");

        removeCartItem(id, removeButton);

        return;
      }
    });

    document.addEventListener("change", (event) => {
      const quantityInput =
        event.target.closest("[data-cart-qty]");

      if (quantityInput) {
        const id =
          quantityInput.getAttribute("data-cart-qty");

        updateCartQuantity(
          id,
          quantityInput.value
        );
      }
    });
  }

  function updateCartQuantity(id, quantity) {
    const cart = getCart();

    const item = cart.find(
      (product) => product.id === id
    );

    if (!item) {
      return;
    }

    let newQuantity =
      parseInt(quantity, 10);

    if (!Number.isFinite(newQuantity)) {
      newQuantity = 1;
    }

    newQuantity = Math.max(
      1,
      Math.min(99, newQuantity)
    );

    item.quantity = newQuantity;

    saveCart(cart);

    renderCartPage();
  }

  function removeCartItem(id, sourceElement = null) {
    const cart = getCart();

    const itemIndex = cart.findIndex(
      (item) => item.id === id
    );

    if (itemIndex === -1) {
      return;
    }

    const item = cart[itemIndex];

    const row =
      sourceElement?.closest("tr");

    if (row) {
      row.classList.add("row-removing");

      setTimeout(() => {
        finishRemoveItem(id, item);
      }, 250);
    } else {
      finishRemoveItem(id, item);
    }
  }

  function finishRemoveItem(id, item) {
    const cart = getCart().filter(
      (product) => product.id !== id
    );

    saveCart(cart);

    renderCartPage();

    showToast(
      `${item.name} removed from your cart.`,
      "warn"
    );
  }

  /* =========================================================
     COUPONS
     ========================================================= */

  function initCoupon() {
    const couponInput =
      $("#coupon input");

    const couponButton =
      $("#coupon button");

    if (!couponInput || !couponButton) {
      return;
    }

    couponButton.addEventListener("click", () => {
      const code =
        couponInput.value
          .trim()
          .toUpperCase();

      if (!code) {
        showToast(
          "Please enter a coupon code.",
          "warn"
        );

        couponInput.classList.add(
          "field-error"
        );

        setTimeout(() => {
          couponInput.classList.remove(
            "field-error"
          );
        }, 500);

        return;
      }

      /*
       * Demo coupon support.
       *
       * SL500:
       * KES 500 discount when cart subtotal
       * is at least KES 2,000.
       */

      const subtotal = getCartSubtotal();

      if (code === "SL500") {
        if (subtotal < 2000) {
          showToast(
            "SL500 requires a cart subtotal of at least KES 2,000.",
            "warn"
          );
          return;
        }

        safeStorageSet(
          "sl_coupon",
          JSON.stringify({
            code: "SL500",
            discount: 500
          })
        );

        showToast(
          "Coupon applied — KES 500 discount.",
          "success"
        );

        updateCouponMessage(
          "SL500 applied — KES 500 discount."
        );

        updateCartTotals();

        return;
      }

      showToast(
        "That coupon code is not valid.",
        "warn"
      );
    });
  }

  function updateCouponMessage(message) {
    const coupon =
      $("#coupon");

    if (!coupon) {
      return;
    }

    let messageElement =
      $(".coupon-msg", coupon);

    if (!messageElement) {
      messageElement =
        document.createElement("p");

      messageElement.className =
        "coupon-msg";

      coupon.appendChild(messageElement);
    }

    messageElement.textContent =
      message;
  }

  /* =========================================================
     THEME
     ========================================================= */

  function getPreferredTheme() {
    const saved =
      safeStorageGet(THEME_KEY);

    if (
      saved === "dark" ||
      saved === "light"
    ) {
      return saved;
    }

    if (
      window.matchMedia &&
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches
    ) {
      return "dark";
    }

    return "light";
  }

  function applyTheme(theme, persist = true) {
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

    updateThemeToggle(safeTheme);
  }

  function updateThemeToggle(theme) {
    const toggle =
      $("#themeToggle");

    if (!toggle) {
      return;
    }

    const dark =
      theme === "dark";

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

  function initTheme() {
    const current =
      document.documentElement.getAttribute(
        "data-theme"
      ) || getPreferredTheme();

    applyTheme(current, false);

    const toggle =
      $("#themeToggle");

    if (!toggle) {
      return;
    }

    toggle.addEventListener("click", () => {
      const currentTheme =
        document.documentElement.getAttribute(
          "data-theme"
        );

      const nextTheme =
        currentTheme === "dark"
          ? "light"
          : "dark";

      applyTheme(nextTheme, true);

      showToast(
        nextTheme === "dark"
          ? "Dark mode enabled."
          : "Light mode enabled.",
        "success"
      );
    });
  }

  /* =========================================================
     MOBILE NAVIGATION
     ========================================================= */

  function initMobileNavigation() {
    const check =
      $("#check");

    const navbar =
      $("#navbar");

    if (!check || !navbar) {
      return;
    }

    $$("#navbar a").forEach((link) => {
      link.addEventListener("click", () => {
        check.checked = false;
      });
    });

    document.addEventListener("click", (event) => {
      if (!check.checked) {
        return;
      }

      const clickedInsideNav =
        event.target.closest("nav");

      if (!clickedInsideNav) {
        check.checked = false;
      }
    });

    check.addEventListener("change", () => {
      const navButton =
        $(".navbutton");

      if (navButton) {
        navButton.setAttribute(
          "aria-expanded",
          String(check.checked)
        );
      }
    });
  }

  /* =========================================================
     ACTIVE NAVIGATION
     ========================================================= */

  function initActiveNavigation() {
    const currentPage =
      window.location.pathname
        .split("/")
        .pop()
        .toLowerCase() || "index.html";

    $$("#navbar a").forEach((link) => {
      const href =
        link.getAttribute("href");

      if (!href) {
        return;
      }

      const linkPage =
        href.split("#")[0]
          .split("/")
          .pop()
          .toLowerCase();

      link.classList.toggle(
        "active",
        linkPage === currentPage
      );
    });
  }

  /* =========================================================
     NAVBAR SCROLL STATE
     ========================================================= */

  function initNavbarScroll() {
    const nav =
      $("nav");

    if (!nav) {
      return;
    }

    const update =
      () => {
        nav.classList.toggle(
          "nav--scrolled",
          window.scrollY > 20
        );
      };

    update();

    window.addEventListener(
      "scroll",
      update,
      {
        passive: true
      }
    );
  }

  /* =========================================================
     SCROLL REVEAL
     ========================================================= */

  function initScrollReveal() {
    const elements =
      $$(".reveal");

    /*
     * Product cards and sections can automatically
     * receive reveal behavior without requiring every
     * HTML element to be manually marked up.
     */

    $$(".pro-container .pro").forEach(
      (element) => {
        element.classList.add("reveal");
      }
    );

    $$(
      "#feature .ft-box, #banner, #sm-banner .banner-box, #banner3 .banner-box, #newsletter"
    ).forEach((element) => {
      element.classList.add("reveal");
    });

    const revealElements =
      $$(".reveal");

    if (
      !("IntersectionObserver" in window)
    ) {
      revealElements.forEach(
        (element) => {
          element.classList.add(
            "reveal--in"
          );
        }
      );

      return;
    }

    const observer =
      new IntersectionObserver(
        (entries, obs) => {
          entries.forEach(
            (entry) => {
              if (!entry.isIntersecting) {
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
          rootMargin: "0px 0px -30px 0px"
        }
      );

    revealElements.forEach(
      (element) => {
        observer.observe(element);
      }
    );
  }

  /* =========================================================
     TOASTS
     ========================================================= */

  function ensureToastRoot() {
    let root =
      $(".toast-root");

    if (root) {
      return root;
    }

    root =
      document.createElement("div");

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

    document.body.appendChild(root);

    return root;
  }

  function showToast(
    message,
    type = "success",
    duration = 3000
  ) {
    if (!message) {
      return;
    }

    const root =
      ensureToastRoot();

    const toast =
      document.createElement("div");

    toast.className =
      "toast";

    if (type === "warn") {
      toast.classList.add(
        "toast--warn"
      );
    }

    const icon =
      type === "warn"
        ? "fa-exclamation-circle"
        : "fa-check-circle";

    toast.innerHTML = `
      <i class="fas ${icon}" aria-hidden="true"></i>
      <span>${escapeHtml(message)}</span>
    `;

    root.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add(
        "toast--show"
      );
    });

    setTimeout(() => {
      toast.classList.remove(
        "toast--show"
      );

      setTimeout(() => {
        toast.remove();
      }, 350);
    }, duration);
  }

  /* =========================================================
     BACK TO TOP
     ========================================================= */

  function initBackToTop() {
    const button =
      $("#backToTop");

    if (!button) {
      return;
    }

    const update =
      () => {
        button.classList.toggle(
          "back-to-top--visible",
          window.scrollY > 450
        );
      };

    update();

    window.addEventListener(
      "scroll",
      update,
      {
        passive: true
      }
    );

    button.addEventListener(
      "click",
      () => {
        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });
      }
    );
  }

  /* =========================================================
     NEWSLETTER
     ========================================================= */

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
          $("input[type='email']", form);

        if (!input) {
          return;
        }

        const email =
          input.value.trim();

        if (!email || !input.checkValidity()) {
          input.classList.add(
            "field-error"
          );

          showToast(
            "Please enter a valid email address.",
            "warn"
          );

          setTimeout(() => {
            input.classList.remove(
              "field-error"
            );
          }, 500);

          return;
        }

        safeStorageSet(
          "sl_newsletter_email",
          email
        );

        input.value = "";

        showToast(
          "Thanks! You are subscribed to SneakersLink updates.",
          "success"
        );
      }
    );
  }

  /* =========================================================
     PRODUCT DETAIL PAGE
     ========================================================= */

  function initProductPage() {
    const mainImage =
      $("#mainImg");

    if (!mainImage) {
      return;
    }

    $$(".small-img-col img").forEach(
      (thumbnail) => {
        thumbnail.setAttribute(
          "tabindex",
          "0"
        );

        const changeImage =
          () => {
            const source =
              thumbnail.getAttribute("src");

            if (source) {
              mainImage.setAttribute(
                "src",
                source
              );
            }
          };

        thumbnail.addEventListener(
          "click",
          changeImage
        );

        thumbnail.addEventListener(
          "keydown",
          (event) => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();
              changeImage();
            }
          }
        );
      }
    );

    /*
     * Product detail "Add to cart" support.
     * The detail page may use #addToCart or
     * a normal button inside .single-pro-details.
     */

    const details =
      $(".single-pro-details");

    if (!details) {
      return;
    }

    const addButton =
      $("#addToCart", details) ||
      $(
        "button.add-cart-btn",
        details
      ) ||
      $("button", details);

    if (!addButton) {
      return;
    }

    addButton.addEventListener(
      "click",
      (event) => {
        /*
         * Only intercept a button that actually
         * represents an add-to-cart action.
         */
        const buttonText =
          addButton.textContent
            .trim()
            .toLowerCase();

        if (
          !addButton.matches(
            ".add-cart-btn, #addToCart"
          ) &&
          !buttonText.includes("cart") &&
          !buttonText.includes("add")
        ) {
          return;
        }

        event.preventDefault();

        const nameElement =
          $("h2", details) ||
          $("h4", details);

        const priceElement =
          $("h4", details);

        const quantityInput =
          $("input[type='number']", details);

        const sizeSelect =
          $("select", details);

        const quantity =
          Math.max(
            1,
            parseInt(
              quantityInput?.value || "1",
              10
            ) || 1
          );

        const product = {
          id:
            document.body.dataset.productId ||
            `detail-${(
              nameElement?.textContent ||
              "sneaker"
            )
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")}`,

          name:
            nameElement?.textContent?.trim() ||
            "Sneaker",

          brand:
            document.body.dataset.brand ||
            "",

          price:
            parsePrice(
              priceElement?.textContent
            ),

          image:
            mainImage.getAttribute("src") ||
            "",

          size:
            sizeSelect?.value || "",

          quantity
        };

        const cart =
          getCart();

        const existing =
          cart.find(
            (item) =>
              item.id === product.id &&
              item.size === product.size
          );

        if (existing) {
          existing.quantity +=
            product.quantity;
        } else {
          cart.push(product);
        }

        saveCart(cart);

        updateCartBadge(true);

        showToast(
          `${product.name} added to your cart.`,
          "success"
        );
      }
    );
  }

  /* =========================================================
     TRACK ORDER PAGE
     ========================================================= */

  function initTrackOrder() {
    const form =
      $(".track-form");

    if (!form) {
      return;
    }

    const input =
      $("input", form);

    if (!input) {
      return;
    }

    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();

        const orderId =
          input.value.trim();

        if (!orderId) {
          input.classList.add(
            "field-error"
          );

          showToast(
            "Enter your order number to continue.",
            "warn"
          );

          setTimeout(() => {
            input.classList.remove(
              "field-error"
            );
          }, 500);

          return;
        }

        /*
         * If the track-order page already contains
         * its own Firebase/order lookup logic,
         * do not interfere with it.
         *
         * This fallback only provides a friendly
         * notification when no dedicated handler
         * has been attached.
         */

        if (
          typeof window.trackOrder ===
          "function"
        ) {
          return;
        }

        showToast(
          `Searching for order ${orderId}…`,
          "success"
        );
      }
    );
  }

  /* =========================================================
     RECENT ORDERS
     ========================================================= */

  function initRecentOrders() {
    $$(".recent-order-btn").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            const id =
              button.dataset.orderId ||
              button.textContent.trim();

            const input =
              $(".track-form input");

            if (input) {
              input.value = id;
              input.focus();

              const form =
                $(".track-form");

              if (form) {
                form.dispatchEvent(
                  new Event("submit", {
                    bubbles: true,
                    cancelable: true
                  })
                );
              }
            }
          }
        );
      }
    );
  }

  /* =========================================================
     TICKER ACCESSIBILITY
     ========================================================= */

  function initTicker() {
    const ticker =
      $(".ticker-track");

    if (!ticker) {
      return;
    }

    ticker.setAttribute(
      "aria-live",
      "off"
    );
  }

  /* =========================================================
     IMAGE FALLBACKS
     ========================================================= */

  function initImageFallbacks() {
    $$("img").forEach((image) => {
      image.addEventListener(
        "error",
        () => {
          image.classList.add(
            "image-load-error"
          );
        },
        {
          once: true
        }
      );
    });
  }

  /* =========================================================
     ESCAPE HTML
     ========================================================= */

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* =========================================================
     CROSS-TAB CART SYNC
     ========================================================= */

  function initStorageSync() {
    window.addEventListener(
      "storage",
      (event) => {
        if (event.key === STORAGE_KEY) {
          updateCartBadge();

          if (
            $("#cart table tbody")
          ) {
            renderCartPage();
          }
        }

        if (
          event.key === THEME_KEY &&
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

  /* =========================================================
     GLOBAL CART API
     ---------------------------------------------------------
     Allows other SneakersLink scripts such as
     firebase-orders.js / firebase-profile.js to
     interact with the cart without duplicating
     localStorage logic.
     ========================================================= */

  window.SneakersLinkCart = {
    get: getCart,

    count: getCartCount,

    subtotal: getCartSubtotal,

    add: (product) => {
      addToCart(product);
    },

    remove: (id) => {
      removeCartItem(id);
    },

    updateQuantity: (
      id,
      quantity
    ) => {
      updateCartQuantity(
        id,
        quantity
      );
    },

    clear: () => {
      saveCart([]);
      renderCartPage();
    }
  };

  /* =========================================================
     INITIALIZATION
     ========================================================= */

  function init() {
    /*
     * Theme first so the page never spends long
     * in the wrong visual state.
     */
    initTheme();

    updateCartBadge();

    initMobileNavigation();
    initActiveNavigation();
    initNavbarScroll();

    initProductCards();

    initCartPage();
    initCartEvents();
    initCoupon();

    initScrollReveal();

    initBackToTop();

    initNewsletter();

    initProductPage();

    initTrackOrder();
    initRecentOrders();

    initTicker();
    initImageFallbacks();

    initStorageSync();
  }

  /* =========================================================
     START
     ========================================================= */

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once: true
      }
    );
  } else {
    init();
  }

})();