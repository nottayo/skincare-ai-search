// Vercel Serverless Function for Cart API
// This replaces your Flask cart backend

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      // Create a new cart
      const cartId = 'CART' + Date.now();
      const cartData = {
        id: cartId,
        items: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // In a real app, you'd save to a database
      // For now, we'll just return the cart data
      res.status(200).json({
        success: true,
        cart: cartData,
        message: 'Cart created successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } else if (req.method === 'GET') {
    try {
      const { cartId } = req.query;
      
      if (!cartId) {
        return res.status(400).json({
          success: false,
          error: 'Cart ID is required'
        });
      }

      // In a real app, you'd fetch from database
      // For now, return a mock cart
      const cartData = {
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      res.status(200).json({
        success: true,
        cart: cartData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } else {
    res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }
} 

