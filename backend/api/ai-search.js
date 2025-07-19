// Vercel Serverless Function for AI Search
// This replaces your Flask AI backend

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { message, conversationId, searchQuery } = req.body;

      // AI Chat Response
      if (message) {
        const aiResponse = await generateAIResponse(message, conversationId);
        res.status(200).json({
          success: true,
          response: aiResponse,
          conversationId: conversationId || 'conv_' + Date.now()
        });
      }
      // Product Search
      else if (searchQuery) {
        const searchResults = await searchProducts(searchQuery);
        res.status(200).json({
          success: true,
          results: searchResults
        });
      }
      else {
        res.status(400).json({
          success: false,
          error: 'Message or searchQuery is required'
        });
      }
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

// Mock AI response function
async function generateAIResponse(message, conversationId) {
  // In a real app, you'd call OpenAI API here
  const responses = [
    "I'd be happy to help you find the perfect skincare product!",
    "Based on your question, I recommend checking our moisturizer collection.",
    "For sensitive skin, I suggest our gentle cleanser line.",
    "Let me search for products that match your needs."
  ];
  
  const randomResponse = responses[Math.floor(Math.random() * responses.length)];
  
  return {
    text: randomResponse,
    timestamp: new Date().toISOString(),
    conversationId: conversationId
  };
}

// Mock product search function
async function searchProducts(query) {
  // In a real app, you'd search your product database
  const mockProducts = [
    {
      id: 1,
      name: 'Gentle Cleanser',
      price: 24.99,
      image: 'https://via.placeholder.com/150',
      description: 'Perfect for sensitive skin'
    },
    {
      id: 2,
      name: 'Hydrating Moisturizer',
      price: 34.99,
      image: 'https://via.placeholder.com/150',
      description: 'Deep hydration for all skin types'
    },
    {
      id: 3,
      name: 'Vitamin C Serum',
      price: 49.99,
      image: 'https://via.placeholder.com/150',
      description: 'Brightening and anti-aging formula'
    }
  ];

  // Simple search logic
  const filteredProducts = mockProducts.filter(product =>
    product.name.toLowerCase().includes(query.toLowerCase()) ||
    product.description.toLowerCase().includes(query.toLowerCase())
  );

  return filteredProducts;
} 