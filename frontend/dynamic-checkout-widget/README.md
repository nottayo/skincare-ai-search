# 🛒 Dynamic Checkout Widget

A beautiful, responsive checkout widget that replaces traditional checkout buttons with dynamic cart pages. Perfect for Shopify stores and any e-commerce website.

## ✨ Features

- **🔄 Real-time Cart Monitoring** - Automatically detects cart changes
- **🎨 Beautiful Cart Pages** - Professional, branded cart displays
- **📱 Mobile Responsive** - Works perfectly on all devices
- **🔗 Easy Sharing** - WhatsApp and Instagram integration
- **📋 Copy Link** - One-click cart link copying
- **🎯 Unique Cart IDs** - Each cart gets a unique identifier
- **⚡ Fast Loading** - Optimized for performance
- **🌙 Dark Mode Support** - Automatic dark mode detection

## 🚀 Quick Start

### 1. Include Dependencies

Add React and ReactDOM to your HTML:

```html
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
```

### 2. Include the Widget

Add the dynamic checkout widget script:

```html
<script src="dynamic-checkout-widget.umd.js"></script>
<link rel="stylesheet" href="dynamic-checkout-widget.css">
```

### 3. Auto-Initialization

The widget will automatically initialize and appear when items are added to the cart.

## 📋 Installation Options

### Option 1: Auto-Initialization (Recommended)

The widget automatically initializes when the script loads:

```html
<!-- Just include the script and it works! -->
<script src="dynamic-checkout-widget.umd.js"></script>
```

### Option 2: Manual Initialization

Initialize the widget manually:

```html
<script>
  // Initialize with default container
  window.initDynamicCheckout();
  
  // Or specify a custom container
  window.initDynamicCheckout('my-custom-container');
</script>
```

### Option 3: Custom Container

Create a specific container for the widget:

```html
<div id="my-checkout-widget"></div>
<script>
  window.initDynamicCheckout('my-checkout-widget');
</script>
```

## 🎯 How It Works

### Cart Monitoring
The widget automatically monitors your cart by calling `/cart.js` every 30 seconds. It detects:
- Items added to cart
- Items removed from cart
- Quantity changes
- Price updates

### Cart Page Creation
When items are detected in the cart:
1. **Creates unique cart ID** (e.g., `CART000001`)
2. **Generates beautiful cart page** with all items
3. **Shows widget button** with item count and total
4. **Enables sharing** via WhatsApp, Instagram, or copy link

### Cart Page Features
Each cart page includes:
- **Product details** (name, variant, quantity, price)
- **Total calculation** (automatic price summing)
- **Store information** (location, hours, contact)
- **Action buttons** (WhatsApp, Instagram, Copy Link)
- **Responsive design** (mobile-friendly)

## 🛠️ Integration Examples

### Shopify Integration

Replace your checkout button with the widget:

```html
<!-- Remove this -->
<button onclick="window.location.href='/checkout'">Checkout</button>

<!-- Add this instead -->
<script src="dynamic-checkout-widget.umd.js"></script>
<link rel="stylesheet" href="dynamic-checkout-widget.css">
```

### Custom E-commerce Integration

For non-Shopify stores, ensure your cart endpoint returns the expected format:

```javascript
// Your cart endpoint should return this format
fetch('/cart.js').then(res => res.json()).then(cart => {
  // cart.items should be an array of:
  // {
  //   id: "product_id",
  //   product_title: "Product Name",
  //   final_price: 2599, // in cents
  //   quantity: 1,
  //   variant_options: [
  //     { name: "Size", value: "Large" },
  //     { name: "Color", value: "Blue" }
  //   ]
  // }
});
```

## 🎨 Customization

### CSS Customization

The widget uses CSS custom properties for easy theming:

```css
.dynamic-checkout-widget {
  --primary-color: #667eea;
  --secondary-color: #764ba2;
  --text-color: #333;
  --background-color: white;
  --border-radius: 15px;
}
```

### Positioning

The widget is positioned fixed by default. You can modify the CSS:

```css
.dynamic-checkout-widget {
  position: fixed;
  right: 20px;
  bottom: 20px;
  /* Change position as needed */
}
```

## 📱 Mobile Responsiveness

The widget automatically adapts to mobile devices:
- **Stacked layout** on small screens
- **Touch-friendly buttons** with proper sizing
- **Optimized spacing** for mobile interaction
- **Full-width buttons** on very small screens

## 🌙 Dark Mode Support

The widget automatically detects and adapts to dark mode:

```css
@media (prefers-color-scheme: dark) {
  .dynamic-checkout-widget {
    background: #2d3748;
    color: white;
  }
}
```

## 🔧 API Integration

The widget integrates with the cart API endpoints:

### Create Cart Page
```javascript
POST /api/cart/create
{
  "items": [...],
  "user_info": {
    "user_agent": "...",
    "timestamp": "...",
    "source": "dynamic_checkout_widget"
  }
}
```

### Get Cart Data
```javascript
GET /api/cart/{cart_id}
```

### Update Cart
```javascript
PUT /api/cart/{cart_id}/update
{
  "items": [...]
}
```

## 🎯 Cart Page URL Structure

Cart pages are accessible at:
```
https://yourdomain.com/cart/{cart_id}
```

Example:
```
https://shopmamatega.com/cart/CART000001
```

## 📊 Performance

- **Lightweight** - Only 3.9KB gzipped
- **Fast loading** - Optimized bundle with tree shaking
- **Efficient monitoring** - 30-second intervals for cart checks
- **Minimal DOM impact** - Only renders when needed

## 🔒 Security

- **No sensitive data** stored in the widget
- **HTTPS required** for production use
- **CORS enabled** for cross-origin requests
- **Input sanitization** for all user data

## 🐛 Troubleshooting

### Widget Not Appearing
1. Check if items are in the cart
2. Verify `/cart.js` endpoint is accessible
3. Check browser console for errors
4. Ensure React and ReactDOM are loaded

### Cart Page Not Loading
1. Verify API endpoints are accessible
2. Check network requests in browser dev tools
3. Ensure backend is running and responding

### Styling Issues
1. Check if CSS file is loaded
2. Verify no conflicting styles
3. Check CSS custom properties
4. Test in different browsers

## 📞 Support

For support and questions:
- **WhatsApp**: +234 818 988 0899
- **Instagram**: @mamategacosmeticsandspa
- **Email**: support@mamatega.com

## 📄 License

This widget is proprietary software for MamaTega Cosmetics.

---

**Made with ❤️ by MamaTega Cosmetics** 