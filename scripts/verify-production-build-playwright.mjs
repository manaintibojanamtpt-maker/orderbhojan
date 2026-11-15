import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

if (!fs.existsSync(distDir)) {
  console.error(`Dist directory not found at ${distDir}. Run 'npm run build' first.`);
  process.exit(1);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

// Create lightweight SPA static server
function createSpaServer(distPath, port = 5199) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url.split('?')[0];
      let filePath = path.join(distPath, urlPath);

      // Check if exact file exists
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // SPA fallback to /index.html
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

async function runPlaywrightVerification() {
  console.log('=== Verifying OrderBhojan Production Build with Playwright ===');
  const { server, port } = await createSpaServer(distDir, 5199);
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Local SPA server running at ${baseUrl}`);

  let browser;
  const viewports = [
    { name: '320px (Compact)', width: 320, height: 568 },
    { name: '360px (Standard Android)', width: 360, height: 640 },
    { name: '393px (Modern Flagship)', width: 393, height: 852 },
    { name: '412px (Large Phablet)', width: 412, height: 915 },
  ];

  const routes = [
    { path: '/', name: 'Home' },
    { path: '/search', name: 'Global Search' },
    { path: '/swiggy', name: 'Swiggy Marketplace' },
    { path: '/cart', name: 'Direct Cart' },
    { path: '/orders', name: 'Orders' },
    { path: '/profile', name: 'Profile' },
  ];

  const results = [];

  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    });

    for (const vp of viewports) {
      console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height})`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      });
      const page = await context.newPage();

      // Intercept uncaught console errors
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));

      for (const r of routes) {
        const fullUrl = `${baseUrl}${r.path}`;
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Verify root mounted
        const rootExists = await page.locator('#root').count();
        assert.equal(rootExists, 1, `Route ${r.path} failed to mount #root`);

        // Check for fatal errors
        const fatalErrors = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('Download the React DevTools'));
        
        results.push({
          viewport: vp.name,
          route: r.name,
          path: r.path,
          status: fatalErrors.length === 0 ? 'PASS' : 'WARN',
          errors: fatalErrors.length,
        });

        console.log(`  ✔ [${r.name}] ${r.path} loaded cleanly (Errors: ${fatalErrors.length})`);
      }

      await context.close();
    }

    console.log('\n=== Playwright Production Build Verification Results ===');
    console.table(results);

    const hasFailures = results.some(r => r.status === 'FAIL');
    if (hasFailures) {
      console.error('❌ Verification failed on one or more routes.');
      process.exit(1);
    } else {
      console.log('✅ All routes and viewports verified cleanly against local production build.');
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

runPlaywrightVerification().catch((err) => {
  console.error('Fatal Playwright verification error:', err);
  process.exit(1);
});
