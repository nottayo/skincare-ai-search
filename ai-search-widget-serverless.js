// Vercel Serverless Function for AI Search Widget
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
          conversationId: conversationId || generateConversationId()
        });
      }
      
      // Search Results
      else if (searchQuery) {
        const searchResults = await performSearch(searchQuery);
        res.status(200).json({
          success: true,
          results: searchResults
        });
      }
      
      else {
        res.status(400).json({
          success: false,
          error: 'Message or search query required'
        });
      }
    } catch (error) {
      console.error('AI Widget Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process request'
      });
    }
  } else {
    res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }
}

// Mock AI Response (replace with actual OpenAI API)
async function generateAIResponse(message, conversationId) {
  // In production, call OpenAI API here
  return {
    text: `I understand you're asking about: "${message}". Let me help you find the best skincare products for your needs.`,
    suggestions: [
      "Show me moisturizers",
      "Best cleansers for sensitive skin",
      "Anti-aging products"
    ]
  };
}

// Mock Search (replace with vector database search)
async function performSearch(query) {
  // In production, search your product database
  return [
    {
      id: 1,
      name: "Gentle Cleanser",
      price: 24.99,
      description: "Perfect for sensitive skin",
      image: "https://via.placeholder.com/150"
    },
    {
      id: 2,
      name: "Hydrating Moisturizer",
      price: 34.99,
      description: "Deep hydration for all skin types",
      image: "https://via.placeholder.com/150"
    }
  ];
}

function generateConversationId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
} 