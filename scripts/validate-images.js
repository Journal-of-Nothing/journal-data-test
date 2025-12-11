#!/usr/bin/env node

/**
 * Validate image URLs in a markdown file
 * Usage: node validate-images.js <markdown-file-path>
 */

const fs = require('fs').promises;
const axios = require('axios');

const BLACKLISTED_DOMAINS = [
  'spam.io',
  'malicious-host.com',
  'unsafe-cdn.net'
];

const TIMEOUT_MS = 3000;

async function extractImageUrls(markdown) {
  const imageRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g;
  const urls = [];
  let match;
  
  while ((match = imageRegex.exec(markdown)) !== null) {
    urls.push(match[1]);
  }
  
  return urls;
}

function isBlacklisted(url) {
  try {
    const urlObj = new URL(url);
    return BLACKLISTED_DOMAINS.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

async function validateImageUrl(url) {
  // Check blacklist
  if (isBlacklisted(url)) {
    return {
      url,
      valid: false,
      error: 'Domain is blacklisted'
    };
  }
  
  try {
    // HEAD request to check content type
    const response = await axios.head(url, {
      timeout: TIMEOUT_MS,
      validateStatus: (status) => status < 500
    });
    
    const contentType = response.headers['content-type'] || '';
    
    if (!contentType.startsWith('image/')) {
      return {
        url,
        valid: false,
        error: `Invalid content type: ${contentType} (expected image/*)`
      };
    }
    
    return {
      url,
      valid: true,
      contentType
    };
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      return {
        url,
        valid: false,
        error: `Timeout after ${TIMEOUT_MS}ms`
      };
    }
    
    return {
      url,
      valid: false,
      error: error.message
    };
  }
}

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.error('Usage: node validate-images.js <markdown-file-path>');
    process.exit(1);
  }
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const imageUrls = await extractImageUrls(content);
    
    if (imageUrls.length === 0) {
      console.log('✓ No images found in the document');
      process.exit(0);
    }
    
    console.log(`Found ${imageUrls.length} image(s), validating...`);
    
    const results = await Promise.all(
      imageUrls.map(url => validateImageUrl(url))
    );
    
    const invalid = results.filter(r => !r.valid);
    
    if (invalid.length > 0) {
      console.error(`\n❌ ${invalid.length} invalid image(s) found:\n`);
      invalid.forEach(r => {
        console.error(`  ${r.url}`);
        console.error(`    Error: ${r.error}\n`);
      });
      process.exit(1);
    }
    
    console.log(`✓ All ${imageUrls.length} image(s) are valid`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
