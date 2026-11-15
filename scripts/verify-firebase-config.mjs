import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Validates a Firebase Hosting target identifier against strict allowlist
 * and checks for forbidden shell metacharacters.
 * @param {unknown} target
 * @returns {{ valid: boolean, target?: string, reason?: string }}
 */
export function validateHostingTarget(target) {
  if (typeof target !== 'string') {
    return { valid: false, reason: 'Target must be a non-empty string' };
  }
  const trimmed = target.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Target cannot be empty' };
  }
  // Disallow any shell metacharacters or control characters
  if (/[;&|`$><!\\"'*?~(){}[\]\n\r]/.test(target)) {
    return { valid: false, reason: 'Target contains forbidden shell metacharacters' };
  }
  if (trimmed !== 'orderbhojan') {
    return { valid: false, reason: `Target "${target}" is not permitted. Only "orderbhojan" is authorized.` };
  }
  return { valid: true, target: 'orderbhojan' };
}

console.log('=== Verifying Firebase Hosting Configuration ===');

// 1. Verify target validation function
const selfValidation = validateHostingTarget('orderbhojan');
assert.ok(selfValidation.valid, 'validateHostingTarget("orderbhojan") must be valid');
assert.equal(validateHostingTarget('bhojanos-prod').valid, false, 'Other targets must be rejected');
console.log('✔ Target allowlist and sanitization rules verified');

// 2. Verify firebase.json
const firebaseJsonPath = path.join(rootDir, 'firebase.json');
assert.ok(fs.existsSync(firebaseJsonPath), 'firebase.json must exist');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));

assert.ok(Array.isArray(firebaseConfig.hosting), 'firebase.json must have hosting array');
const orderbhojanTarget = firebaseConfig.hosting.find(h => h.target === 'orderbhojan');
assert.ok(orderbhojanTarget, 'firebase.json must configure target "orderbhojan"');
assert.equal(orderbhojanTarget.public, 'dist', 'Target orderbhojan must set public to "dist"');

// Verify rewrites
const spaRewrite = orderbhojanTarget.rewrites?.find(r => r.source === '**' && r.destination === '/index.html');
assert.ok(spaRewrite, 'Target orderbhojan must have SPA fallback rewrite (** -> /index.html)');
console.log('✔ firebase.json target "orderbhojan" points to "dist" with SPA fallback');

// Verify cache control headers
const headers = orderbhojanTarget.headers || [];
const indexHeader = headers.find(h => h.source === '/index.html');
assert.ok(indexHeader, 'Must define Cache-Control header for /index.html');
const indexCacheVal = indexHeader.headers.find(k => k.key.toLowerCase() === 'cache-control')?.value;
assert.ok(indexCacheVal?.includes('no-cache'), 'index.html Cache-Control must include no-cache');
assert.ok(indexCacheVal?.includes('no-store'), 'index.html Cache-Control must include no-store');
console.log(`✔ /index.html Cache-Control: ${indexCacheVal}`);

const swHeader = headers.find(h => h.source === '/sw.js');
assert.ok(swHeader, 'Must define Cache-Control header for /sw.js');
console.log('✔ Service worker cache headers verified');

const assetsHeader = headers.find(h => h.source === '/assets/**');
assert.ok(assetsHeader, 'Must define Cache-Control header for /assets/**');
const assetsCacheVal = assetsHeader.headers.find(k => k.key.toLowerCase() === 'cache-control')?.value;
assert.ok(assetsCacheVal?.includes('immutable'), '/assets/** Cache-Control must be immutable');
console.log(`✔ /assets/** Cache-Control: ${assetsCacheVal}`);

// 3. Verify .firebaserc
const firebasercPath = path.join(rootDir, '.firebaserc');
assert.ok(fs.existsSync(firebasercPath), '.firebaserc must exist');
const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));

assert.ok(firebaserc.projects, '.firebaserc must define projects');
assert.ok(firebaserc.targets, '.firebaserc must define targets');
console.log('✔ .firebaserc project and target structure verified');

console.log('✅ All Firebase Hosting configuration checks PASSED.');
