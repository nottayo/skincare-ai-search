const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Test routes
app.get('/', (req, res) => {
    res.json({ message: 'Node.js Skincare AI Backend is running!', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/ask', (req, res) => {
    const { message } = req.body;
    res.json({
        response: `You said: "${message}". This is a test response from Node.js backend!`,
        session_id: 'test_session',
        conversation_id: 'test_conversation'
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

app.listen(PORT, () => {
    console.log(`🚀 Test Node.js Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`💬 Chat endpoint: POST http://localhost:${PORT}/ask`);
    console.log(`🛒 Cart endpoint: POST http://localhost:${PORT}/api/cart/create`);
}); 