# 🚀 Deploy to Vercel (Free Alternative)

## Why Vercel is Better Than Render:

✅ **Free tier is generous**
✅ **No build spend limits**
✅ **Automatic deployments from Git**
✅ **Better performance**
✅ **Global CDN**

## Setup Steps:

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy Your Project
```bash
vercel
```

### 4. For Backend API (Serverless Functions)
Create `api/cart.js`:
```javascript
export default function handler(req, res) {
  if (req.method === 'POST') {
    // Handle cart creation
    res.status(200).json({ cartId: 'CART' + Date.now() });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
```

## Vercel vs Render Comparison:

| Feature | Vercel (Free) | Render (Free) |
|---------|---------------|---------------|
| Build Minutes | 100/month | 750/month |
| Bandwidth | 100GB/month | 750GB/month |
| Functions | 100GB-hours | 750 hours |
| Deployments | Unlimited | Unlimited |
| Build Timeout | 45 min | 30 min |

## Migration Benefits:

✅ **No more build spend limits**
✅ **Faster deployments**
✅ **Better global performance**
✅ **Automatic HTTPS**
✅ **Preview deployments**

## To Migrate:

1. **Delete Render service**
2. **Deploy to Vercel**
3. **Update cart button URLs**
4. **Save money!** 💰 
