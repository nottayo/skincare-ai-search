# 🚀 MamaTega Cosmetics - Deployment Guide

## 📋 Overview
This guide will help you deploy the MamaTega Cosmetics AI Chat & Cart System to production.

## 🎯 What's Ready for Deployment

### ✅ Completed Components
- **Frontend Widgets**: Built and optimized for production
- **"Here is my cart" HTML**: Ready for Shopify integration
- **Node.js Backend**: Ready for Vercel deployment
- **Branding**: Updated to "MamaTega Cosmetics" throughout
- **Mobile UI**: Responsive design with improved layout
- **Cache-busting**: Prevents browser caching issues

### 📁 Key Files
- `hereismycart.html` - Shopify cart page template
- `frontend/search-widget/chatbot-widget.umd.js` - Chat widget
- `frontend/dynamic-checkout-widget/dynamic-checkout-widget.umd.js` - Cart widget
- `nodejs-backend/` - Backend for Vercel deployment

## 🔧 Step 1: Upload Embeddings to S3

### Prerequisites
- AWS CLI installed
- AWS credentials configured
- S3 bucket created

### Upload Process
```bash
# Configure AWS credentials (if not already done)
aws configure

# Run the upload script
./upload-embeddings-to-s3.sh
```

### Expected Output
```
🚀 MamaTega Cosmetics - Uploading Embeddings to S3
==================================================
✅ AWS credentials configured
✅ S3 bucket 'mamatega-embeddings' accessible

📤 Uploading product_embeddings_with_brands.json...
   Size: 1.4G
   ✅ Successfully uploaded product_embeddings_with_brands.json
   🔗 Public URL: https://mamatega-embeddings.s3.us-east-2.amazonaws.com/product_embeddings_with_brands.json

📤 Uploading product_embeddings_small.json...
   Size: 120M
   ✅ Successfully uploaded product_embeddings_small.json
   🔗 Public URL: https://mamatega-embeddings.s3.us-east-2.amazonaws.com/product_embeddings_small.json

🎉 All embeddings uploaded successfully!
```

## 🚀 Step 2: Deploy Backend to Vercel

### 2.1 Prepare Backend for Vercel
1. **Navigate to backend directory**:
   ```bash
   cd nodejs-backend
   ```

2. **Update embedding URLs** in `server.js`:
   ```javascript
   // Replace local file loading with S3 URLs
   const embeddingsUrl = "https://mamatega-embeddings.s3.us-east-2.amazonaws.com/product_embeddings_with_brands.json";
   ```

3. **Create vercel.json** (if not exists):
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "server.js",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "/server.js"
       }
     ]
   }
   ```

### 2.2 Deploy to Vercel
1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   cd nodejs-backend
   vercel --prod
   ```

3. **Get your backend URL** (e.g., `https://mamatega-backend.vercel.app`)

## 🎨 Step 3: Update Frontend API URLs

### 3.1 Update Widget URLs
Update the API URLs in your frontend components to point to your Vercel backend:

```javascript
// In Chatbot.jsx and other components
const API_BASE_URL = "https://your-vercel-backend.vercel.app";
```

### 3.2 Rebuild Widgets
```bash
cd frontend
npm run build:widget
npm run build:dynamic-checkout
```

## 🛒 Step 4: Shopify Integration

### 4.1 Add "Here is my cart" Page
1. **In Shopify Admin**:
   - Go to **Online Store** → **Pages**
   - Click **Add page**
   - Title: "Here is my cart"
   - Content: Copy the HTML from `hereismycart.html`

2. **Update the backend URL** in the HTML:
   ```javascript
   const response = await fetch(`https://your-vercel-backend.vercel.app/cart/${cartData.cartId}`);
   ```

### 4.2 Add Chat Widget to Shopify
1. **In Shopify Admin**:
   - Go to **Online Store** → **Themes**
   - Click **Actions** → **Edit code**
   - Open `theme.liquid`
   - Add before `</body>`:
   ```html
   <script src="https://your-frontend-domain.com/search-widget/chatbot-widget.umd.js"></script>
   <link rel="stylesheet" href="https://your-frontend-domain.com/search-widget/chatbot-widget.css">
   ```

### 4.3 Add Cart Widget to Shopify
1. **In your cart template** (e.g., `cart.liquid`):
   ```html
   <script src="https://your-frontend-domain.com/dynamic-checkout-widget/dynamic-checkout-widget.umd.js"></script>
   <link rel="stylesheet" href="https://your-frontend-domain.com/dynamic-checkout-widget/dynamic-checkout-widget.css">
   ```

## 🌐 Step 5: Deploy Frontend

### Option A: Vercel (Recommended)
```bash
cd frontend
vercel --prod
```

### Option B: Netlify
```bash
cd frontend
netlify deploy --prod --dir=build
```

### Option C: GitHub Pages
```bash
cd frontend
npm run deploy
```

## ✅ Step 6: Testing Checklist

### Backend Testing
- [ ] Chat API responds correctly
- [ ] Cart creation works
- [ ] Cart retrieval works
- [ ] Embeddings load from S3

### Frontend Testing
- [ ] Chat widget loads on Shopify
- [ ] Cart widget functions properly
- [ ] "Here is my cart" page works
- [ ] Mobile responsiveness
- [ ] Branding shows "MamaTega Cosmetics"

### Integration Testing
- [ ] Chat can add items to cart
- [ ] Cart links work correctly
- [ ] Instagram integration works
- [ ] Copy link functionality works

## 🔧 Troubleshooting

### Common Issues

#### 1. Embeddings Not Loading
- Check S3 bucket permissions
- Verify URLs are correct
- Check CORS settings on S3 bucket

#### 2. API Calls Failing
- Verify Vercel backend URL
- Check CORS settings in backend
- Ensure environment variables are set

#### 3. Widgets Not Loading
- Check file paths and URLs
- Verify CDN/hosting is working
- Check browser console for errors

#### 4. Mobile Layout Issues
- Test on actual mobile devices
- Check viewport meta tags
- Verify CSS media queries

## 📞 Support

If you encounter issues:
1. Check the browser console for errors
2. Verify all URLs are correct
3. Test each component individually
4. Check Vercel deployment logs

## 🎉 Success!

Once deployed, your MamaTega Cosmetics AI system will be live with:
- ✅ AI chat widget with product recommendations
- ✅ Dynamic cart system with Instagram integration
- ✅ "Here is my cart" sharing functionality
- ✅ Mobile-responsive design
- ✅ MamaTega branding throughout

**Your customers can now:**
- Chat with AI about products
- Add items to cart via chat
- Share cart links with others
- Order via Instagram
- View cart details on mobile-friendly pages 

