import React, { useState, useEffect } from 'react';
import Chatbot from './components/Chatbot';
import AjaxCartButton from './components/AjaxCartButton';
import './App.css';

function App() {
  const [mockCart, setMockCart] = useState([]);

  // Mock cart functionality for testing
  const addToMockCart = (product) => {
    setMockCart(prev => [...prev, {
      id: Date.now() + Math.random(),
      product_title: product.name,
      final_price: product.price * 100, // Convert to cents
      quantity: 1,
      variant_options: product.variants || []
    }]);
  };

  const clearMockCart = () => {
    setMockCart([]);
  };

  // Override fetch to use mock cart
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
      if (url === '/cart.js') {
        return Promise.resolve({
          json: () => Promise.resolve({
            items: mockCart
          })
        });
      }
      return originalFetch.apply(this, arguments);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [mockCart]);

  const testProducts = [
    { name: "Beauty Cream", price: 25.99, variants: [{ name: "Size", value: "50ml" }] },
    { name: "Facial Cleanser", price: 18.50, variants: [{ name: "Type", value: "Gentle" }] },
    { name: "Eye Serum", price: 32.99, variants: [{ name: "Formula", value: "Anti-aging" }] },
    { name: "Lip Balm", price: 12.99, variants: [{ name: "Flavor", value: "Berry" }] }
  ];

  return (
    <div className="App">
      {/* Test Interface */}
      <div className="test-interface">
        <h2>🧪 Test Dynamic Checkout Widget</h2>
        <div className="test-products">
          {testProducts.map((product, index) => (
            <button 
              key={index}
              className="test-product-btn"
              onClick={() => addToMockCart(product)}
            >
              Add {product.name} (${product.price})
            </button>
          ))}
        </div>
        <button className="clear-cart-btn" onClick={clearMockCart}>
          Clear Cart
        </button>
        <div className="cart-status">
          Items in cart: {mockCart.length}
        </div>
      </div>

      <Chatbot />
      <div style={{ 
        position: 'fixed', 
        bottom: '20px', 
        right: '20px', 
        zIndex: 1000 
      }}>
        <AjaxCartButton 
          buttonText="Here is my cart"
          position="inline"
          showCartId={false}
          showTotal={false}
        />
      </div>
    </div>
  );
}

export default App;