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

  // Monitor cart changes
  useEffect(() => {
    const checkCart = () => {
      fetch('/cart.js')
        .then(res => res.json())
        .then(cart => {
          const currentCartItems = cart.items || [];
          setCartItems(currentCartItems);
          
          // Create or update cart page if items exist
          if (currentCartItems.length > 0) {
            createOrUpdateCartPage(currentCartItems);
          } else {
            setCartUrl('');
            setCartId('');
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
            source: 'ajax_cart_button'
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

  // Don't render if no items in cart
  if (cartItems.length === 0) {
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