const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Test routes
app.get('/', (req, res) => {
    res.json({ 
        message: 'Node.js MamaTega Cosmetics AI Backend is running!', 
        timestamp: new Date().toISOString(),
        status: 'success'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.post('/ask', (req, res) => {
    const { message } = req.body;
    res.json({
        response: `You said: "${message}". This is a test response from Node.js backend!`,
        session_id: 'test_session',
        conversation_id: 'test_conversation',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/cart/create', (req, res) => {
    const cartId = `CART${Date.now()}`;
    res.json({
        success: true,
        cart: {
            id: cartId,
            items: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        message: 'Cart created successfully'
    });
});

app.get('/api/cart/:cartId', (req, res) => {
    const { cartId } = req.params;
    res.json({
        success: true,
        cart: {
            id: cartId,
            items: [
                {
                    id: 1,
                    name: 'Sample Product',
                    price: 29.99,
                    quantity: 1,
                    image: 'https://via.placeholder.com/150'
                }
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Test Node.js Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`💬 Chat endpoint: POST http://localhost:${PORT}/ask`);
    console.log(`🛒 Cart endpoint: POST http://localhost:${PORT}/api/cart/create`);
    console.log(`📊 Get cart: GET http://localhost:${PORT}/api/cart/:cartId`);
}); 