import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('Finding 1 Regression: Firebase Hosting Target & Deploy Configuration', () => {
  const firebaseJson = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8'));
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

  it('configures hosting as an array of targets in firebase.json', () => {
    assert.ok(Array.isArray(firebaseJson.hosting), 'hosting must be an array for multi-site');
    assert.equal(firebaseJson.hosting.length, 2, 'must contain customer app and marketing targets');
  });

  it('aligns customer app target with orderbhojan hosting target and dist directory', () => {
    const customerHosting = firebaseJson.hosting.find((h: any) => h.public === 'dist');
    assert.ok(customerHosting, 'customer app hosting entry with public: "dist" must exist');
    assert.equal(customerHosting.target, 'orderbhojan', 'customer app target must be orderbhojan');
    assert.notEqual(
      customerHosting.target,
      'manaintibojanam',
      'must not use legacy monorepo target name manaintibojanam',
    );
  });

  it('preserves separate marketing hosting target pointing to dist-marketing', () => {
    const marketingHosting = firebaseJson.hosting.find((h: any) => h.public === 'dist-marketing');
    assert.ok(marketingHosting, 'marketing hosting entry with public: "dist-marketing" must exist');
    assert.equal(marketingHosting.target, 'bhojanos-prod', 'marketing target must be bhojanos-prod');
  });

  it('reconciles package.json deploy scripts with configured targets and projects', () => {
    const deployScript = packageJson.scripts?.deploy;
    assert.ok(deployScript, 'deploy script must exist in package.json');
    assert.match(
      deployScript,
      /firebase deploy --only hosting:orderbhojan --project orderbhojan/,
      'deploy must target orderbhojan hosting target and project',
    );

    const deployMarketingScript = packageJson.scripts?.['deploy:marketing'];
    assert.ok(deployMarketingScript, 'deploy:marketing script must exist');
    assert.match(
      deployMarketingScript,
      /firebase deploy --only hosting:bhojanos-prod --project bhojanos-prod/,
      'deploy:marketing must target bhojanos-prod hosting target and project',
    );

    if (packageJson.scripts?.['deploy:orderbhojan']) {
      assert.equal(
        packageJson.scripts['deploy:orderbhojan'],
        'npm run deploy',
        'deploy:orderbhojan must alias deploy',
      );
    }
  });

  it('preserves critical Permissions-Policy headers in customer hosting configuration', () => {
    const customerHosting = firebaseJson.hosting.find((h: any) => h.target === 'orderbhojan');
    assert.ok(customerHosting?.headers, 'customer hosting must have headers array');

    const globalHeaders = customerHosting.headers.find((hdr: any) => hdr.source === '**');
    assert.ok(globalHeaders, 'must have catch-all security headers');

    const permPolicy = globalHeaders.headers.find(
      (h: any) => h.key === 'Permissions-Policy',
    );
    assert.ok(permPolicy, 'Permissions-Policy must be configured');
    assert.match(
      permPolicy.value,
      /microphone=\(self\)/,
      'microphone=(self) must be allowed for speech capture',
    );
  });

  it('maps targets correctly in .firebaserc when present', () => {
    const rcPath = resolve(root, '.firebaserc');
    if (!existsSync(rcPath)) return;

    const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
    assert.ok(rc.targets?.orderbhojan?.hosting?.orderbhojan, 'orderbhojan target must exist in .firebaserc');
    assert.deepEqual(rc.targets.orderbhojan.hosting.orderbhojan, ['orderbhojan']);
  });
});
