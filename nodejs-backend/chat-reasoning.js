// chat-reasoning.js
// AI chat, semantic search, and helpers migrated from Python Flask app.py

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const dotenv = require('dotenv');
dotenv.config();
const csvParse = require('csv-parse/sync');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const streamToString = async (stream) => {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
};

// Disable Brands.csv usage
let brands = [];
function isBrandQuery(text) {
  return null;
}

const EMBEDS_PATH = process.env.EMBEDS_PATH || 'product_embeddings_small.json';
const BEHAVIOR_RULES_PATH = process.env.BEHAVIOR_RULES_PATH || path.join(__dirname, '../backend/behavior_rules.json');
const FINE_TUNED_MODEL = process.env.FINE_TUNED_MODEL || 'ft:gpt-3.5-turbo-0125:personal::BunGDkYK';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function loadProductEmbeddingsAsync() {
  if (EMBEDS_PATH.startsWith('s3://')) {
    // Parse S3 path
    const match = EMBEDS_PATH.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error('Invalid S3 path for embeddings');
    const bucket = match[1];
    const key = match[2];
    const s3 = new S3Client({
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    console.log(`Downloading embeddings from S3: bucket=${bucket}, key=${key}`);
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3.send(command);
    const jsonStr = await streamToString(response.Body);
    const arr = JSON.parse(jsonStr);
    console.log('Loaded products from S3:', arr.length);
    return arr;
  } else {
    // Load from local file
    const filePath = path.join(__dirname, EMBEDS_PATH);
    if (!fs.existsSync(filePath)) {
      console.log(`Local embeddings file not found: ${filePath}`);
      return [];
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    const arr = JSON.parse(data);
    console.log('Loaded products from local file:', arr.length);
    return arr;
  }
}

// Export a promise for products
const productsPromise = loadProductEmbeddingsAsync();

// Load behavior_rules.json for dynamic prompt construction
let behaviorRules = [];
try {
  const rulesJson = fs.readFileSync(path.join(__dirname, '../backend/behavior_rules.json'), 'utf-8');
  behaviorRules = JSON.parse(rulesJson);
  console.log('Loaded behavior rules:', behaviorRules.length);
} catch (e) {
  console.warn('Could not load behavior_rules.json:', e.message);
}

function getBehaviorRulesForQuery(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  // Simple matching: return rules whose 'when' or 'rule' field matches the query
  return behaviorRules.filter(rule => {
    if (rule.when && lower.includes(rule.when.toLowerCase().split(' ')[0])) return true;
    if (rule.rule && lower.includes(rule.rule.toLowerCase().split(' ')[0])) return true;
    return false;
  });
}

// Disable training.csv usage
let trainingData = [];
function getTrainingAnswer(text) {
  return null;
}
function getFewShotExamples(text, n = 3) {
  return [];
}

// Semantic search helpers
// Cosine similarity between two vectors
function cosineSimilarity(a, b) {
  let dot = 0, aNorm = 0, bNorm = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

// Semantic search (using cosine similarity)
async function semanticSearch(query, k = 3, productsOverride = null) {
  // Extract product terms from query for better search
  const productTerms = extractProductTerms(query);
  console.log(`[DEBUG] Extracted product terms from "${query}":`, productTerms);
  
  // Use provided products or fall back to global products
  const productsToUse = productsOverride || products;
  
  // First, try fuzzy search for brand/product names
  const fuzzyResults = fuzzySearch(query, null, k * 2);
  if (fuzzyResults.length > 0) {
    console.log(`[DEBUG] Found ${fuzzyResults.length} fuzzy search results for "${query}"`);
    console.log(`[DEBUG] Fuzzy results: ${fuzzyResults.map(p => p.title).join(', ')}`);
    return fuzzyResults.slice(0, k);
  }
  
  // Try semantic search with original query
  const vec = await embedQuery(query);
  if (vec && productsToUse.length) {
    let sims = productsToUse.map(p => cosineSimilarity(vec, p.embedding));
    let idxs = sims.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, k).map(x => x[1]);
    const semanticResults = idxs.map(i => productsToUse[i]);
    
    // Check if semantic results are actually relevant (similarity > threshold)
    const relevantResults = semanticResults.filter((_, index) => sims[idxs[index]] > 0.1);
    
    if (relevantResults.length > 0) {
      console.log(`[DEBUG] Found ${relevantResults.length} relevant semantic results`);
      return relevantResults;
    } else {
      console.log(`[DEBUG] Semantic results found but not relevant enough, falling back to keyword search`);
    }
  }
  
  // Fallback to keyword search with extracted product terms
  if (productTerms.length > 0) {
    console.log(`[DEBUG] Trying keyword search with terms: ${productTerms.join(' ')}`);
    const keywordResults = keywordSearch(productTerms.join(' '), k, productsToUse);
    console.log(`[DEBUG] Found ${keywordResults.length} keyword results`);
    return keywordResults;
  }
  
  // Final fallback to original query
  console.log(`[DEBUG] Final fallback to original query: "${query}"`);
  return keywordSearch(query, k, productsToUse);
}

// Extract product terms from query
function extractProductTerms(query) {
  const textClean = query.toLowerCase();
  const productTerms = [];
  
  // Common product keywords
  const productKeywords = [
    'soap', 'soaps', 'cream', 'creams', 'lotion', 'lotions', 'serum', 'serums',
    'cleanser', 'cleansers', 'wash', 'washes', 'mask', 'masks', 'moisturizer',
    'moisturisers', 'shampoo', 'shampoos', 'conditioner', 'conditioners',
    'toner', 'toners', 'oil', 'oils', 'scrub', 'scrubs', 'foundation',
    'foundations', 'concealer', 'concealers', 'mascara', 'mascaras',
    'lipstick', 'lipsticks', 'blush', 'blushes', 'eyeshadow', 'eyeshadows',
    'perfume', 'perfumes', 'cologne', 'colgnes', 'makeup', 'make-up',
    'skincare', 'skin care', 'hair', 'haircare', 'hair care'
  ];
  
  // Brand names
  const brandNames = [
    'olay', 'maybelline', 'clinique', 'loreal', 'neutrogena', 'dove',
    'nivea', 'vaseline', 'johnson', 'palmolive', 'colgate', 'gillette',
    'revlon', 'covergirl', 'rimmel', 'max factor', 'essence', 'catrice',
    'nyx', 'elf', 'milani', 'physicians formula', 'hard candy', 'pop beauty',
    'jordana', 'la colors', 'black radiance', 'imani', 'black opal',
    'fashion fair', 'sacha', 'tiam'
  ];
  
  // Skin concerns and conditions
  const skinConcerns = [
    'dark', 'darkness', 'dark spots', 'dark circles', 'dark knuckles', 'dark elbows', 'dark knees',
    'acne', 'pimples', 'blackheads', 'whiteheads', 'breakouts',
    'wrinkles', 'fine lines', 'aging', 'anti-aging', 'anti aging',
    'dry', 'dryness', 'dehydrated', 'moisture', 'hydrating',
    'oily', 'oiliness', 'greasy', 'shiny',
    'sensitive', 'irritation', 'redness', 'inflammation',
    'hyperpigmentation', 'pigmentation', 'spots', 'blemishes',
    'scars', 'scarring', 'stretch marks',
    'large pores', 'pores', 'pore minimizing',
    'dull', 'dullness', 'brightening', 'brighten', 'glow',
    'uneven', 'uneven skin tone', 'skin tone', 'complexion',
    'rough', 'roughness', 'smooth', 'smoothing',
    'firm', 'firming', 'tight', 'tightening',
    'clear', 'clearing', 'clarifying'
  ];
  
  // Extract product keywords
  for (const keyword of productKeywords) {
    if (textClean.includes(keyword)) {
      productTerms.push(keyword);
    }
  }
  
  // Extract brand names
  for (const brand of brandNames) {
    if (textClean.includes(brand)) {
      productTerms.push(brand);
    }
  }
  
  // Extract skin concerns
  for (const concern of skinConcerns) {
    if (textClean.includes(concern)) {
      productTerms.push(concern);
    }
  }
  
  // If no specific terms found, extract meaningful words (3+ characters)
  if (productTerms.length === 0) {
    const words = textClean.split(/\s+/).filter(word => 
      word.length >= 3 && 
      !['the', 'and', 'for', 'with', 'need', 'want', 'looking', 'product', 'products'].includes(word)
    );
    productTerms.push(...words.slice(0, 3)); // Take first 3 meaningful words
  }
  
  return productTerms;
}

// Smart fuzzy search for brand/product names using products_with_brands.json
function fuzzySearch(query, productsOverride = null, maxResults = 10) {
  const queryClean = query.toLowerCase().trim();
  const results = [];
  
  // If query is too short, return empty
  if (queryClean.length < 2) return results;
  
  // Get first 3 letters for prefix matching
  const prefix = queryClean.substring(0, Math.min(3, queryClean.length));
  
  // Load products from products_with_brands.json if not provided
  let productsToSearch = productsOverride;
  if (!productsToSearch) {
    try {
      const fs = require('fs');
      const path = require('path');
      const productsPath = path.join(__dirname, '../products_with_brands.json');
      if (fs.existsSync(productsPath)) {
        const data = fs.readFileSync(productsPath, 'utf-8');
        productsToSearch = JSON.parse(data);
        console.log(`[DEBUG] Loaded ${productsToSearch.length} products from products_with_brands.json for fuzzy search`);
      } else {
        console.log(`[DEBUG] products_with_brands.json not found, using provided products`);
        productsToSearch = products || [];
      }
    } catch (error) {
      console.log(`[DEBUG] Error loading products_with_brands.json: ${error.message}`);
      productsToSearch = products || [];
    }
  }
  
  for (const product of productsToSearch) {
    const title = product.title ? product.title.toLowerCase() : '';
    const brand = product.brand ? product.brand.toLowerCase() : '';
    
    // Check if title starts with the prefix
    if (title.startsWith(prefix)) {
      results.push({ product, score: 1.0, matchType: 'prefix' });
    }
    // Check if brand starts with the prefix
    else if (brand && brand.startsWith(prefix)) {
      results.push({ product, score: 0.9, matchType: 'brand_prefix' });
    }
    // Check if title contains the query
    else if (title.includes(queryClean)) {
      results.push({ product, score: 0.8, matchType: 'contains' });
    }
    // Check if brand contains the query
    else if (brand && brand.includes(queryClean)) {
      results.push({ product, score: 0.7, matchType: 'brand_contains' });
    }
    // Check for similar words (fuzzy matching)
    else if (title.split(' ').some(word => word.startsWith(prefix))) {
      results.push({ product, score: 0.6, matchType: 'word_prefix' });
    }
  }
  
  // Sort by score and return top results
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, maxResults).map(r => r.product);
  
  console.log(`[DEBUG] Fuzzy search for "${query}" (prefix: "${prefix}") found ${topResults.length} results`);
  if (topResults.length > 0) {
    console.log(`[DEBUG] Top fuzzy results: ${topResults.map(p => p.title).join(', ')}`);
  }
  
  return topResults;
}

// Helpers
function isProductIntent(text) {
  if (!text) return false;
  const vaguePhrases = [
    "i need something", "help me", "i need help", "what do you have", "show me"
  ];
  const simpleResponses = [
    "yes", "no", "okay", "ok", "thanks", "thank you", "sure", "maybe"
  ];
  const followUpQuestions = [
    "other", "others", "more", "different", "types", "kinds", "varieties", "options", "alternatives", "similar", "like this", "same"
  ];
  const textClean = text.trim().toLowerCase();
  
  // Handle follow-up questions about products
  if (followUpQuestions.some(word => textClean.includes(word))) return true;
  
  // Handle "yes i need [product]" type queries
  if (textClean.includes("yes") && textClean.includes("need")) {
    // Check if there's a product term after "need"
    const needIndex = textClean.indexOf("need");
    const afterNeed = textClean.substring(needIndex + 4).trim();
    if (afterNeed.length > 0) return true;
  }
  
  // Handle "yes i need [product]" type queries - more flexible
  if (textClean.includes("yes") && textClean.includes("need")) {
    return true; // Always treat as product query if contains "yes" and "need"
  }
  
  if (textClean.split(/\s+/).length <= 2 && simpleResponses.includes(textClean)) return false;
  // Allow single words that might be brand names (like "tiam", "olay", etc.)
  if (textClean.split(/\s+/).length === 1 && /^[A-Z]/.test(textClean) && !["soap","soaps","cream","creams","lotion","lotions","buy","order","price","skincare","niacinamide","tiam","olay","clinique","maybelline","loreal","neutrogena","dove","nivea","vaseline","johnson","palmolive","colgate","gillette","revlon","covergirl","rimmel","essence","catrice","nyx","elf","milani","jordana","imani"].includes(textClean)) {
    // For short queries (2-4 letters), treat as potential brand/product query
    if (textClean.length >= 2 && textClean.length <= 4) {
      return true;
    }
    return false;
  }
  if (vaguePhrases.some(phrase => textClean.includes(phrase))) return false;
  
  // Enhanced product regex with more terms
  const productRegex = /\b(soap|soaps|cream|creams|lotion|lotions|serum|serums|cleanser|cleansers|wash|washes|mask|masks|moisturizer|moisturiser|moisturizers|moisturisers|shampoo|shampoos|conditioner|conditioners|toner|toners|oil|oils|scrub|scrubs|foundation|foundations|concealer|concealers|mascara|mascaras|lipstick|lipsticks|blush|blushes|eyeshadow|eyeshadows|perfume|perfumes|cologne|colgnes|makeup|make-up|skincare|skin care|hair|haircare|hair care|product|products|buy|order|price|niacinamide|sensitive skin|wrinkle|wrinkles|acne|brighten|brightening|dark spot|spots|hyperpigmentation|fragrance|fragrances|brand|brands|olay|maybelline|clinique|loreal|neutrogena|dove|nivea|vaseline|johnson|palmolive|colgate|gillette|revlon|covergirl|rimmel|max factor|essence|catrice|nyx|elf|milani|physicians formula|hard candy|pop beauty|jordana|la colors|black radiance|imani|black opal|fashion fair|sacha|tiam)\b/i;
  return productRegex.test(textClean);
}

function getDynamicSuggestions(userQ) {
  const q = userQ.toLowerCase();
  if (q.includes("soap")) return ["bar soap", "liquid soap", "moisturizing soap", "fragrance-free soap", "What ingredients does this soap have?"];
  if (q.includes("brighten") || q.includes("brightening")) return ["skin brightening creams", "skin brightening serums", "best products for skin brightening", "What ingredients help with skin brightening?"];
  if (q.includes("order") || q.includes("buy")) return ["What payment methods do you accept?", "How long does delivery take?", "Can I track my order?", "Do you deliver nationwide?"];
  if (q.includes("delivery")) return ["What are your delivery options?", "How long does delivery take?", "Do you deliver nationwide?", "Can I track my delivery?"];
  if (q.includes("brand")) return ["Do you sell this brand?", "Show me all brands", "Popular brands", "Best-selling brands"];
  if (q.includes("skincare")) return ["best skincare for oily skin", "skincare for dry skin", "skincare routine", "What ingredients does this skincare have?"];
  if (q.includes("makeup") || q.includes("best makeup brands")) return ["foundation", "concealer", "mascara", "lipstick", "blush", "eyeshadow"];
  if (q.includes("foundation")) return ["liquid foundation", "powder foundation", "best foundation for oily skin", "best foundation for dry skin"];
  if (q.includes("concealer")) return ["best concealer for dark circles", "liquid concealer", "stick concealer", "How do I apply concealer?"];
  return [
    "What are the best products for skin brightening?",
    "What are your store hours?",
    "How can I order?",
    "Do you sell this brand?",
    "What ingredients does this product have?",
    "What are your delivery options?"
  ];
}

// Clean AI reply
function cleanAIReply(reply, isFirstMessage = false) {
  let lines = reply.split('\n');
  lines = lines.filter(line => !/^\s*\d+\.?\s*$/.test(line));
  lines = lines.map(line => line.replace(/^\s*([\d]+[\.)]|[-•])\s*/, ''));
  let cleaned = lines.join('\n');
  if (!isFirstMessage) {
    cleaned = cleaned.replace(/^(hi|hello|hey|greetings)[!,.\s-]*/i, '');
    cleaned = cleaned.replace(/^(there!|there,|there\.|there\s+)/i, '');
  }
  return cleaned.trim();
}

// Semantic search (using cosine similarity)
async function embedQuery(query) {
  try {
    const resp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });
    let vec = resp.data[0].embedding;
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map(v => v / norm);
  } catch (e) {
    console.error('Embedding error:', e.message);
    return null;
  }
}

function keywordSearch(query, k = 3, productsOverride = null) {
  const queryLc = query.toLowerCase();
  const productsToUse = productsOverride || products;
  
  console.log(`[DEBUG] Keyword search for "${query}" (${queryLc})`);
  console.log(`[DEBUG] Total products loaded: ${productsToUse.length}`);
  
  // Split query into words for better matching
  const queryWords = queryLc.split(/\s+/).filter(word => word.length >= 3);
  
  let results = [];
  
  // First, try exact phrase match
  let exactMatches = productsToUse.filter(p => p.title.toLowerCase().includes(queryLc));
  if (exactMatches.length > 0) {
    console.log(`[DEBUG] Found ${exactMatches.length} exact phrase matches`);
    results.push(...exactMatches.map(p => ({ product: p, score: 1.0, matchType: 'exact' })));
  }
  
  // Then try individual word matches
  for (const word of queryWords) {
    const wordMatches = productsToUse.filter(p => p.title.toLowerCase().includes(word));
    console.log(`[DEBUG] Found ${wordMatches.length} products containing word "${word}"`);
    
    for (const product of wordMatches) {
      const existingIndex = results.findIndex(r => r.product.title === product.title);
      if (existingIndex >= 0) {
        // Boost score for multiple word matches
        results[existingIndex].score += 0.5;
      } else {
        results.push({ product, score: 0.5, matchType: 'word' });
      }
    }
  }
  
  // Also check description and tags if available
  for (const product of productsToUse) {
    const description = (product.description || '').toLowerCase();
    const tags = (product.tags || []).map(tag => tag.toLowerCase());
    
    for (const word of queryWords) {
      if (description.includes(word) || tags.some(tag => tag.includes(word))) {
        const existingIndex = results.findIndex(r => r.product.title === product.title);
        if (existingIndex >= 0) {
          results[existingIndex].score += 0.3;
        } else {
          results.push({ product, score: 0.3, matchType: 'description' });
        }
      }
    }
  }
  
  // Sort by score and remove duplicates
  results.sort((a, b) => b.score - a.score);
  const uniqueResults = [];
  const seenTitles = new Set();
  
  for (const result of results) {
    if (!seenTitles.has(result.product.title)) {
      uniqueResults.push(result.product);
      seenTitles.add(result.product.title);
    }
  }
  
  const finalResults = uniqueResults.slice(0, k);
  console.log(`[DEBUG] Returning ${finalResults.length} results`);
  
  return finalResults;
}

function getFAQAnswer(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  // Example FAQ answers (customize as needed)
  if (/store hours|open|close|when.*open|when.*close/.test(lower)) {
    return "🕒 Our store hours are: Monday–Saturday: 8:00 AM–8:00 PM, Sunday: 1:00 PM–7:00 PM.";
  }
  if (/where.*(located|address|find you)/.test(lower)) {
    return "📍 We are located at Tejuosho Ultra Modern Shopping Centre, Mosque Plaza, Yaba, Lagos.";
  }
  if (/deliver|shipping|nationwide|outside lagos/.test(lower)) {
    return "🚚 Yes, we deliver nationwide! Delivery times and costs depend on your location and will be calculated at checkout.";
  }
  if (/return|refund|exchange/.test(lower)) {
    return "🔄 We do not offer returns unless there's a product issue. Please contact us if you have a problem with your order.";
  }
  // Check behavior rules for FAQ-like rules
  const rules = getBehaviorRulesForQuery(text);
  for (const rule of rules) {
    if (rule.then && /respond|state|explain|clarify|guide|acknowledge|mention|provide|say|answer|clearly|policy|process|address|location|hours|delivery|return|refund|exchange|shipping|contact|store/.test(rule.then.toLowerCase())) {
      return rule.then;
    }
  }
  return null;
}

// Merge and deduplicate product results from multiple sources
function mergeProductResults(...sources) {
  const seen = new Set();
  const merged = [];
  for (const source of sources) {
    for (const p of source) {
      const key = p.handle || p.title;
      if (key && !seen.has(key)) {
        merged.push(p);
        seen.add(key);
      }
    }
  }
  return merged;
}

module.exports = {
  isProductIntent,
  getDynamicSuggestions,
  cleanAIReply,
  semanticSearch,
  keywordSearch,
  productsPromise,
  behaviorRules,
  FINE_TUNED_MODEL,
  openai,
  isBrandQuery,
  getBehaviorRulesForQuery,
  getFAQAnswer,
  getTrainingAnswer,
  getFewShotExamples,
  mergeProductResults
}; 


