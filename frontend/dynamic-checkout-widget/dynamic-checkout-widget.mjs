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
  const [showTooltip, setShowTooltip] = useState(false);
  const [lastCartState, setLastCartState] = useState([]);
  const intervalRef = useRef(null);
  useEffect(() => {
    const checkCart = () => {
      fetch("/cart.js").then((res) => res.json()).then((cart) => {
        const currentCartItems = cart.items || [];
        const currentCartIds = currentCartItems.map((item) => item.id).sort();
        const lastCartIds = lastCartState.map((item) => item.id).sort();
        if (JSON.stringify(currentCartIds) !== JSON.stringify(lastCartIds)) {
          setCartItems(currentCartItems);
          setLastCartState(currentCartItems);
          if (currentCartItems.length > 0) {
            createCartPage(currentCartItems);
          } else {
            setCartUrl("");
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
  const createCartPage = async (items) => {
    if (items.length === 0) return;
    setIsLoading(true);
    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const API_URL = isLocalhost ? "http://localhost:10000/api/cart/create" : "https://skincare-ai-backend.onrender.com/api/cart/create";
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items,
          user_info: {
            user_agent: navigator.userAgent,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            source: "dynamic_checkout_widget"
          }
        })
      });
      if (response.ok) {
        const cartData = await response.json();
        const fullCartUrl = `${window.location.origin}${cartData.cart_url}`;
        setCartUrl(fullCartUrl);
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
    }
  };
  const copyCartLink = async () => {
    if (cartUrl) {
      try {
        await navigator.clipboard.writeText(cartUrl);
        setShowTooltip(true);
        setTimeout(() => setShowTooltip(false), 2e3);
      } catch (error) {
        console.error("Failed to copy link:", error);
      }
    }
  };
  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + (item.quantity || 1), 0);
  };
  const getTotalPrice = () => {
    return cartItems.reduce((total, item) => total + (item.final_price || 0), 0) / 100;
  };
  if (cartItems.length === 0) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dynamic-checkout-widget", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "checkout-button-container", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "dynamic-checkout-btn",
          onClick: handleCheckoutClick,
          disabled: isLoading || !cartUrl,
          children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "loading-spinner", children: "⏳" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "checkout-icon", children: "🛒" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "checkout-text", children: [
              "Here is my cart (",
              getTotalItems(),
              " items)"
            ] })
          ] })
        }
      ),
      cartUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "copy-link-btn",
          onClick: copyCartLink,
          title: "Copy cart link",
          children: "📋"
        }
      )
    ] }),
    showTooltip && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "tooltip", children: "Cart link copied! 📋" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cart-summary", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "summary-item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "summary-label", children: "Items:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "summary-value", children: getTotalItems() })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "summary-item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "summary-label", children: "Total:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "summary-value", children: [
          "$",
          getTotalPrice().toFixed(2)
        ] })
      ] })
    ] })
  ] });
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
