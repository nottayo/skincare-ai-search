import React, { useState, useEffect, useRef } from 'react';
import './DynamicCheckout.css';

const DynamicCheckout = () => {
  const [cartItems, setCartItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cartUrl, setCartUrl] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);
  const [lastCartState, setLastCartState] = useState([]);
  const [cartId, setCartId] = useState('');
  const intervalRef = useRef(null);

  // Monitor cart changes
  useEffect(() => {
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
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const API_URL = isLocalhost
        ? 'http://localhost:10000/api/cart/create'
        : 'https://skincare-ai-backend.onrender.com/api/cart/create';
      
      // If we already have a cart ID, update it instead of creating new one
      const endpoint = cartId ? `/api/cart/${cartId}/update` : '/api/cart/create';
      const method = cartId ? 'PUT' : 'POST';
      
      const response = await fetch(API_URL.replace('/create', endpoint), {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: items,
          user_info: {
            user_agent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            source: 'dynamic_checkout_widget'
          }
        })
      });
      
      if (response.ok) {
        const cartData = await response.json();
        
        // If creating new cart, get the cart ID
        if (!cartId && cartData.cart_id) {
          setCartId(cartData.cart_id);
        }
        
        const fullCartUrl = `${window.location.origin}/cart/${cartId || cartData.cart_id}`;
        setCartUrl(fullCartUrl);
      }
    } catch (error) {
      console.error('Error creating/updating cart page:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckoutClick = () => {
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

  // Don't render if no items in cart
  if (cartItems.length === 0) {
    return null;
  }

  return (
    <div className="dynamic-checkout-widget">
      <div className="checkout-button-container">
        <button 
          className="dynamic-checkout-btn"
          onClick={handleCheckoutClick}
          disabled={isLoading || !cartUrl}
        >
          {isLoading ? (
            <span className="loading-spinner">⏳</span>
          ) : (
            <>
              <span className="checkout-icon">🛒</span>
              <span className="checkout-text">
                Here is my cart ({getTotalItems()} items)
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
      
      <div className="cart-summary">
        <div className="summary-item">
          <span className="summary-label">Items:</span>
          <span className="summary-value">{getTotalItems()}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Total:</span>
          <span className="summary-value">${getTotalPrice().toFixed(2)}</span>
        </div>
      </div>
      
      {cartId && (
        <div className="cart-id-display">
          <span className="cart-id-label">Cart ID:</span>
          <span className="cart-id-value">{cartId}</span>
        </div>
      )}
    </div>
  );
};

export default DynamicCheckout; 