const axios = require('axios');

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_URL || 'shopmamatega.com';
const SHOPIFY_STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;
const SHOPIFY_API_URL = `https://${SHOPIFY_DOMAIN}/api/2023-04/graphql.json`;

async function shopifyGraphQL(query, variables = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN
  };
  const response = await axios.post(SHOPIFY_API_URL, { query, variables }, { headers });
  return response.data.data;
}

async function searchProducts(query, limit = 5) {
  const gql = `{
    products(first: ${limit}, query: "${query}") {
      edges {
        node {
          id
          title
          handle
          description
          productType
          vendor
          tags
          images(first: 1) { edges { node { src } } }
        }
      }
    }
  }`;
  const data = await shopifyGraphQL(gql);
  return data.products.edges.map(e => e.node);
}

async function listBrands(limit = 20) {
  const gql = `{
    products(first: 100) {
      edges { node { vendor } }
    }
  }`;
  const data = await shopifyGraphQL(gql);
  const brands = Array.from(new Set(data.products.edges.map(e => e.node.vendor))).filter(Boolean);
  return brands.slice(0, limit);
}

// Simple in-memory cache for product details
const productCache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedProduct(handle) {
  const entry = productCache[handle];
  if (entry && (Date.now() - entry.timestamp < CACHE_TTL)) {
    return entry.data;
  }
  return null;
}

function setCachedProduct(handle, data) {
  productCache[handle] = { data, timestamp: Date.now() };
}

async function getProductByHandle(handle) {
  // Check cache first
  const cached = getCachedProduct(handle);
  if (cached) return cached;
  const gql = `{
    productByHandle(handle: "${handle}") {
      id
      title
      handle
      description
      productType
      vendor
      tags
      images(first: 5) { edges { node { src } } }
    }
  }`;
  const data = await shopifyGraphQL(gql);
  setCachedProduct(handle, data.productByHandle);
  return data.productByHandle;
}

module.exports = {
  searchProducts,
  listBrands,
  getProductByHandle
}; 

