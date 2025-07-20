import React, { useState, useEffect, useRef } from 'react';
import './DynamicCheckout.css';

const DynamicCheckout = () => {
  const [cartItems, setCartItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cartUrl, setCartUrl] = useState('');
  const [lastCartState, setLastCartState] = useState([]);
  const [cartId, setCartId] = useState('');
  const [showCopied, setShowCopied] = useState(false);
  const [cartExpiresAt, setCartExpiresAt] = useState(null);
  const intervalRef = useRef(null);

  // Monitor cart changes
  useEffect(() => {
    // Load existing cart expiry time
    const existingExpiresAt = localStorage.getItem('mamatega_cart_expires');
    if (existingExpiresAt) {
      setCartExpiresAt(existingExpiresAt);
    }
    
    // Load existing cart URL and update it to use backend URL
    const existingCartId = localStorage.getItem('mamatega_cart_id');
    if (existingCartId) {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const backendUrl = isLocalhost ? 'http://localhost:5001' : `http://${window.location.hostname}:5001`;
      const fullCartUrl = `${backendUrl}/cart/${existingCartId}`;
      setCartUrl(fullCartUrl);
      setCartId(existingCartId);
    }
    
    const checkCart = () => {
      fetch('/cart.js')
        .then(res => res.json())
        .then(cart => {
          const currentCartItems = cart.items || [];
          const currentCartIds = currentCartItems.map(item => item.id).sort();
          const lastCartIds = lastCartState.map(item => item.id).sort();
          
          // Check if cart actually changed
          if (JSON.stringify(currentCartIds) !== JSON.stringify(lastCartIds)) {
            setCartItems(currentCartItems);
            setLastCartState(currentCartItems);
            
            // Create or update cart page if items exist
            if (currentCartItems.length > 0) {
              createOrUpdateCartPage(currentCartItems);
            } else {
              setCartUrl('');
              setCartId('');
            }
          }
        })
        .catch(error => {
          console.error('Error fetching cart:', error);
        });
    };

    // Check cart immediately
    checkCart();

    // Set up interval to check cart every 30 seconds
    intervalRef.current = setInterval(checkCart, 30000);

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
      // Set CART_API_URL to Vercel backend
      const CART_API_URL = 'https://nodejs-backend-6y9w8010b-tayos-projects-cec8e285.vercel.app/api/cart/create';
      
      // Get existing cart ID from localStorage
      const existingCartId = localStorage.getItem('mamatega_cart_id');
      
      const response = await fetch(CART_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: items,
          existing_cart_id: existingCartId,
          user_info: {
            user_agent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            source: 'dynamic_checkout_widget',
            referrer: window.location.href
          }
        })
      });
      
      if (response.ok) {
        const cartData = await response.json();
        setCartId(cartData.cart_id);
        // When setting cartUrl, use the Vercel backend URL
        const fullCartUrl = `https://nodejs-backend-6y9w8010b-tayos-projects-cec8e285.vercel.app/cart/${cartData.cart_id}`;
        setCartUrl(fullCartUrl);
        
        // Store cart ID in localStorage for persistence
        localStorage.setItem('mamatega_cart_id', cartData.cart_id);
        localStorage.setItem('mamatega_cart_expires', cartData.expires_at);
        setCartExpiresAt(cartData.expires_at);
      }
    } catch (error) {
      console.error('Error creating cart page:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const SHOPIFY_CART_PAGE = 'https://shopmamatega.com/pages/add-to-cart';

  const handleCheckoutClick = () => {
    window.open(SHOPIFY_CART_PAGE, '_blank');
  };

  const copyCartLink = async () => {
    if (cartUrl) {
      try {
        await navigator.clipboard.writeText(cartUrl);
        setShowCopied(true);
        setTimeout(() => setShowCopied(false), 2000);
      } catch (error) {
        console.error('Failed to copy link:', error);
      }
    }
  };

  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + (item.quantity || 1), 0);
  };

  const getTimeRemaining = () => {
    const expiresAt = cartExpiresAt || localStorage.getItem('mamatega_cart_expires');
    if (!expiresAt) return null;
    
    const now = new Date();
    const expiry = new Date(expiresAt);
    
    // Check if the date is valid
    if (isNaN(expiry.getTime())) return null;
    
    const timeRemaining = expiry - now;
    
    if (timeRemaining <= 0) return 'Expired';
    
    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    
    // Check if calculations are valid
    if (isNaN(hours) || isNaN(minutes)) return null;
    
    return `${hours}h ${minutes}m`;
  };

  const timeRemaining = getTimeRemaining();

  return (
    <div className="dynamic-checkout-container">
      <button 
        className="dynamic-checkout-btn"
        onClick={handleCheckoutClick}
        disabled={false}
        title="Go to Shopify Add to Cart page"
      >
        <span className="checkout-icon">🛒</span>
        <span className="checkout-text">
          Go to Cart Page
        </span>
      </button>
    </div>
  );
};

export default DynamicCheckout; 
