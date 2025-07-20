const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();
let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();

const {
  isProductIntent,
  getDynamicSuggestions,
  cleanAIReply,
  semanticSearch,
  keywordSearch,
  products,
  behaviorRules,
  FINE_TUNED_MODEL,
  openai,
  isBrandQuery,
  getBehaviorRulesForQuery,
  getFAQAnswer,
  getTrainingAnswer,
  getFewShotExamples,
  mergeProductResults
} = require('./chat-reasoning');

const {
  userCarts,
  loadCartsFromStorage,
  saveCartsToStorage,
  createCartPage,
  logChatToCsv,
  uploadToS3,
  loadChatHistory,
  saveChatHistory,
  loadUserProfile,
  saveUserProfile
} = require('./utils');

const { searchProducts, listBrands, getProductByHandle } = require('./shopify');

const logger = require('./logger');

const ALLOWED_MODELS = [
  'ft:gpt-3.5-turbo-0125:personal::BumeQqW6',
  'ft:gpt-3.5-turbo-0125:personal::BunGDkYK'
];

const app = express();
const PORT = process.env.PORT || 5001;
const processStartTime = Date.now();

// Load carts from storage on startup
loadCartsFromStorage();

// Middleware
const allowedOrigins = [
  'https://frontend-rdd6a89c2-tayos-projects-cec8e285.vercel.app',
  'http://localhost:3000', // for local dev
];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Cache-Control', 'Expires', 'Pragma'],
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use('/mama--tega.png', express.static(path.join(__dirname, '../mama--tega.png')));

// Add request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    logger.analytics('request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
  });
  next();
});

// ─────────────────────────────────────────────────────────────
// Configuration & Logging
// ─────────────────────────────────────────────────────────────
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_URL || "shopmamatega.com";
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API;
const EMBEDS_PATH = process.env.EMBEDDINGS_PATH || "./product_embeddings.json";
const BEHAVIOR_RULES_PATH = "behavior_rules.json";
const BRANDS_CSV_PATH = path.join(__dirname, "Brands.csv");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_STOREFRONT_API = "https://shopmamatega.com/api/2023-04/graphql.json";
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;
const CART_STORAGE_FILE = 'cart_storage.json';

// ─────────────────────────────────────────────────────────────
// In-memory Stores
// ─────────────────────────────────────────────────────────────
let chatHistories = {};   // session_id → chat history
let lastResults = {};     // session_id → last product list
const VAGUE_INPUTS = ["smh", "lol", "hmm", "idk", "???", "what", "help", "eh", "umm", "uh", "huh"];

// In-memory chat history and user context store
const userContexts = {}; // sessionKey -> {name, lastResults, ...}

// ─────────────────────────────────────────────────────────────
// Load/Save Cart Storage
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Load Product Embeddings & Behavior Rules
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

// Helper to get unique brands from products
function getUniqueBrands(products, limit = 10) {
  const brandSet = new Set();
  for (const p of products) {
    if (p.brand && p.brand.trim()) brandSet.add(p.brand.trim());
    // Fallback: try to extract brand from title if not present
    else if (p.title) {
      const titleWords = p.title.split(' ');
      if (titleWords.length > 0) brandSet.add(titleWords[0].trim());
    }
    if (brandSet.size >= limit) break;
  }
  return Array.from(brandSet).slice(0, limit);
}

// Helper to robustly detect brand list queries
function isBrandListQuery(text) {
  const patterns = [
    /list\s*\d*\s*brands/i,
    /show me all brands/i,
    /what brands do you (carry|have|sell|stock|offer)/i,
    /brands (available|in stock|you have|you carry|you sell)/i,
    /brands for [a-z ]+/i,
    /brands\?/i,
    /brand list/i,
    /brands are there/i,
    /brands you stock/i,
    /brands you offer/i,
    /brands you recommend/i
  ];
  return patterns.some(p => p.test(text));
}

// Helper to get next set of brands for pagination
function getNextBrands(sessionKey, allBrands, limit = 10) {
  const lastIndex = lastResults[sessionKey]?.lastBrandIndex || 0;
  const nextBrands = allBrands.slice(lastIndex, lastIndex + limit);
  lastResults[sessionKey] = {
    ...lastResults[sessionKey],
    lastBrandIndex: lastIndex + limit
  };
  return nextBrands;
}

// ─────────────────────────────────────────────────────────────
// API Endpoints
// ─────────────────────────────────────────────────────────────

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
// Metrics endpoint
app.get('/metrics', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - processStartTime) / 1000);
  // For demo, active sessions = 0 (can be improved)
  res.json({ uptime_seconds: uptimeSeconds, active_sessions: 0 });
});
// OpenAPI endpoint
app.get('/openapi.json', (req, res) => {
  res.json({
    openapi: '3.0.0',
    info: { title: 'MamaTega Assistant API', version: '1.0.0' },
    paths: {
      '/ask': { post: { summary: 'Chat endpoint', responses: { '200': { description: 'OK' } } } }
    }
  });
});
// Models endpoint
app.get('/models', (req, res) => {
  res.json({ models: ALLOWED_MODELS });
});

// Main AI chat endpoint (mocked for now)
app.post('/ask', async (req, res) => {
  try {
    const { prompt = '', history = [], model, name, nameAskedBefore, sessionId, chatId } = req.body;
    const userQ = prompt.trim();
    if (!userQ) return res.status(400).json({ error: 'No prompt received' });
    const sessionKey = sessionId || chatId || 'default';
    const products = await require('./chat-reasoning').productsPromise;
    const { loadChatHistory, saveChatHistory, loadUserProfile, saveUserProfile } = require('./utils');
    let userProfile = loadUserProfile(sessionKey); // Ensure userProfile is always defined early
    // Helper to get unique brands
    function getUniqueBrands(products, limit = 20) {
      const brandSet = new Set();
      for (const p of products) {
        if (p.brand && p.brand.trim()) brandSet.add(p.brand.trim());
        else if (p.title) {
          const titleWords = p.title.split(' ');
          if (titleWords.length > 0) brandSet.add(titleWords[0].trim());
        }
        if (brandSet.size >= limit) break;
      }
      return Array.from(brandSet).slice(0, limit);
    }
    // Detect brand-listing queries
    const brandListPatterns = [
      /list\s*\d*\s*brands/i,
      /show me all brands/i,
      /what brands do you (carry|have|sell|stock|offer)/i,
      /brands (available|in stock|you have|you carry|you sell)/i,
      /brands for [a-z ]+/i,
      /brands\?/i,
      /brand list/i,
      /brands are there/i,
      /brands you stock/i,
      /brands you offer/i,
      /brands you recommend/i,
      /what brands/i
    ];
    const isBrandListQuery = brandListPatterns.some(p => p.test(userQ));
    if (isBrandListQuery) {
      const brands = getUniqueBrands(products, 20);
      const brandSentence = brands.length > 0
        ? `We carry brands like ${brands.slice(0, 10).join(', ')}${brands.length > 10 ? ', and more' : ''}. Would you like to know about a specific one?`
        : "I'm sorry, I couldn't find any brands in our catalog right now.";
      return res.json({
        answer: brandSentence,
        results: brands,
        suggestions: require('./chat-reasoning').getDynamicSuggestions(userQ)
      });
    }
    // Detect specific brand queries (e.g., 'do you carry [brand]?')
    const brandQueryMatch = userQ.match(/(?:do you (?:carry|sell|stock|have)\s+)([a-z0-9&+.'\- ]+)/i);
    if (brandQueryMatch) {
      const brandToCheck = brandQueryMatch[1].trim().toLowerCase();
      const brands = getUniqueBrands(products, 1000).map(b => b.toLowerCase());
      const found = brands.some(b => b === brandToCheck || b.includes(brandToCheck) || brandToCheck.includes(b));
      if (found) {
        return res.json({
          answer: `Yes, we carry ${brandToCheck.charAt(0).toUpperCase() + brandToCheck.slice(1)}! Would you like to see some products?`,
          results: products.filter(p => (p.brand || p.title).toLowerCase().includes(brandToCheck)).slice(0, 5),
          suggestions: require('./chat-reasoning').getDynamicSuggestions(userQ)
        });
      } else {
        // Check if user said yes to connect
        const lastUserTurn = history.length > 0 ? history[history.length - 1].content.toLowerCase() : '';
        if (lastUserTurn.includes('yes') || userQ.toLowerCase().includes('yes')) {
          const waNumber = process.env.WHATSAPP_NUMBER || '2348189880899';
          const waUrl = `https://wa.me/${waNumber}?text=Hi%20MamaTega!%20I%20have%20a%20question%20about%20a%20brand.`;
          return res.json({
            answer: `Great! You can chat with a team member on WhatsApp here: Link`,
            results: [],
            suggestions: require('./chat-reasoning').getDynamicSuggestions(userQ),
            whatsappUrl: waUrl
          });
        }
        return res.json({
          answer: `I couldn't find ${brandToCheck.charAt(0).toUpperCase() + brandToCheck.slice(1)} in our online catalog, but we might have it in-store. Would you like to connect with a team member on WhatsApp?`,
          results: [],
          suggestions: require('./chat-reasoning').getDynamicSuggestions(userQ)
        });
      }
    }
    // WhatsApp handoff after fallback for any product/brand fallback
    const lastBotMsg = history.length > 0 ? (history[history.length - 1].content || history[history.length - 1].text || '') : '';
    if (userQ.trim().toLowerCase() === 'yes' && lastBotMsg && lastBotMsg.toLowerCase().includes('connect with a team member')) {
      const waNumber = process.env.WHATSAPP_NUMBER || '2348189880899';
      const waUrl = `https://wa.me/${waNumber}?text=Hi%20MamaTega!%20I%20have%20a%20question%20about%20a%20product.`;
      return res.json({
        answer: `Great! You can chat with a team member on WhatsApp here: Link`,
        results: [],
        suggestions: require('./chat-reasoning').getDynamicSuggestions(userQ),
        whatsappUrl: waUrl
      });
    }
    // Only run product search if the last user message is a product/brand query
    let mergedProducts = [];
    if (isProductIntent(userQ)) {
      // 1. Run semantic search for product/brand queries
      const k = 10;
      const semanticSearch = require('./chat-reasoning').semanticSearch;
      let topProducts = [];
      if (semanticSearch && typeof semanticSearch === 'function') {
        try {
          topProducts = await semanticSearch(userQ, k, products);
        } catch (e) {
          topProducts = [];
        }
      }
      
      // If user asks for "other types", find more diverse products
      const userQLower = userQ.toLowerCase();
      if (userQLower.includes('other') || userQLower.includes('types') || userQLower.includes('more') || userQLower.includes('different')) {
        // Get a broader range of products for "other types" queries
        const diverseProducts = products.slice(0, 20); // Get first 20 products for variety
        topProducts = [...topProducts, ...diverseProducts];
      }
      
      // Always call Shopify API for live product search
      let shopifyProducts = [];
      try {
        shopifyProducts = await searchProducts(userQ, k);
      } catch (e) {
        shopifyProducts = [];
      }
      // Merge and deduplicate results (by title + handle)
      const seen = new Set();
      mergedProducts = [];
      for (const p of [...topProducts, ...shopifyProducts]) {
        const key = (p.handle || p.title).toLowerCase();
        if (!seen.has(key)) {
          mergedProducts.push(p);
          seen.add(key);
        }
      }
    }
    // 2. Build system prompt with store info and rules
    let systemPrompt = `You are a helpful MamaTega beauty assistant. Be warm, friendly, and conversational - like talking to a friend.

IMPORTANT RULES:
1. ONLY recommend products that are actually available in our store catalog. Do NOT suggest products we don't carry.
2. Do NOT make false claims about shipping. For shipping questions, tell customers to ask the store directly as shipping is determined at the store level.
3. Do NOT provide false store addresses. We are located at Tejuosho Ultra Modern Shopping Centre, Mosque Plaza, Yaba, Lagos.
4. Do NOT suggest unrelated products. Only recommend products that directly match the customer's request.
5. If you cannot find a specific product, be honest and say you don't have it, don't make up alternatives.
6. For WhatsApp links, simply say "You can reach us via WhatsApp" without providing a link.
7. Be conversational but accurate - don't make up information.
8. Do NOT suggest products unless the customer specifically asks for product recommendations.
9. If the customer asks a general question (like "soaps"), mention ALL relevant products you find in our catalog, not just the first few.
10. Do NOT generate random product suggestions or alternatives.
11. NEVER generate clickable links for products or contact info. Only mention product titles.
12. NEVER use markdown links, HTML links, or any form of clickable links in your responses.
13. NEVER include URLs, website addresses, or any form of links in your responses.
14. NEVER use bullet points, numbered lists, or any form of list formatting. Write in natural, flowing paragraphs.
15. When mentioning products, be comprehensive and mention all relevant products found, not just a limited selection.
16. Write responses as if you're typing naturally - use casual language, include natural pauses, and make it feel conversational.
17. NEVER format products as numbered lists (1. 2. 3.) or bullet points. Mention them naturally in flowing paragraphs.
18. Make responses feel like a real person typing - not like an AI generating text instantly.
19. Use natural transitions between topics and products - don't just list them.

Only mention each product once in your answer. Do NOT repeat the product list after you have already described the products. If you mention products in your answer, do not list them again at the end.`;
    // 3. Inject top N merged products or fallback into the prompt as context
    let productList = '';
    if (isProductIntent(userQ) && mergedProducts && mergedProducts.length > 0) {
      // Show more products - up to 8 instead of just 3
      const productsToShow = Math.min(mergedProducts.length, 8);
      productList = mergedProducts.slice(0, productsToShow).map((p, i) => `${p.title}\n${p.description ? p.description.substring(0, 200) : ''}`).join('\n\n');
      console.log(`[DEBUG] Found ${mergedProducts.length} products for query: "${userQ}"`);
      console.log(`[DEBUG] Showing ${productsToShow} products: ${mergedProducts.slice(0, productsToShow).map(p => p.title).join(', ')}`);
    } else if (isProductIntent(userQ)) {
      productList = 'No matching products found.';
      console.log(`[DEBUG] No products found for query: "${userQ}"`);
    }
    if (productList) {
      systemPrompt += `\n\nRelevant Products:\n${productList}`;
      console.log(`[DEBUG] Final system prompt length: ${systemPrompt.length} characters`);
      console.log(`[DEBUG] Product list being sent to AI:\n${productList}`);
    }
    // Persistent chat history
    let storedHistory = Array.isArray(loadChatHistory(sessionKey)) ? loadChatHistory(sessionKey) : [];
    let updatedHistory = [];
    if (Array.isArray(history) && history.length > storedHistory.length) {
      updatedHistory = [...history];
    } else if (Array.isArray(storedHistory)) {
      updatedHistory = [...storedHistory];
    } else {
      updatedHistory = [];
    }
    // Append the new user message
    updatedHistory.push({ role: 'user', content: userQ });
    // Advanced context handling: summarize long conversations
    let summary = '';
    if (updatedHistory.length > 10) {
      // Use OpenAI to generate a summary of the conversation so far
      const summaryPrompt = [
        { role: 'system', content: 'Summarize the following conversation between a user and MamaTega Assistant in 2-3 sentences. Focus on the user\'s needs, preferences, and any unresolved questions.' },
        ...updatedHistory.slice(0, -6) // summarize all but the last 6 turns
      ];
      try {
        const summaryResp = await openai.chat.completions.create({
          model: modelName,
          temperature: 0.3,
          max_tokens: 150,
          messages: summaryPrompt
        });
        summary = summaryResp.choices && summaryResp.choices[0] && summaryResp.choices[0].message && summaryResp.choices[0].message.content
          ? summaryResp.choices[0].message.content.trim()
          : '';
      } catch (e) {
        summary = '';
      }
    }
    // 4. Build messages array for OpenAI from updatedHistory, injecting summary and user profile if present
    let messages = [{ role: 'system', content: systemPrompt }];
    if (summary) {
      messages.push({ role: 'system', content: `Conversation summary so far: ${summary}` });
    }
    if (userProfile && (userProfile.skinType || userProfile.favoriteBrand || userProfile.productType || userProfile.attribute || userProfile.concern)) {
      let profileStr = 'User preferences:';
      if (userProfile.skinType) profileStr += ` Skin type: ${userProfile.skinType}.`;
      if (userProfile.favoriteBrand) profileStr += ` Favorite brand: ${userProfile.favoriteBrand}.`;
      if (userProfile.productType) profileStr += ` Product type: ${userProfile.productType}.`;
      if (userProfile.attribute) profileStr += ` Attribute: ${userProfile.attribute}.`;
      if (userProfile.concern) profileStr += ` Concern: ${userProfile.concern}.`;
      messages.push({ role: 'system', content: profileStr });
    }
    for (const turn of updatedHistory.slice(-6)) {
      if (turn.role && turn.content) messages.push({ role: turn.role, content: turn.content });
    }
    // Only inject fallback context if this is a product query and no products are found
    if (isProductIntent(userQ) && mergedProducts.length === 0) {
      messages.push({ role: 'user', content: 'If you cannot find any matching products, please answer helpfully and conversationally. For example: Sorry, I couldn\'t find any products from that brand in our online catalog right now. Would you like to ask about another product or connect with a team member? If the user asked for a specific brand, you can also suggest similar brands we do carry.' });
    }
    
    // Add specific instruction for "other types" queries
    if (isProductIntent(userQ) && mergedProducts.length > 0 && userQ.toLowerCase().includes('other')) {
      messages.push({ role: 'user', content: 'IMPORTANT: The user is asking for "other types" or alternatives. Please mention the different products you see in the Relevant Products section above. Do not say "only soaps" if you see other product types like creams, serums, etc.' });
    }
    
    // Add specific instruction for brand queries
    if (isProductIntent(userQ) && mergedProducts.length > 0 && userQ.toLowerCase().match(/^[a-z]{2,}$/)) {
      messages.push({ role: 'user', content: 'IMPORTANT: The user is asking about a specific brand. If you found products that might match what they\'re looking for, mention them. If the products don\'t seem to match their request, be honest about it and suggest alternatives.' });
    }
    // 5. Call OpenAI for a natural answer
    const { openai, FINE_TUNED_MODEL } = require('./chat-reasoning');
    const modelName = model || 'gpt-4o';
    let answer = '';
    try {
      const resp = await openai.chat.completions.create({
        model: modelName,
        temperature: 0.9,
        max_tokens: 1000,
        messages
      });
      answer = resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content
        ? resp.choices[0].message.content.trim()
        : '';
    } catch (err) {
      answer = 'Sorry, something went wrong. Please try again later.';
    }
    // After getting the bot's answer:
    updatedHistory.push({ role: 'assistant', content: answer });
    saveChatHistory(sessionKey, updatedHistory);
    // 6. Return the AI’s answer, merged product results (only for product queries), and updated history
    res.json({
      answer,
      results: isProductIntent(userQ) ? mergedProducts.slice(0, 3) : [],
      suggestions: require('./chat-reasoning').getDynamicSuggestions(userQ),
      history: updatedHistory
    });
  } catch (e) {
    console.error('Error in /ask:', e.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Create or update cart page
app.post('/api/cart/create', (req, res) => {
  try {
    const { items = [], user_info = {}, existing_cart_id = null } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }
    
    let cartId = existing_cart_id;
    let isNewCart = false;
    
    // Check if we have an existing cart ID to update
    if (cartId && userCarts[cartId]) {
      const existingCart = userCarts[cartId];
      const now = new Date();
      const expiryTime = new Date(existingCart.expires_at);
      
      // If cart hasn't expired, update it
      if (now <= expiryTime) {
        // Update existing cart with new items
        existingCart.items = items;
        existingCart.total_items = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
        existingCart.total_price = items.reduce((sum, item) => sum + (item.final_price || 0), 0);
        existingCart.updated_at = new Date().toISOString();
        
        userCarts[cartId] = existingCart;
        saveCartsToStorage();
        
        return res.json({
          cart_id: cartId,
          cart_url: `/cart/${cartId}`,
          expires_at: existingCart.expires_at,
          message: 'Cart updated successfully'
        });
      }
    }
    
    // Create new cart if no existing cart or cart expired
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    cartId = `NG${timestamp}${random}`;
    isNewCart = true;
    
    // Calculate expiry time (72 hours from now)
            const expiryTime = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
    
    const cartData = {
      cart_id: cartId,
      items: items,
      user_info: user_info,
      created_at: new Date().toISOString(),
      expires_at: expiryTime.toISOString(),
      total_items: items.reduce((sum, item) => sum + (item.quantity || 1), 0),
      total_price: items.reduce((sum, item) => sum + (item.final_price || 0), 0)
    };
    
    // Store cart data (in production, use a database)
    userCarts[cartId] = cartData;
    saveCartsToStorage();
    
    res.json({
      cart_id: cartId,
      cart_url: `/cart/${cartId}`,
      expires_at: expiryTime.toISOString(),
      message: isNewCart ? 'Cart created successfully' : 'Cart updated successfully'
    });
  } catch (e) {
    console.error('Error creating cart:', e.message);
    res.status(500).json({ error: 'Failed to create cart' });
  }
});

// Get cart page HTML
app.get('/cart/:cartId', (req, res) => {
  // Add cache-busting headers
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  const { cartId } = req.params;
  const cart = userCarts[cartId];
  
  if (!cart) {
    return res.status(404).send(`
      <html>
        <head><title>Cart Not Found</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>Cart Not Found</h1>
          <p>This cart link has expired or doesn't exist.</p>
          <p>Cart links expire after 72 hours for security.</p>
        </body>
      </html>
    `);
  }
  
  // Check if cart has expired
  const now = new Date();
  const expiryTime = new Date(cart.expires_at);
  
  if (now > expiryTime) {
    delete userCarts[cartId];
    saveCartsToStorage();
    return res.status(410).send(`
      <html>
        <head><title>Cart Expired</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>Cart Expired</h1>
          <p>This cart link has expired (72 hours limit).</p>
          <p>Please ask the customer to create a new cart link.</p>
        </body>
      </html>
    `);
  }
  
  // Calculate time remaining
  const timeRemaining = expiryTime - now;
  const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  
  // Generate HTML for cart page
          const cartItemsHTML = cart.items.map((item, index) => {
          const color = item.variant_options?.find(v => v.name.toLowerCase() === 'color')?.value || 'Natural';
          const status = 'Online Cart';
          const colorHex = color.toLowerCase() === 'red' ? '#ff0000' : '#8B4513';
          
          return `
            <div class="cart-item">
              <div class="item-title">${item.product_title || item.title}</div>
              <div class="item-variant">
                Color: ${color}
                <div class="color-swatch" style="background-color: ${colorHex};"></div>
              </div>
              <div class="item-quantity-price">
                <span class="item-quantity">${item.quantity || 1}x</span>
                <span class="item-price">₦${((item.final_price || 0) / 100).toFixed(2)}</span>
              </div>
              <div class="item-status">${status}</div>
            </div>
          `;
        }).join('');
  
  const totalPrice = (cart.total_price / 100).toFixed(2);
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Cart - ${cartId}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      <style>
        @font-face {
          font-family: 'FivoSans-Light';
          src: url('https://fonts.cdnfonts.com/css/fivo-sans') format('woff2');
          font-weight: 300;
          font-style: normal;
        }
        
        @font-face {
          font-family: 'WorkM';
          src: url('https://fonts.cdnfonts.com/css/workm') format('woff2');
          font-weight: normal;
          font-style: normal;
        }
        
        @font-face {
          font-family: 'Manrope-SemiBold';
          src: url('https://fonts.googleapis.com/css2?family=Manrope:wght@600&display=swap');
          font-weight: 600;
          font-style: normal;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
          font-family: 'FivoSans-Light', -apple-system, BlinkMacSystemFont, sans-serif; 
          background: transparent;
          min-height: 100vh;
          padding: 20px;
          color: #e0e0e0;
          position: relative;
        }
        
        body::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: 
            radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.05) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(255, 255, 255, 0.04) 0%, transparent 50%);
          pointer-events: none;
          z-index: -1;
        }
        
        .container { 
          max-width: 600px; 
          margin: 10px auto; 
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          border-radius: 16px; 
          overflow: hidden;
          box-shadow: 
            0 25px 45px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.1);
          position: relative;
        }
        
        .container::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, transparent 50%);
          pointer-events: none;
          z-index: 0;
        }
        
        .header { 
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          color: #e0e0e0;
          padding: 20px 20px;
          text-align: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          position: relative;
          z-index: 1;
        }
        
        .logo { 
          margin-bottom: 30px;
          text-align: center;
        }
        
        .logo-text {
          font-family: 'CraftworkGrotesk-Medium', sans-serif;
          font-size: 18px;
          font-weight: 500;
          color: #e0e0e0;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .customer-cart {
          font-family: 'CraftworkGrotesk-Medium', sans-serif;
          font-size: 16px;
          font-weight: 500;
          color: #e0e0e0;
          margin-bottom: 10px;
          text-align: center;
        }
        
        .cart-id { 
          background: rgba(255, 255, 255, 0.1); 
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          padding: 12px 20px; 
          border-radius: 12px; 
          font-family: 'CraftworkGrotesk-Medium', sans-serif; 
          color: #e0e0e0; 
          margin: 15px 0;
          font-size: 16px;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        
        .content {
          padding: 20px;
          background: linear-gradient(218deg, #3a3a3a, #262626);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          position: relative;
          z-index: 1;
        }
        
        .important-notice {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 25px;
          border-radius: 16px;
          margin: 25px 0;
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
          position: relative;
          overflow: hidden;
          z-index: 1;
        }
        

        
        .important-notice h2 {
          font-family: 'CraftworkGrotesk-Medium', sans-serif;
          color: #e0e0e0;
          margin-bottom: 15px;
          font-size: 14px;
          font-weight: 500;
          text-transform: none;
          letter-spacing: 0.5px;
        }
        
        .important-notice p {
          font-family: 'FivoSans-Light', sans-serif;
          color: #e0e0e0;
          line-height: 1.6;
          margin-bottom: 15px;
          font-size: 13px;
        }
        
        .contact-methods {
          margin-top: 20px;
        }
        
        .contact-methods .contact-item {
          font-family: 'FivoSans-Light', sans-serif;
          margin: 8px 0;
          color: #e0e0e0;
          line-height: 1.5;
          font-size: 12px;
        }
        
        .copy-link-section {
          text-align: center;
          margin: 20px 0;
          padding: 20px;
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-radius: 16px;
          box-shadow: 
            0 15px 35px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.3);
          z-index: 1;
        }
        
        .cart-info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          gap: 15px;
        }
        
        .cart-info {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 10px;
          flex: 1;
        }
        
        .cart-info-text {
          font-family: 'CraftworkGrotesk-Medium', sans-serif;
          font-weight: 600;
          font-size: 14px;
          color: #e0e0e0;
          white-space: nowrap;
        }
        
        .cart-expiry {
          font-family: 'FivoSans-Light', sans-serif;
          font-size: 11px;
          color: #b0b0b0;
          white-space: nowrap;
        }
        
        .copy-link-section::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
          z-index: -1;
        }
        
        @keyframes pulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.3;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 0.6;
          }
        }
        

        
        .copy-link-btn {
          font-family: 'CraftworkGrotesk-Medium', sans-serif;
          background: linear-gradient(135deg, #0066ff, #0052cc) !important;
          color: #ffffff;
          border: none;
          padding: 12px 24px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-bottom: 10px;
          position: relative;
          z-index: 2;
          box-shadow: 
            0 0 20px rgba(0, 102, 255, 0.6),
            0 0 40px rgba(0, 102, 255, 0.4),
            0 0 60px rgba(0, 102, 255, 0.2);
        }
        
        .copy-link-btn:hover {
          background: linear-gradient(135deg, #0052cc, #003d99) !important;
          transform: translateY(-2px);
          box-shadow: 
            0 0 30px rgba(0, 102, 255, 0.8),
            0 0 60px rgba(0, 102, 255, 0.6),
            0 0 90px rgba(0, 102, 255, 0.4);
        }
        
        .copy-instructions {
          font-family: 'FivoSans-Light', sans-serif;
          color: #e0e0e0;
          font-size: 14px;
          margin: 0;
          position: relative;
          z-index: 1;
          opacity: 0.9;
        }
        
        .expiry-warning { 
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 20px;
          border-radius: 16px;
          margin: 20px 0;
          position: relative;
          overflow: hidden;
          font-family: 'FivoSans-Light', sans-serif;
          color: #e0e0e0;
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
          z-index: 1;
        }
        
        .expiry-warning::before {
          content: '⏰';
          position: absolute;
          top: 10px;
          right: 15px;
          font-size: 24px;
          opacity: 0.3;
        }
        
        .instructions { 
          background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
          border: 1px solid #10b981;
          padding: 25px;
          border-radius: 16px;
          margin: 25px 0;
        }
        
        .instructions h3 {
          color: #065f46;
          margin-bottom: 15px;
          font-size: 18px;
        }
        
        .instructions ol {
          padding-left: 20px;
        }
        
        .instructions li {
          margin: 8px 0;
          color: #047857;
          line-height: 1.6;
        }
        
        .cart-items {
          margin: 30px 0;
        }
        
        .cart-items h2 {
          font-family: 'CraftworkGrotesk-Medium', sans-serif;
          color: #e0e0e0;
          margin-bottom: 20px;
          font-size: 24px;
          font-weight: 500;
        }
        
        .cart-item {
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 20px;
          margin: 15px 0;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
          position: relative;
          z-index: 1;
        }
        

        
        .item-title {
          font-family: 'CraftworkGrotesk-Medium', sans-serif;
          font-size: 16px;
          font-weight: 500;
          color: #e0e0e0;
          margin-bottom: 6px;
        }
        
        .item-variant {
          font-family: 'FivoSans-Light', sans-serif;
          color: #b0b0b0;
          font-size: 13px;
          margin: 4px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .color-swatch {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .item-quantity-price {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
        }
        
        .item-quantity {
          font-family: 'FivoSans-Light', sans-serif;
          color: #b0b0b0;
          font-size: 13px;
        }
        
        .item-price {
          font-family: 'CraftworkGrotesk-Medium', sans-serif;
          font-weight: 500;
          color: #e0e0e0;
          font-size: 15px;
        }
        
        .item-status {
          position: absolute;
          top: 15px;
          right: 15px;
          background: rgba(255, 255, 255, 0.1);
          color: #e0e0e0;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .price-notice {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 20px;
          border-radius: 16px;
          margin: 20px 0;
          text-align: center;
          font-family: 'FivoSans-Light', sans-serif;
          color: #e0e0e0;
          font-size: 14px;
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.2),
            0 0 20px rgba(255, 255, 255, 0.1),
            0 0 40px rgba(255, 255, 255, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
          z-index: 1;
          animation: priceGlow 3s ease-in-out infinite alternate;
        }
        
        @keyframes priceGlow {
          0% {
            box-shadow: 
              0 8px 32px rgba(0, 0, 0, 0.2),
              0 0 20px rgba(255, 255, 255, 0.1),
              0 0 40px rgba(255, 255, 255, 0.05),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
          }
          100% {
            box-shadow: 
              0 8px 32px rgba(0, 0, 0, 0.2),
              0 0 30px rgba(255, 255, 255, 0.2),
              0 0 60px rgba(255, 255, 255, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
          }
        }
        

        

        
        .footer {
          text-align: center;
          padding: 20px;
          color: #e0e0e0;
          font-size: 16px;
          font-weight: 500;
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          font-family: 'CraftworkGrotesk-Medium', sans-serif;
          position: relative;
          z-index: 1;
        }
        
        @media (max-width: 768px) {
          body { padding: 10px; }
          .container { border-radius: 16px; }
          .header { padding: 20px 15px; }
          .content { padding: 15px; }
          
          .cart-info-row {
            flex-direction: column;
            align-items: stretch;
            gap: 15px;
          }
          
          .cart-info {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
            width: 100%;
          }
          
          .cart-info-text {
            font-size: 16px;
            line-height: 1.4;
            width: 100%;
            text-align: left;
            white-space: normal;
          }
          
          .cart-expiry {
            font-size: 14px;
            color: #888;
            margin-top: 5px;
          }
          
          .copy-link-btn {
            padding: 12px 20px;
            font-size: 14px;
            width: 100%;
            max-width: none;
            margin: 0;
            justify-content: center;
            border-radius: 8px;
          }
          
          .copy-instructions {
            font-size: 12px;
            text-align: center;
          }
          
          .cart-item { 
            flex-direction: column; 
            align-items: flex-start;
            gap: 10px;
            padding: 15px;
            text-align: left;
          }
          
          .item-details {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          
          .item-name {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 5px;
          }
          
          .item-status {
            display: inline-block;
            margin-left: 0;
            margin-top: 5px;
          }
          
          .item-color {
            font-size: 14px;
            margin-top: 5px;
          }
          
          .item-price {
            font-size: 16px;
            font-weight: 600;
            margin-top: 10px;
            align-self: flex-start;
          }
          
          .item-image { 
            margin: 10px 0 0 0; 
          }
          
          .contact-buttons { 
            flex-direction: column; 
          }
          
          .contact-btn { 
            width: 100%; 
            justify-content: center; 
          }
          
          .cart-items h2 {
            font-size: 20px;
          }
          
          .important-notice {
            padding: 15px;
          }
          
          .contact-methods {
            gap: 8px;
          }
          
          .contact-item {
            font-size: 13px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
                            <div class="logo-text">MamaTega</div>
          </div>
          <h1 class="customer-cart">Customer Cart</h1>
          <div class="cart-id">Cart ID: ${cartId}</div>
        </div>
        
        <div class="content">
                  <div class="copy-link-section">
          <div class="cart-info-row">
            <div class="cart-info">
              <span class="cart-info-text">Here is my cart (${cart.total_items} items)</span>
              <span class="cart-expiry">Expires: ${daysRemaining > 0 ? daysRemaining + 'd' : hoursRemaining + 'h'}</span>
            </div>
            <button class="copy-link-btn" onclick="copyCartLink()">
              📋 Copy Link
            </button>
          </div>
          <p class="copy-instructions">Click to copy this cart link and share it with a team member</p>
        </div>
          

          
          <div class="cart-items">
            <h2>🛒 Cart Items (${cart.total_items} items)</h2>
            ${cartItemsHTML}
          </div>
          
          <div class="price-notice">
            <p><strong>Note:</strong> Prices shown may not be the same at checkout due to fluctuating exchange rates. Please contact us for accurate pricing.</p>
          </div>
          
          <div class="important-notice">
            <h2>Important Notice: Placing Orders</h2>
            <p>Due to fluctuating exchange rates, checkout is suspended. Contact us for accurate pricing and availability.</p>
            
            <div class="contact-methods">
              <div class="contact-item">
                <strong>Hours:</strong> Mon-Sat 8AM-8PM | Sun 1PM-7PM
              </div>
              <div class="contact-item">
                <strong>Store:</strong> Tejuosho Ultra Modern Shopping Centre, Yaba, Lagos
              </div>
              <div class="contact-item">
                <strong>Live Chat:</strong> Click the chat button below
              </div>
              <div class="contact-item">
                <strong>WhatsApp:</strong> +234 818 988 0899 | +234 803 713 3704
              </div>
              <div class="contact-item">
                <strong>Instagram:</strong> @mamategacosmeticsandspa
              </div>
              <div class="contact-item">
                <strong>Email:</strong> info@shopmamatega.com
              </div>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <p>© 2025 MamaTega Cosmetics. All rights reserved.</p>
        </div>
      </div>
      
      <script>
        function getTimeRemaining(expiryDate) {
          const now = new Date();
          const expiry = new Date(expiryDate);
          const diff = expiry - now;
          
          if (diff <= 0) return 'Expired';
          
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          
          if (days > 0) {
            return days + 'd';
          } else if (hours > 0) {
            return hours + 'h';
          } else {
            return minutes + 'm';
          }
        }
        
        function copyCartLink() {
          const cartUrl = window.location.href;
          navigator.clipboard.writeText(cartUrl).then(() => {
            const btn = document.querySelector('.copy-link-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Link Copied!';
            btn.style.background = 'rgba(40, 167, 69, 0.9)';
            setTimeout(() => {
              btn.innerHTML = originalText;
              btn.style.background = 'rgba(41, 41, 41, 0.9)';
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy link:', err);
            alert('Failed to copy link. Please copy manually: ' + cartUrl);
          });
        }
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
});

// GET /api/products_by_handles
app.get('/api/products_by_handles', async (req, res) => {
  try {
    const handles = req.query.handles || '';
    const handleList = handles.split(',').map(h => h.trim()).filter(Boolean);
    if (!handleList.length) return res.json([]);
    // Build GraphQL query
    const queries = handleList.map((handle, i) => `h${i}: productByHandle(handle: \"${handle}\") { id title handle description onlineStoreUrl featuredImage { url altText } priceRange { minVariantPrice { amount currencyCode } } }`).join('\n');
    const query = `{${queries}}`;
    const headers = {
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
      'Content-Type': 'application/json'
    };
    const resp = await fetch(SHOPIFY_STOREFRONT_API, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query })
    });
    const data = await resp.json();
    const products = Object.values(data.data || {}).filter(Boolean);
    res.json(products);
  } catch (e) {
    console.error('Error fetching products by handles:', e.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Root route
app.get('/', (req, res) => {
    res.send('MamaTega Cosmetics AI Backend (Node.js) is running!');
});

// Move error handlers to the end
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.stack || err}`);
  res.status(500).json({ error: 'Internal server error' });
});

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Node.js MamaTega Cosmetics AI Backend running on port ${PORT}`);
}); 
