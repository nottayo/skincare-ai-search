# Skincare AI Backend

This backend provides serverless API functions for the skincare AI search and cart functionality.

## API Endpoints

### Cart API (`/api/cart`)

- **POST** - Create a new cart
- **GET** - Get cart by ID (query parameter: `cartId`)

### AI Search API (`/api/ai-search`)

- **POST** - Handle AI chat responses and product search
  - Body: `{ "message": "user message" }` for chat
  - Body: `{ "searchQuery": "product search" }` for search

## File Structure

```
backend/
├── api/
│   ├── cart.js          # Cart operations
│   └── ai-search.js     # AI search and chat
├── app.py               # Original Flask app (for reference)
├── utils.py             # Utility functions
├── requirements.txt     # Python dependencies
└── package.json         # Node.js dependencies
```

## Deployment

This backend is designed to be deployed on Vercel as serverless functions. The main configuration is in the root `vercel.json` file.

## Development

To run locally with Vercel:

```bash
cd backend
npm install
vercel dev
```

## Migration from Flask

This backend replaces the original Flask application with serverless functions for better scalability and cost efficiency. 