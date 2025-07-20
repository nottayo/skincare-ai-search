# 🚀 Node.js Skincare AI Backend

This is the Node.js version of your Python Flask backend, migrated for better deployment and scalability.

## 📁 Project Structure

```
nodejs-backend/
├── server.js              # Main Express server
├── utils.js               # Utility functions (converted from utils.py)
├── chat-reasoning.js      # Chat logic (converted from chat_reasoning.py)
├── package.json           # Node.js dependencies
├── .env                   # Environment variables (create this)
├── app.py                 # Original Python Flask app (kept for reference)
├── utils.py               # Original Python utils (kept for reference)
├── chat_reasoning.py      # Original Python chat logic (kept for reference)
└── ... (other Python files kept for reference)
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Environment File
Create a `.env` file with your configuration:
```env
PORT=5001
OPENAI_API_KEY=your_openai_api_key_here
SHOPIFY_STORE_URL=shopmamatega.com
SHOPIFY_ADMIN_API=your_shopify_admin_token_here
SHOPIFY_STOREFRONT_TOKEN=your_shopify_storefront_token_here
FINE_TUNED_MODEL=ft:gpt-3.5-turbo-0125:personal::BunGDkYK
EMBEDDINGS_PATH=./product_embeddings.json
```

### 3. Start the Server
```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The server will run on `http://localhost:5001`

## 🔄 API Endpoints

### AI Chat
- **POST** `/ask` - Main AI chat endpoint
  ```json
  {
    "message": "I need a moisturizer for sensitive skin",
    "session_id": "optional_session_id"
  }
  ```

### Cart Management
- **POST** `/api/cart/create` - Create a new cart
- **GET** `/api/cart/:cartId` - Get cart details
- **PUT** `/api/cart/:cartId/update` - Update cart items

### Health Check
- **GET** `/health` - Server health status

## 🔧 Key Features Migrated

### ✅ Completed
- [x] Express server setup with CORS
- [x] Cart management (create, read, update)
- [x] Basic AI response generation
- [x] User interaction logging
- [x] Product embedding loading
- [x] Behavior rules loading
- [x] Brand management
- [x] Health check endpoint

### 🔄 In Progress
- [ ] OpenAI API integration
- [ ] Semantic search functionality
- [ ] Shopify API integration
- [ ] Advanced chat reasoning
- [ ] Product recommendations
- [ ] S3 file uploads

## 📊 Comparison: Python vs Node.js

| Feature | Python Flask | Node.js Express |
|---------|-------------|-----------------|
| **Server** | Flask | Express |
| **Port** | 5000 | 5001 |
| **Dependencies** | requirements.txt | package.json |
| **Environment** | venv | .env |
| **File Structure** | .py files | .js files |
| **Deployment** | Traditional server | Serverless ready |

## 🚀 Deployment Options

### 1. Vercel (Recommended)
```bash
# Deploy as serverless functions
vercel --prod
```

### 2. Railway
```bash
# Connect your GitHub repo
# Railway will auto-deploy
```

### 3. Render
```bash
# Create a new Web Service
# Point to your GitHub repo
```

### 4. Local Development
```bash
npm run dev
```

## 🔄 Migration Status

### ✅ Files Migrated
- `app.py` → `server.js`
- `utils.py` → `utils.js`
- `chat_reasoning.py` → `chat-reasoning.js`

### 📁 Original Files Preserved
- All Python files kept for reference
- Can run both versions simultaneously
- Easy to compare functionality

## 🎯 Next Steps

1. **Test the Node.js backend** with your frontend
2. **Add OpenAI API integration** for real AI responses
3. **Implement semantic search** for product recommendations
4. **Add Shopify API integration** for real product data
5. **Deploy to Vercel** for production use

## 🔧 Development

### Running Both Backends
```bash
# Terminal 1: Python Flask (port 5000)
cd ../backend-temp
source venv/bin/activate
python app.py

# Terminal 2: Node.js Express (port 5001)
cd nodejs-backend
npm run dev
```

### Testing
```bash
# Test Node.js backend
curl -X POST http://localhost:5001/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'

# Test cart creation
curl -X POST http://localhost:5001/api/cart/create
```

## 📝 Notes

- The Node.js version is a **work in progress**
- Original Python files are **preserved** for reference
- Both backends can run **simultaneously** on different ports
- Node.js version is **optimized for Vercel deployment**
- Easy to **switch between** Python and Node.js versions

## 🆘 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 5001
lsof -ti:5001 | xargs kill -9
```

### Missing Dependencies
```bash
npm install
```

### Environment Variables
Make sure your `.env` file exists and has the correct values.

---

**🎉 You now have both Python and Node.js backends! Choose the one that works best for your deployment needs.** 