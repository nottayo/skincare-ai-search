import React, { useState, useEffect } from 'react';
import './DynamicWidget.css';

const DynamicWidget = ({ onCartUpdate }) => {
  const [cartItems, setCartItems] = useState([]);
  const [cartId, setCartId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);

  // Monitor cart changes
  useEffect(() => {
    const checkCart = () => {
      fetch('/cart.js')
        .then(res => res.json())
        .then(cart => {
          const currentCartItems = cart.items || [];
          setCartItems(currentCartItems);
          
          // Only create/update cart page if items exist
          if (currentCartItems.length > 0) {
            createOrUpdateCartPage(currentCartItems);
          } else {
            setCartId('');
            setLastUpdateTime(null);
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
      
      // Use existing cart ID if available, otherwise create new one
      const endpoint = cartId ? `/api/cart/${cartId}/update` : '/api/cart/create';
      const method = cartId ? 'PUT' : 'POST';
      
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
            source: 'dynamic_widget',
            cart_id: cartId
          }
        })
      });
      
      if (response.ok) {
        const cartData = await response.json();
        
        // If creating new cart, get the cart ID
        if (!cartId && cartData.cart_id) {
          setCartId(cartData.cart_id);
        }
        
        const finalCartId = cartId || cartData.cart_id;
        setLastUpdateTime(new Date());
        
        // Notify parent component about cart update
        if (onCartUpdate) {
          onCartUpdate({
            cartId: finalCartId,
            items: enhancedItems,
            totalItems: getTotalItems(),
            totalPrice: getTotalPrice(),
            cartUrl: `${window.location.origin}/cart/${finalCartId}`
          });
        }
      }
    } catch (error) {
      console.error('Error creating/updating cart page:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + (item.quantity || 1), 0);
  };

  const getTotalPrice = () => {
    return cartItems.reduce((total, item) => total + (item.final_price || 0), 0) / 100;
  };

  const copyCartLink = async () => {
    if (cartId) {
      const cartUrl = `${window.location.origin}/cart/${cartId}`;
      try {
        await navigator.clipboard.writeText(cartUrl);
        // You could add a toast notification here
      } catch (error) {
        console.error('Failed to copy link:', error);
      }
    }
  };

  // Don't render if no items in cart
  if (cartItems.length === 0) {
    return null;
  }

  return (
    <div className="dynamic-widget-bubble">
      <div className="dynamic-widget-header">
        <div className="dynamic-widget-title">
          🛒 Your Cart ({getTotalItems()} items)
        </div>
        <div className="dynamic-widget-total">
          ${getTotalPrice().toFixed(2)}
        </div>
      </div>
      
      <div className="dynamic-widget-items">
        {cartItems.slice(0, 3).map((item, index) => (
          <div key={index} className="dynamic-widget-item">
            <div className="dynamic-widget-item-image">
              {item.product_image ? (
                <img src={item.product_image} alt={item.product_title} />
              ) : (
                <div className="dynamic-widget-item-placeholder">🛍️</div>
              )}
            </div>
            <div className="dynamic-widget-item-details">
              <div className="dynamic-widget-item-title">
                {item.product_title || item.title}
              </div>
              <div className="dynamic-widget-item-variant">
                {item.variant_title && `${item.variant_title}`}
              </div>
              <div className="dynamic-widget-item-price">
                ${(item.final_price / 100).toFixed(2)} × {item.quantity}
              </div>
            </div>
          </div>
        ))}
        
        {cartItems.length > 3 && (
          <div className="dynamic-widget-more">
            +{cartItems.length - 3} more items
          </div>
        )}
      </div>
      
      <div className="dynamic-widget-actions">
        <button 
          className="dynamic-widget-btn dynamic-widget-btn-primary"
          onClick={() => window.open(`/cart/${cartId}`, '_blank')}
        >
          View Full Cart
        </button>
        <button 
          className="dynamic-widget-btn dynamic-widget-btn-secondary"
          onClick={copyCartLink}
        >
          Copy Link
        </button>
      </div>
      
      {lastUpdateTime && (
        <div className="dynamic-widget-timestamp">
          Updated: {lastUpdateTime.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default DynamicWidget; 