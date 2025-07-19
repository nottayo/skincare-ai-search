import React, { useState, useEffect } from 'react';
import './AjaxCartButton.css';

const AjaxCartButton = ({ 
  buttonText = "Here is my cart", 
  buttonClass = "ajax-cart-btn",
  showCartId = true,
  showTotal = true,
  position = "fixed" // fixed, inline, or absolute
}) => {
  const [cartItems, setCartItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cartUrl, setCartUrl] = useState('');
  const [cartId, setCartId] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);

  // Cookie management functions
  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  };

  const setCookie = (name, value, days = 365) => {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
  };

  const deleteCookie = (name) => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  };

  // Check if cookies are enabled
  const areCookiesEnabled = () => {
    try {
      setCookie('test_cookie', 'test');
      const enabled = getCookie('test_cookie') === 'test';
      deleteCookie('test_cookie');
      return enabled;
    } catch (e) {
      return false;
    }
  };

  // Monitor cart changes
  useEffect(() => {
    const checkCart = () => {
      fetch('/cart.js')
        .then(res => res.json())
        .then(cart => {
          const currentCartItems = cart.items || [];
          setCartItems(currentCartItems);
          
          // Check if cookies are enabled
          if (!areCookiesEnabled()) {
            console.warn('Cookies are disabled. Cart tracking will not work properly.');
            return;
          }
          
          // Get existing cart ID from cookie
          const existingCartId = getCookie('mamatega_cart_id');
          
          // Create or update cart page if items exist
          if (currentCartItems.length > 0) {
            createOrUpdateCartPage(currentCartItems, existingCartId);
          } else {
            setCartUrl('');
            setCartId('');
            // Clear cart ID cookie when cart is empty
            deleteCookie('mamatega_cart_id');
          }
        })
        .catch(error => {
          console.error('Error fetching cart:', error);
        });
    };

    // Check cart immediately
    checkCart();

    // Set up interval to check cart every 30 seconds
    const interval = setInterval(checkCart, 30000);

    return () => clearInterval(interval);
  }, []);

  const createOrUpdateCartPage = async (items, existingCartId = null) => {
    if (items.length === 0) return;
    
    setIsLoading(true);
    try {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const API_URL = isLocalhost
        ? 'http://localhost:10000/api/cart/create'
        : 'https://skincare-ai-backend.onrender.com/api/cart/create';
      
      // Use existing cart ID if available, otherwise create new one
      const cartIdToUse = existingCartId || cartId;
      const endpoint = cartIdToUse ? `/api/cart/${cartIdToUse}/update` : '/api/cart/create';
      const method = cartIdToUse ? 'PUT' : 'POST';
      
      // Enhance cart items with full product details
      const enhancedItems = await Promise.all(items.map(async (item) => {
        // Get full product details from Shopify
        try {
          const productResponse = await fetch(`/products/${item.handle}.js`);
          if (productResponse.ok) {
            const product = await productResponse.json();
            return {
              ...item,
              product_title: product.title,
              product_description: product.description,
              product_handle: product.handle,
              product_url: `${window.location.origin}/products/${product.handle}`,
              product_image: product.featured_image || product.images?.[0] || null,
              product_type: product.product_type,
              product_vendor: product.vendor,
              variant_title: item.variant_title || '',
              variant_options: item.variant_options || [],
              final_price: item.final_price,
              original_price: item.original_price || item.final_price,
              quantity: item.quantity,
              line_price: item.final_line_price || (item.final_price * item.quantity)
            };
          }
        } catch (error) {
          console.warn('Could not fetch full product details for:', item.handle);
        }
        
        // Fallback to basic item data
        return {
          ...item,
          product_title: item.product_title || item.title,
          product_handle: item.handle,
          product_url: item.url || `${window.location.origin}/products/${item.handle}`,
          product_image: item.featured_image || item.image,
          variant_title: item.variant_title || '',
          variant_options: item.variant_options || [],
          final_price: item.final_price,
          original_price: item.original_price || item.final_price,
          quantity: item.quantity,
          line_price: item.final_line_price || (item.final_price * item.quantity)
        };
      }));
      
      const response = await fetch(API_URL.replace('/create', endpoint), {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: enhancedItems,
          user_info: {
            user_agent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            source: 'ajax_cart_button',
            cart_id: cartIdToUse,
            cookies_enabled: areCookiesEnabled()
          }
        })
      });
      
      if (response.ok) {
        const cartData = await response.json();
        
        // If creating new cart, get the cart ID and store in cookie
        if (!cartIdToUse && cartData.cart_id) {
          const newCartId = cartData.cart_id;
          setCartId(newCartId);
          setCookie('mamatega_cart_id', newCartId);
        } else if (cartIdToUse) {
          setCartId(cartIdToUse);
        }
        
        const finalCartId = cartIdToUse || cartData.cart_id;
        // Use simple /cart URL since cart ID is stored in cookie
        const fullCartUrl = `${window.location.origin}/cart`;
        setCartUrl(fullCartUrl);
      }
    } catch (error) {
      console.error('Error creating/updating cart page:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = () => {
    if (cartUrl) {
      window.open(cartUrl, '_blank');
    }
  };

  const copyCartLink = async () => {
    if (cartUrl) {
      try {
        await navigator.clipboard.writeText(cartUrl);
        setShowTooltip(true);
        setTimeout(() => setShowTooltip(false), 2000);
      } catch (error) {
        console.error('Failed to copy link:', error);
      }
    }
  };

  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + (item.quantity || 1), 0);
  };

  const getTotalPrice = () => {
    return cartItems.reduce((total, item) => total + (item.final_price || 0), 0) / 100;
  };

  // Don't render if no items in cart or cookies disabled
  if (cartItems.length === 0 || !areCookiesEnabled()) {
    return null;
  }

  const containerClass = `ajax-cart-container ${position}`;

  return (
    <div className={containerClass}>
      <div className="ajax-cart-content">
        <button 
          className={buttonClass}
          onClick={handleClick}
          disabled={isLoading || !cartUrl}
        >
          {isLoading ? (
            <span className="loading-spinner">⏳</span>
          ) : (
            <>
              <span className="cart-icon">🛒</span>
              <span className="cart-text">
                {buttonText} ({getTotalItems()} items)
              </span>
            </>
          )}
        </button>
        
        {cartUrl && (
          <button 
            className="copy-link-btn"
            onClick={copyCartLink}
            title="Copy cart link"
          >
            📋
          </button>
        )}
      </div>
      
      {showTooltip && (
        <div className="tooltip">
          Cart link copied! 📋
        </div>
      )}
      
      {showTotal && (
        <div className="cart-total">
          <span className="total-label">Total:</span>
          <span className="total-value">${getTotalPrice().toFixed(2)}</span>
        </div>
      )}
      
      {showCartId && cartId && (
        <div className="cart-id">
          <span className="id-label">ID:</span>
          <span className="id-value">{cartId}</span>
        </div>
      )}
    </div>
  );
};

export default AjaxCartButton; 