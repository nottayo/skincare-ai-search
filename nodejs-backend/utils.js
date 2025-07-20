const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/sync');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const csvWriter = require('csv-writer').createObjectCsvWriter;
const CHAT_LOGS_FILE = path.join(__dirname, '../backend/chat_logs.csv');
const CHAT_HISTORY_FILE = path.join(__dirname, '../backend/chat_history.json');

const S3_BUCKET = process.env.S3_BUCKET || 'mamatega-chat-logs';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

let s3 = null;
if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
  s3 = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
  });
}

// ── Parse user-agent details ──
function parseUserInfo(req) {
    const userAgent = req.headers['user-agent'] || '';
    return {
        browser: 'Unknown',
        os: 'Unknown',
        device: 'desktop',
        is_mobile: false,
        platform: 'Unknown'
    };
}

// ── Log user interaction ──
async function logInteraction(sessionId, messageType, messageText, userInfo = {}, file = "training.csv") {
    const timestamp = new Date().toISOString();
    const row = {
        timestamp,
        session_id: sessionId,
        message_type: messageType,
        message_text: messageText,
        browser: userInfo.browser || 'Unknown',
        os: userInfo.os || 'Unknown',
        device: userInfo.device || 'desktop',
        is_mobile: userInfo.is_mobile || false,
        platform: userInfo.platform || 'Unknown'
    };

    try {
        console.log(`[${timestamp}] ${messageType}: ${messageText}`);
    } catch (error) {
        console.error(`Error logging interaction: ${error}`);
    }
}

// ── Load product embeddings from local or S3 ──
async function loadProductEmbeddings(embedsPath) {
    try {
        if (embedsPath.startsWith("s3://")) {
            // S3 implementation would go here
            // For now, we'll just load from local file
            console.warn("S3 loading not implemented yet, loading from local file");
        }
        
        if (await fs.pathExists(embedsPath)) {
            const data = await fs.readJson(embedsPath);
            return data;
        } else {
            console.warn(`Embeddings file not found: ${embedsPath}`);
            return [];
        }
    } catch (error) {
        console.error(`Error loading product embeddings: ${error}`);
        return [];
    }
}

// ── Load behavior rules ──
async function loadBehaviorRules(rulesPath) {
    try {
        if (await fs.pathExists(rulesPath)) {
            const data = await fs.readJson(rulesPath);
            return data;
        } else {
            console.warn(`Behavior rules file not found: ${rulesPath}`);
            return {};
        }
    } catch (error) {
        console.error(`Error loading behavior rules: ${error}`);
        return {};
    }
}

// ── Get current GMT time string ──
function getGmtTime() {
    return new Date().toUTCString();
}

function logChatToCsv({ chat_id, session_id, message_type, message_text, timestamp, user_agent, ip_address, user_info }) {
  const fileExists = fs.existsSync(CHAT_LOGS_FILE);
  const writer = csvWriter({
    path: CHAT_LOGS_FILE,
    header: [
      { id: 'chat_id', title: 'chat_id' },
      { id: 'session_id', title: 'session_id' },
      { id: 'message_type', title: 'message_type' },
      { id: 'message_text', title: 'message_text' },
      { id: 'timestamp', title: 'timestamp' },
      { id: 'user_agent', title: 'user_agent' },
      { id: 'ip_address', title: 'ip_address' },
      { id: 'user_info', title: 'user_info' }
    ],
    append: fileExists
  });
  return writer.writeRecords([
    { chat_id, session_id, message_type, message_text, timestamp, user_agent, ip_address, user_info: JSON.stringify(user_info || {}) }
  ]);
}

async function uploadToS3(filePath, s3Key) {
  if (!s3) {
    console.warn('S3 client not available. Skipping upload.');
    return false;
  }
  try {
    const fileContent = fs.readFileSync(filePath);
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: fileContent
    });
    await s3.send(command);
    console.log(`Successfully uploaded ${filePath} to s3://${S3_BUCKET}/${s3Key}`);
    return true;
  } catch (e) {
    console.error('Error uploading to S3:', e.message);
    return false;
  }
}

// ── Semantic Search Functions ──
function embedQuery(query, maxSize = 500) {
    // Simplified embedding - in real implementation, you'd use OpenAI embeddings
    const words = query.toLowerCase().split(/\s+/);
    const embedding = new Array(1536).fill(0); // OpenAI embedding size
    
    // Simple hash-based embedding for demo
    words.forEach((word, index) => {
        const hash = word.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        const position = Math.abs(hash) % embedding.length;
        embedding[position] = 1;
    });
    
    return embedding;
}

function cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

function semanticSearch(query, products, k = 3) {
    const queryEmbedding = embedQuery(query);
    
    const similarities = products.map(product => ({
        product,
        similarity: cosineSimilarity(queryEmbedding, product.embedding)
    }));
    
    return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k)
        .map(item => item.product);
}

// ── Product Search Functions ──
function keywordSearch(query, products, k = 3) {
    const lowerQuery = query.toLowerCase();
    
    const matches = products.filter(product => {
        const title = product.title?.toLowerCase() || '';
        const description = product.description?.toLowerCase() || '';
        const tags = product.tags?.join(' ').toLowerCase() || '';
        
        return title.includes(lowerQuery) || 
               description.includes(lowerQuery) || 
               tags.includes(lowerQuery);
    });
    
    return matches.slice(0, k);
}

// ── Brand Functions ──
function checkShopifyBrand(brand, knownBrands) {
    const lowerBrand = brand.toLowerCase();
    return knownBrands.has(lowerBrand);
}

function stripBrand(title) {
    // Simple brand stripping - you can enhance this
    const commonBrands = ['cerave', 'cetaphil', 'neutrogena', 'la roche-posay', 'the ordinary'];
    let strippedTitle = title.toLowerCase();
    
    commonBrands.forEach(brand => {
        strippedTitle = strippedTitle.replace(new RegExp(brand, 'gi'), '').trim();
    });
    
    return strippedTitle;
}

// ── Product Functions ──
function findProductByName(name, products) {
    const lowerName = name.toLowerCase();
    return products.find(product => 
        product.title?.toLowerCase().includes(lowerName) ||
        product.description?.toLowerCase().includes(lowerName)
    );
}

function getProductIngredients(product) {
    // Extract ingredients from product description or tags
    const description = product.description || '';
    const tags = product.tags || [];
    
    // Look for ingredients in description
    const ingredientMatch = description.match(/ingredients?[:\s]+([^.]+)/i);
    if (ingredientMatch) {
        return ingredientMatch[1].trim();
    }
    
    // Look for ingredients in tags
    const ingredientTags = tags.filter(tag => 
        tag.toLowerCase().includes('ingredient') ||
        tag.toLowerCase().includes('contains')
    );
    
    return ingredientTags.length > 0 ? ingredientTags.join(', ') : 'Ingredients not available';
}

const CART_STORAGE_FILE = path.join(__dirname, '../backend/cart_storage.json');
let cartCounter = 1;
let userCarts = {};

function loadCartsFromStorage() {
  try {
    if (fs.existsSync(CART_STORAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CART_STORAGE_FILE, 'utf-8'));
      userCarts = data;
      return data;
    }
  } catch (e) {
    console.error('Error loading carts from storage:', e.message);
  }
  return {};
}

function saveCartsToStorage() {
  try {
    fs.writeFileSync(CART_STORAGE_FILE, JSON.stringify(userCarts, null, 2), 'utf-8');
    console.log(`Saved ${Object.keys(userCarts).length} carts to storage`);
  } catch (e) {
    console.error('Error saving carts to storage:', e.message);
  }
}

function generateCartId() {
  const cartId = `CART${String(cartCounter).padStart(6, '0')}`;
  cartCounter += 1;
  return cartId;
}

function createCartPage(cartItems, userInfo = {}) {
  const cartId = generateCartId();
  const totalPrice = cartItems.reduce((sum, item) => sum + (item.final_price || 0), 0);
  const now = new Date().toISOString();
  const cartData = {
    id: cartId,
    items: cartItems,
    total_price: totalPrice,
    created_at: now,
    updated_at: now,
    user_info: userInfo,
    item_count: cartItems.length,
    never_expires: true,
    persistent: true
  };
  userCarts[cartId] = cartData;
  saveCartsToStorage();
  return cartId;
}

const BRANDS_CSV_PATH = path.join(__dirname, '../backend/Brands.csv');

function loadKnownBrands() {
  const knownBrands = new Set();
  if (fs.existsSync(BRANDS_CSV_PATH)) {
    const csvData = fs.readFileSync(BRANDS_CSV_PATH, 'utf-8');
    const records = csvParse.parse(csvData, { skip_empty_lines: true });
    for (const row of records) {
      if (!row[0] || row[0].startsWith('#') || !row[0].trim()) continue;
      knownBrands.add(row[0].trim().toLowerCase());
    }
  } else {
    // Removed Brands.csv warning
  }
  return knownBrands;
}

const knownBrands = loadKnownBrands();

// Load carts on startup
loadCartsFromStorage();

// Utility functions for chat, product, and brand handling

// Common typo correction
const COMMON_TYPOS = {
  'uour': 'your',
  'whats': 'what is',
  'wher': 'where',
  'adress': 'address',
  'phne': 'phone',
  'contatc': 'contact',
  'numbr': 'number',
  'moisturiser': 'moisturizer',
};
function correctTypos(text) {
  if (!text) return text;
  return text.split(' ').map(w => COMMON_TYPOS[w] || w).join(' ');
}

// Extract product name from user query
function extractProductName(userQ) {
  const m = /ingredients.*?([A-Za-z0-9\- ]+)/i.exec(userQ);
  if (m) return m[1].trim();
  return null;
}

// Extract brand name from user query (simple heuristic)
function extractBrandName(userQ, brands) {
  const lower = userQ.toLowerCase();
  for (const brand of brands) {
    if (brand && lower.includes(brand.toLowerCase())) {
      return brand;
    }
  }
  return null;
}

function loadChatHistory(sessionId) {
  let allHistory = {};
  if (fs.existsSync(CHAT_HISTORY_FILE)) {
    try {
      allHistory = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf-8'));
    } catch (e) {
      allHistory = {};
    }
  }
  return allHistory[sessionId] || [];
}

function saveChatHistory(sessionId, history) {
  let allHistory = {};
  if (fs.existsSync(CHAT_HISTORY_FILE)) {
    try {
      allHistory = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf-8'));
    } catch (e) {
      allHistory = {};
    }
  }
  allHistory[sessionId] = history;
  fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(allHistory, null, 2), 'utf-8');
}

const USER_PROFILE_FILE = path.join(__dirname, '../backend/user_profiles.json');

function loadUserProfile(sessionId) {
  let allProfiles = {};
  if (fs.existsSync(USER_PROFILE_FILE)) {
    try {
      allProfiles = JSON.parse(fs.readFileSync(USER_PROFILE_FILE, 'utf-8'));
    } catch (e) {
      allProfiles = {};
    }
  }
  return allProfiles[sessionId] || {};
}

function saveUserProfile(sessionId, profile) {
  let allProfiles = {};
  if (fs.existsSync(USER_PROFILE_FILE)) {
    try {
      allProfiles = JSON.parse(fs.readFileSync(USER_PROFILE_FILE, 'utf-8'));
    } catch (e) {
      allProfiles = {};
    }
  }
  allProfiles[sessionId] = profile;
  fs.writeFileSync(USER_PROFILE_FILE, JSON.stringify(allProfiles, null, 2), 'utf-8');
}

module.exports = {
  userCarts,
  loadCartsFromStorage,
  saveCartsToStorage,
  generateCartId,
  createCartPage,
  knownBrands,
  logChatToCsv,
  uploadToS3,
  correctTypos,
  extractProductName,
  extractBrandName,
  loadChatHistory,
  saveChatHistory,
  loadUserProfile,
  saveUserProfile
}; 
