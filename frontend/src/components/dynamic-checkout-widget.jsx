import React from 'react';
import ReactDOM from 'react-dom';
import DynamicCheckout from './DynamicCheckout';
import './DynamicCheckout.css';

// Widget initialization function
window.initDynamicCheckout = function(containerId = 'dynamic-checkout-container') {
  // Create container if it doesn't exist
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    document.body.appendChild(container);
  }

  // Render the widget
  ReactDOM.render(
    <React.StrictMode>
      <DynamicCheckout />
    </React.StrictMode>,
    container
  );

  // Return cleanup function
  return function() {
    ReactDOM.unmountComponentAtNode(container);
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  };
};

// Auto-initialize if script is loaded directly
if (typeof document !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.initDynamicCheckout();
    });
  } else {
    window.initDynamicCheckout();
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initDynamicCheckout: window.initDynamicCheckout };
} 


