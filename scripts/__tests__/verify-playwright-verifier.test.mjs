import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyProductionBuild } from '../verify-production-build-playwright.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Playwright Production Verifier Robustness & Failure Classification', () => {
  it('1. Flags FAIL when an uncaught exception occurs during route rendering', async () => {
    // Create temporary mock dist with an uncaught runtime error
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-test-error-'));
    const indexHtml = `<!DOCTYPE html><html><head></head><body>
      <div id="root"><div id="ob-boot-shell">Loading</div></div>
      <script>
        setTimeout(() => {
          throw new Error('Simulated fatal React runtime exception');
        }, 100);
      </script>
    </body></html>`;
    fs.writeFileSync(path.join(tmpDir, 'index.html'), indexHtml);

    try {
      const outcome = await verifyProductionBuild({
        distPath: tmpDir,
        port: 5281,
        viewports: [{ name: 'TestViewport', width: 360, height: 640 }],
        routes: [{ path: '/', name: 'Home', expectedPattern: /OrderBhojan/ }],
        saveScreenshots: false,
      });

      assert.strictEqual(outcome.success, false, 'Verifier must return success: false when uncaught error occurs');
      assert.strictEqual(outcome.failed, 1, 'Failed count must be 1');
      assert.strictEqual(outcome.results[0].status, 'FAIL');
      assert.ok(
        outcome.results[0].failureReason.includes('Simulated fatal React runtime exception') ||
        outcome.results[0].failureReason.includes('React failed to mount'),
        `Failure reason must reflect uncaught exception: ${outcome.results[0].failureReason}`
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('2. Flags FAIL when React fails to mount and #ob-boot-shell remains attached', async () => {
    // Create temporary mock dist where #ob-boot-shell never detaches
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-test-stuck-'));
    const indexHtml = `<!DOCTYPE html><html><head></head><body>
      <div id="root"><div id="ob-boot-shell">Stuck Boot Shell</div></div>
    </body></html>`;
    fs.writeFileSync(path.join(tmpDir, 'index.html'), indexHtml);

    try {
      const outcome = await verifyProductionBuild({
        distPath: tmpDir,
        port: 5282,
        viewports: [{ name: 'TestViewport', width: 360, height: 640 }],
        routes: [{ path: '/', name: 'Home', expectedPattern: /OrderBhojan/ }],
        saveScreenshots: false,
      });

      assert.strictEqual(outcome.success, false, 'Verifier must return success: false when boot shell never detaches');
      assert.strictEqual(outcome.results[0].status, 'FAIL');
      assert.strictEqual(outcome.results[0].mounted, 'NO');
      assert.ok(outcome.results[0].failureReason.includes('React failed to mount'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('3. Flags FAIL when content marker does not match expected application text', async () => {
    // Create temporary mock dist where boot shell detaches, but renders wrong content
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-test-wrong-'));
    const indexHtml = `<!DOCTYPE html><html><head></head><body>
      <div id="root"><div id="ob-boot-shell">Loading</div></div>
      <script>
        setTimeout(() => {
          document.getElementById('ob-boot-shell').remove();
          const div = document.createElement('div');
          div.innerText = 'Unrelated Application Title';
          document.getElementById('root').appendChild(div);
        }, 50);
      </script>
    </body></html>`;
    fs.writeFileSync(path.join(tmpDir, 'index.html'), indexHtml);

    try {
      const outcome = await verifyProductionBuild({
        distPath: tmpDir,
        port: 5283,
        viewports: [{ name: 'TestViewport', width: 360, height: 640 }],
        routes: [{ path: '/', name: 'Home', expectedPattern: /OrderBhojan/ }],
        saveScreenshots: false,
      });

      assert.strictEqual(outcome.success, false, 'Verifier must return success: false when content marker is missing');
      assert.strictEqual(outcome.results[0].status, 'FAIL');
      assert.strictEqual(outcome.results[0].mounted, 'YES');
      assert.strictEqual(outcome.results[0].contentVerified, 'NO');
      assert.ok(outcome.results[0].failureReason.includes('Content marker mismatch'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('4. Flags FAIL when fatal console.error is emitted by application code', async () => {
    // Create temporary mock dist where app logs fatal console.error
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-test-console-'));
    const indexHtml = `<!DOCTYPE html><html><head></head><body>
      <div id="root"><div id="ob-boot-shell">Loading</div></div>
      <script>
        setTimeout(() => {
          document.getElementById('ob-boot-shell').remove();
          const div = document.createElement('div');
          div.innerText = 'OrderBhojan Home';
          document.getElementById('root').appendChild(div);
          console.error('Fatal initialization error in auth store');
        }, 50);
      </script>
    </body></html>`;
    fs.writeFileSync(path.join(tmpDir, 'index.html'), indexHtml);

    try {
      const outcome = await verifyProductionBuild({
        distPath: tmpDir,
        port: 5284,
        viewports: [{ name: 'TestViewport', width: 360, height: 640 }],
        routes: [{ path: '/', name: 'Home', expectedPattern: /OrderBhojan/ }],
        saveScreenshots: false,
      });

      assert.strictEqual(outcome.success, false, 'Verifier must return success: false when fatal console error occurs');
      assert.strictEqual(outcome.results[0].status, 'FAIL');
      assert.ok(outcome.results[0].failureReason.includes('Fatal console error'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
