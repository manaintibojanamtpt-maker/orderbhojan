import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const failureScreenshotDir = path.resolve(__dirname, '../docs/playwright-failures');

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
export function createSpaServer(distPath, port = 5199) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url.split('?')[0];
      let filePath = path.join(distPath, urlPath);

      // Check if exact static file exists
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

export const CANONICAL_VIEWPORTS = [
  { name: '320px (Compact)', width: 320, height: 568 },
  { name: '360px (Standard Android)', width: 360, height: 640 },
  { name: '393px (Modern Flagship)', width: 393, height: 852 },
  { name: '412px (Large Phablet)', width: 412, height: 915 },
];

export const CANONICAL_ROUTES = [
  { path: '/', name: 'Home', expectedPattern: /OrderBhojan|HOME|DELIVER TO|Home kitchens/i },
  { path: '/search', name: 'Global Search', expectedPattern: /Menu|Search|Dishes|Kitchens/i },
  { path: '/cart', name: 'Direct Cart', expectedPattern: /Cart|Your Cart|cart is empty|Browse Home Kitchens/i },
  { path: '/orders', name: 'Orders', expectedPattern: /Orders/i },
  { path: '/profile', name: 'Profile', expectedPattern: /Profile/i },
  { path: '/orders/sample-order-probe/track', name: 'Deep-Link Tracking (SPA Fallback)', expectedPattern: /HOME|MENU|ORDERS|Order/i },
];

export async function verifyProductionBuild({
  distPath = distDir,
  port = 5199,
  viewports = CANONICAL_VIEWPORTS,
  routes = CANONICAL_ROUTES,
  saveScreenshots = true,
} = {}) {
  if (!fs.existsSync(distPath)) {
    throw new Error(`Dist directory not found at ${distPath}. Run 'npm run build' first.`);
  }

  const { server, port: boundPort } = await createSpaServer(distPath, port);
  const baseUrl = `http://127.0.0.1:${boundPort}`;
  console.log(`=== OrderBhojan Production Playwright Verifier running at ${baseUrl} ===`);

  let browser;
  const results = [];
  const failureDiagnostics = [];

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

      const uncaughtErrors = [];
      const fatalConsoleErrors = [];

      page.on('pageerror', (err) => {
        uncaughtErrors.push(err.message);
      });

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const txt = msg.text();
          // Filter benign development/browser notices & external origin sandbox CORS
          if (
            !txt.includes('ResizeObserver') &&
            !txt.includes('Download the React DevTools') &&
            !txt.includes('favicon.ico') &&
            !txt.includes('Failed to load resource') &&
            !txt.includes('has been blocked by CORS policy') &&
            !txt.includes('net::ERR_FAILED')
          ) {
            fatalConsoleErrors.push(txt);
          }
        }
      });

      for (const r of routes) {
        uncaughtErrors.length = 0;
        fatalConsoleErrors.length = 0;
        const fullUrl = `${baseUrl}${r.path}`;
        let mounted = false;
        let contentVerified = false;
        let routeFailureReason = null;

        try {
          await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

          // 1. Strict Mount Marker: #ob-boot-shell must be detached once React renders
          try {
            await page.waitForSelector('#ob-boot-shell', { state: 'detached', timeout: 10000 });
            mounted = true;
          } catch (e) {
            routeFailureReason = 'React failed to mount: #ob-boot-shell did not detach within 10s';
          }

          // 2. Content Marker: Assert specific application text rendered
          if (mounted) {
            const bodyText = await page.locator('body').innerText();
            if (r.expectedPattern.test(bodyText)) {
              contentVerified = true;
            } else {
              routeFailureReason = `Content marker mismatch. Expected pattern ${r.expectedPattern} in rendered text.`;
            }
          }

          // 3. Exception & Console Error Validation
          if (uncaughtErrors.length > 0) {
            routeFailureReason = `Uncaught page exception: ${uncaughtErrors.join('; ')}`;
          } else if (fatalConsoleErrors.length > 0) {
            routeFailureReason = `Fatal console error: ${fatalConsoleErrors.join('; ')}`;
          }
        } catch (e) {
          routeFailureReason = `Navigation/timeout error: ${e.message}`;
        }

        const isSuccess = mounted && contentVerified && uncaughtErrors.length === 0 && fatalConsoleErrors.length === 0;
        const status = isSuccess ? 'PASS' : 'FAIL';

        results.push({
          viewport: vp.name,
          route: r.name,
          path: r.path,
          status,
          mounted: mounted ? 'YES' : 'NO',
          contentVerified: contentVerified ? 'YES' : 'NO',
          errors: uncaughtErrors.length + fatalConsoleErrors.length,
          failureReason: routeFailureReason,
        });

        if (!isSuccess) {
          failureDiagnostics.push({
            viewport: vp.name,
            route: r.name,
            path: r.path,
            reason: routeFailureReason,
            uncaughtErrors: [...uncaughtErrors],
            fatalConsoleErrors: [...fatalConsoleErrors],
          });

          if (saveScreenshots) {
            fs.mkdirSync(failureScreenshotDir, { recursive: true });
            const sanitizeName = `${vp.width}px-${r.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const shotPath = path.join(failureScreenshotDir, `failure-${sanitizeName}.png`);
            await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
            console.error(`  ❌ [${r.name}] ${r.path} FAILED: ${routeFailureReason} (Screenshot saved: ${shotPath})`);
          } else {
            console.error(`  ❌ [${r.name}] ${r.path} FAILED: ${routeFailureReason}`);
          }
        } else {
          console.log(`  ✔ [${r.name}] ${r.path} verified cleanly (Mounted: YES, Errors: 0)`);
        }
      }

      await context.close();
    }

    console.log('\n=== Playwright Production Build Verification Results ===');
    console.table(results.map(r => ({
      viewport: r.viewport,
      route: r.route,
      path: r.path,
      status: r.status,
      mounted: r.mounted,
      errors: r.errors,
      failureReason: r.failureReason || 'None',
    })));

    const failedCount = results.filter(r => r.status === 'FAIL').length;
    return {
      success: failedCount === 0,
      total: results.length,
      passed: results.length - failedCount,
      failed: failedCount,
      results,
      failureDiagnostics,
    };
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

// CLI entrypoint
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  verifyProductionBuild()
    .then((outcome) => {
      if (!outcome.success) {
        console.error(`\n❌ Playwright verification FAILED: ${outcome.failed}/${outcome.total} routes failed.`);
        process.exit(1);
      } else {
        console.log(`\n✅ All ${outcome.total} route/viewport combinations verified cleanly.`);
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error('Fatal Playwright verification error:', err);
      process.exit(1);
    });
}
