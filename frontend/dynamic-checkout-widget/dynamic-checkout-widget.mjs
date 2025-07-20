import require$$0, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
var jsxRuntime = { exports: {} };
var reactJsxRuntime_production_min = {};
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var hasRequiredReactJsxRuntime_production_min;
function requireReactJsxRuntime_production_min() {
  if (hasRequiredReactJsxRuntime_production_min) return reactJsxRuntime_production_min;
  hasRequiredReactJsxRuntime_production_min = 1;
  var f = require$$0, k = Symbol.for("react.element"), l = Symbol.for("react.fragment"), m = Object.prototype.hasOwnProperty, n = f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, p = { key: true, ref: true, __self: true, __source: true };
  function q(c, a, g) {
    var b, d = {}, e = null, h = null;
    void 0 !== g && (e = "" + g);
    void 0 !== a.key && (e = "" + a.key);
    void 0 !== a.ref && (h = a.ref);
    for (b in a) m.call(a, b) && !p.hasOwnProperty(b) && (d[b] = a[b]);
    if (c && c.defaultProps) for (b in a = c.defaultProps, a) void 0 === d[b] && (d[b] = a[b]);
    return { $$typeof: k, type: c, key: e, ref: h, props: d, _owner: n.current };
  }
  reactJsxRuntime_production_min.Fragment = l;
  reactJsxRuntime_production_min.jsx = q;
  reactJsxRuntime_production_min.jsxs = q;
  return reactJsxRuntime_production_min;
}
var hasRequiredJsxRuntime;
function requireJsxRuntime() {
  if (hasRequiredJsxRuntime) return jsxRuntime.exports;
  hasRequiredJsxRuntime = 1;
  {
    jsxRuntime.exports = requireReactJsxRuntime_production_min();
  }
  return jsxRuntime.exports;
}
var jsxRuntimeExports = requireJsxRuntime();
const DynamicCheckout = () => {
  const [cartItems, setCartItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cartUrl, setCartUrl] = useState("");
  const [lastCartState, setLastCartState] = useState([]);
  const [cartId, setCartId] = useState("");
  const [showCopied, setShowCopied] = useState(false);
  const [cartExpiresAt, setCartExpiresAt] = useState(null);
  const intervalRef = useRef(null);
  useEffect(() => {
    const existingExpiresAt = localStorage.getItem("mamatega_cart_expires");
    if (existingExpiresAt) {
      setCartExpiresAt(existingExpiresAt);
    }
    const existingCartId = localStorage.getItem("mamatega_cart_id");
    if (existingCartId) {
      const backendUrl = 'https://nodejs-backend-6y9w8010b-tayos-projects-cec8e285.vercel.app';
      const fullCartUrl = `${backendUrl}/cart/${existingCartId}`;
      setCartUrl(fullCartUrl);
      setCartId(existingCartId);
    }
    const checkCart = () => {
      fetch("/cart.js").then((res) => res.json()).then((cart) => {
        const currentCartItems = cart.items || [];
        const currentCartIds = currentCartItems.map((item) => item.id).sort();
        const lastCartIds = lastCartState.map((item) => item.id).sort();
        if (JSON.stringify(currentCartIds) !== JSON.stringify(lastCartIds)) {
          setCartItems(currentCartItems);
          setLastCartState(currentCartItems);
          if (currentCartItems.length > 0) {
            createOrUpdateCartPage(currentCartItems);
          } else {
            setCartUrl("");
            setCartId("");
          }
        }
      }).catch((error) => {
        console.error("Error fetching cart:", error);
      });
    };
    checkCart();
    intervalRef.current = setInterval(checkCart, 3e4);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [lastCartState]);
  const createOrUpdateCartPage = async (items) => {
    if (items.length === 0) return;
    setIsLoading(true);
    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const API_URL = isLocalhost ? "http://localhost:5001/api/cart/create" : `http://${window.location.hostname}:5001/api/cart/create`;
      const existingCartId = localStorage.getItem("mamatega_cart_id");
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items,
          existing_cart_id: existingCartId,
          user_info: {
            user_agent: navigator.userAgent,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            source: "dynamic_checkout_widget",
            referrer: window.location.href
          }
        })
      });
      if (response.ok) {
        const cartData = await response.json();
        setCartId(cartData.cart_id);
        const isLocalhost2 = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const backendUrl = isLocalhost2 ? "http://localhost:5001" : `http://${window.location.hostname}:5001`;
        const fullCartUrl = `${backendUrl}/cart/${cartData.cart_id}`;
        setCartUrl(fullCartUrl);
        localStorage.setItem("mamatega_cart_id", cartData.cart_id);
        localStorage.setItem("mamatega_cart_expires", cartData.expires_at);
        setCartExpiresAt(cartData.expires_at);
      }
    } catch (error) {
      console.error("Error creating cart page:", error);
    } finally {
      setIsLoading(false);
    }
  };
  const handleCheckoutClick = () => {
    if (cartUrl) {
      window.open(cartUrl, "_blank");
    } else if (cartItems.length > 0) {
      createOrUpdateCartPage(cartItems);
    }
  };
  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + (item.quantity || 1), 0);
  };
  const getTimeRemaining = () => {
    const expiresAt = cartExpiresAt || localStorage.getItem("mamatega_cart_expires");
    if (!expiresAt) return null;
    const now = /* @__PURE__ */ new Date();
    const expiry = new Date(expiresAt);
    if (isNaN(expiry.getTime())) return null;
    const timeRemaining2 = expiry - now;
    if (timeRemaining2 <= 0) return "Expired";
    const hours = Math.floor(timeRemaining2 / (1e3 * 60 * 60));
    const minutes = Math.floor(timeRemaining2 % (1e3 * 60 * 60) / (1e3 * 60));
    if (isNaN(hours) || isNaN(minutes)) return null;
    return `${hours}h ${minutes}m`;
  };
  const timeRemaining = getTimeRemaining();
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dynamic-checkout-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      className: "dynamic-checkout-btn",
      onClick: handleCheckoutClick,
      disabled: isLoading,
      title: cartUrl ? `Click to view cart page (Expires in: ${timeRemaining || "Unknown"})` : "Add items to cart first",
      children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "loading-spinner", children: "⏳" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "checkout-icon", children: "🛒" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "checkout-text", children: [
          getTotalItems(),
          " items",
          timeRemaining && timeRemaining !== "Expired" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: "11px", display: "block", opacity: 0.8 }, children: "Expires in 30 days" }),
          !timeRemaining && cartItems.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: "11px", display: "block", opacity: 0.8 }, children: "Click to create cart" })
        ] })
      ] })
    }
  ) });
};
window.initDynamicCheckout = function(containerId = "dynamic-checkout-container") {
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    document.body.appendChild(container);
  }
  ReactDOM.render(
    /* @__PURE__ */ jsxRuntimeExports.jsx(require$$0.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DynamicCheckout, {}) }),
    container
  );
  return function() {
    ReactDOM.unmountComponentAtNode(container);
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  };
};
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.initDynamicCheckout();
    });
  } else {
    window.initDynamicCheckout();
  }
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { initDynamicCheckout: window.initDynamicCheckout };
}
//# sourceMappingURL=dynamic-checkout-widget.mjs.map



