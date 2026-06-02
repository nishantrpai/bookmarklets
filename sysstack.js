#!/usr/bin/env node

/*
Usage:
  node stackscan.js https://example.com
  node stackscan.js urls.txt
*/

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const SIGNATURES = {
  WordPress: [
    'wp-content',
    'wp-includes'
  ],

  NextJS: [
    '__NEXT_DATA__',
    '_next/static'
  ],

  Nuxt: [
    '__NUXT__'
  ],

  React: [
    'react'
  ],

  Vue: [
    'vue'
  ],

  Astro: [
    'astro-island'
  ],

  Shopify: [
    'shopify'
  ],

  Webflow: [
    'webflow'
  ],

  Wix: [
    'wixstatic'
  ],

  Cloudflare: [
    'cf-ray',
    'cf-cache-status'
  ]
};

function fetch(target, redirects = 0) {
  return new Promise((resolve, reject) => {

    if (redirects > 5) {
      return reject(new Error('Too many redirects'));
    }

    const parsed = new URL(target);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request(target, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 15000
    }, res => {

      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        const redirectUrl = new URL(
          res.headers.location,
          target
        ).href;

        return resolve(fetch(redirectUrl, redirects + 1));
      }

      let body = '';

      res.on('data', chunk => {
        body += chunk.toString();
      });

      res.on('end', () => {
        resolve({
          headers: res.headers,
          body,
          status: res.statusCode
        });
      });
    });

    req.on('error', reject);

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.end();
  });
}

function detect(headers, body) {

  const haystack = (
    JSON.stringify(headers) + '\n' + body
  ).toLowerCase();

  const found = [];

  for (const [name, markers] of Object.entries(SIGNATURES)) {

    for (const marker of markers) {

      if (haystack.includes(marker.toLowerCase())) {
        found.push(name);
        break;
      }
    }
  }

  return [...new Set(found)];
}

function detectServer(headers) {

  const server = headers.server || '';

  if (/nginx/i.test(server)) return 'nginx';
  if (/apache/i.test(server)) return 'apache';
  if (/litespeed/i.test(server)) return 'LiteSpeed';

  return server || 'unknown';
}

function extractGenerator(html) {

  const match = html.match(
    /<meta[^>]*name=["']generator["'][^>]*content=["']([^"']+)["']/i
  );

  return match ? match[1] : null;
}

function extractInterestingScripts(html) {

  const matches = [
    ...html.matchAll(
      /<script[^>]*src=["']([^"']+)["']/gi
    )
  ];

  const scripts = matches.map(m => m[1]);

  return scripts.filter(x =>
    /analytics|gtag|google|facebook|segment|hotjar|stripe|hubspot|cdn/i.test(x)
  );
}

async function scan(url) {

  try {

    const result = await fetch(url);

    const detected = detect(
      result.headers,
      result.body
    );

    const server = detectServer(
      result.headers
    );

    const generator = extractGenerator(
      result.body
    );

    const scripts = extractInterestingScripts(
      result.body
    );

    console.log('\n==================================================');
    console.log(url);
    console.log('==================================================');

    console.log(`Status     : ${result.status}`);
    console.log(`Server     : ${server}`);

    console.log(
      `Stack      : ${
        detected.length
          ? detected.join(', ')
          : 'Unknown'
      }`
    );

    if (generator) {
      console.log(`Generator  : ${generator}`);
    }

    if (scripts.length) {

      console.log('Interesting:');

      scripts.forEach(s => {
        console.log(`  - ${s}`);
      });
    }

  } catch (err) {

    console.log('\n==================================================');
    console.log(url);
    console.log('==================================================');

    console.log(`Error: ${err.message}`);
  }
}

async function main() {

  const input = process.argv[2];

  if (!input) {

    console.log('Usage:');
    console.log('node stackscan.js https://example.com');
    console.log('node stackscan.js urls.txt');

    process.exit(1);
  }

  let targets = [];

  if (
    fs.existsSync(input) &&
    fs.statSync(input).isFile()
  ) {

    targets = fs.readFileSync(input, 'utf8')
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);

  } else {

    targets = [input];
  }

  for (const url of targets) {
    await scan(url);
  }
}

main();
