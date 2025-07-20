# 🚀 Node.js Backend Deployment to Vercel

## 📋 Prerequisites

1. **Vercel CLI installed**:
   ```bash
   npm i -g vercel
   ```

2. **AWS S3 bucket created** with embeddings uploaded
3. **Environment variables ready**

## 🔧 Environment Variables Setup

### Required Environment Variables for Vercel:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Shopify Configuration
SHOPIFY_STORE_URL=shopmamatega.com
SHOPIFY_ADMIN_API=your_shopify_admin_token_here
SHOPIFY_STOREFRONT_TOKEN=your_shopify_storefront_token_here

# S3 Configuration for Embeddings (UPDATED WITH YOUR BUCKET)
EMBEDS_PATH=s3://my-embeddings-bucket-ds3/product_embeddings_with_brands.json
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
S3_REGION=us-east-2

# Behavior Rules
BEHAVIOR_RULES_PATH=behavior_rules.json

# Fine-tuned Model
FINE_TUNED_MODEL=ft:gpt-3.5-turbo-0125:personal::BunGDkYK

# Server Configuration
PORT=5001
```

## 🚀 Deployment Steps

### 1. Login to Vercel
```bash
vercel login
# Choose your preferred login method (GitHub, Google, etc.)
```

### 2. Navigate to Backend Directory
```bash
cd nodejs-backend
```

### 3. Set Environment Variables in Vercel
```bash
# Set each environment variable
vercel env add OPENAI_API_KEY
vercel env add SHOPIFY_ADMIN_API
vercel env add SHOPIFY_STOREFRONT_TOKEN
vercel env add AWS_ACCESS_KEY_ID
vercel env add AWS_SECRET_ACCESS_KEY
vercel env add S3_REGION
vercel env add EMBEDS_PATH
```

### 4. Deploy to Vercel
```bash
vercel --prod --yes
```

### 5. Verify Deployment
- Check the deployment URL (e.g., `https://your-app.vercel.app`)
- Test the health endpoint: `https://your-app.vercel.app/health`
- Test the chat endpoint: `https://your-app.vercel.app/ask`

## 🔍 Important Notes

### ✅ What's Configured:
- **vercel.json**: Tells Vercel to use Node.js instead of Python
- **.vercelignore**: Excludes Python files and large embedding files
- **S3 Integration**: Embeddings will be loaded from S3 in production
- **Environment Variables**: All required variables documented

### ⚠️ Before Deployment:
1. **Upload embeddings to S3** using the upload script
2. **Set all environment variables** in Vercel dashboard
3. **Test locally** with S3 configuration
4. **Update frontend API URLs** to point to Vercel backend

### 🔧 Troubleshooting:

#### If Vercel tries to use Python:
- Ensure `vercel.json` is in the `nodejs-backend` directory
- Check that `.vercelignore` excludes Python files
- Deploy from the `nodejs-backend` directory, not the root

#### If embeddings don't load:
- Verify S3 bucket exists and is accessible
- Check AWS credentials are correct
- Ensure `EMBEDS_PATH` points to correct S3 location

#### If environment variables are missing:
- Set them in Vercel dashboard under Settings → Environment Variables
- Redeploy after setting variables

## 📞 Support

If you encounter issues:
1. Check Vercel deployment logs
2. Verify all environment variables are set
3. Test the health endpoint
4. Check S3 bucket permissions

## 🎉 Success!

Once deployed, your Node.js backend will be running on Vercel with:
- ✅ S3-powered embeddings loading from `s3://my-embeddings-bucket-ds3/`
- ✅ Shopify integration
- ✅ OpenAI chat functionality
- ✅ Cart management system
- ✅ All MamaTega branding 
