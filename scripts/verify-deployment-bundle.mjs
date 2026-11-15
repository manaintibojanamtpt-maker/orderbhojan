import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

console.log('=== Verifying OrderBhojan Production Deployment Bundle ===');

// 1. Verify dist exists
assert.ok(fs.existsSync(distDir), 'dist directory must exist');

// 2. Verify index.html exists and is not empty
const indexPath = path.join(distDir, 'index.html');
assert.ok(fs.existsSync(indexPath), 'dist/index.html must exist');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
assert.ok(indexHtml.length > 500, 'dist/index.html must not be empty');
assert.ok(indexHtml.includes('id="root"'), 'dist/index.html must have #root element');
assert.ok(/<script type="module" crossorigin src="\/assets\/index-[A-Za-z0-9_-]+\.js"><\/script>/.test(indexHtml), 'dist/index.html must link to hashed index bundle');
console.log('✔ dist/index.html verified with valid entrypoint');

// 3. Verify PWA files
const swPath = path.join(distDir, 'sw.js');
const manifestPath = path.join(distDir, 'manifest.webmanifest');
assert.ok(fs.existsSync(swPath), 'dist/sw.js must exist for PWA offline support');
assert.ok(fs.existsSync(manifestPath), 'dist/manifest.webmanifest must exist');
console.log('✔ PWA sw.js and manifest.webmanifest verified');

// 4. Verify assets directory and hashed chunks
const assetsDir = path.join(distDir, 'assets');
assert.ok(fs.existsSync(assetsDir), 'dist/assets directory must exist');
const assetFiles = fs.readdirSync(assetsDir);
console.log(`Found ${assetFiles.length} asset files in dist/assets`);

const requiredChunks = [
  /^index-[A-Za-z0-9_-]+\.js$/,
  /^react-vendor-[A-Za-z0-9_-]+\.js$/,
  /^router-[A-Za-z0-9_-]+\.js$/,
  /^firebase-core-[A-Za-z0-9_-]+\.js$/,
  /^SearchExperiencePage-[A-Za-z0-9_-]+\.js$/,
  /^index-[A-Za-z0-9_-]+\.css$/,
];

for (const pattern of requiredChunks) {
  const match = assetFiles.find(f => pattern.test(f));
  assert.ok(match, `Missing required bundle chunk matching pattern: ${pattern}`);
  console.log(`✔ Found required chunk: ${match}`);
}

console.log('✅ All production deployment bundle checks PASSED.');
