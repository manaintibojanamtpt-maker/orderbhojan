import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyFirebaseDefaults,
  shouldApplyProdFirebaseDefaults,
  BHOJANOS_PROD_FIREBASE_PUBLIC,
} from '../src/config/clientConfig';
import {
  loadAppConfig,
  type AppConfig,
} from '../src/config/environment';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('PR #7 Review Findings Regression Suite', () => {
  describe('Finding 1: Firebase defaults respect selected project', () => {
    it('does NOT apply bhojanos-prod defaults when project is orderbhojan with blank keys', () => {
      const devOrderbhojanConfig: AppConfig = {
        environment: 'development',
        marketplaceApiBaseUrl: 'http://localhost:8080',
        marketplaceApiVersion: '1.0',
        firebase: {
          apiKey: '',
          authDomain: '',
          projectId: 'orderbhojan',
          storageBucket: '',
          messagingSenderId: '',
          appId: '',
        },
        features: {
          mswEnabled: true,
          appCheckEnabled: false,
          analyticsEnabled: false,
        },
        api: {
          timeoutMs: 30000,
          retryAttempts: 2,
          retryDelayMs: 500,
        },
      };

      assert.equal(
        shouldApplyProdFirebaseDefaults(devOrderbhojanConfig),
        false,
        'Must NOT apply production defaults to orderbhojan project in development',
      );

      const result = applyFirebaseDefaults(devOrderbhojanConfig);
      assert.equal(result.firebase.projectId, 'orderbhojan');
      assert.equal(result.firebase.apiKey, '', 'API key must remain blank and not inherit bhojanos-prod key');
      assert.equal(result.firebase.authDomain, '', 'Auth domain must remain blank and not inherit bhojanos-prod domain');
      assert.equal(result.firebase.storageBucket, '', 'Storage bucket must not inherit bhojanos-prod');
      assert.equal(result.firebase.appId, '', 'App ID must not inherit bhojanos-prod');
    });

    it('does NOT apply bhojanos-prod defaults to custom development or demo projects', () => {
      const demoConfig: AppConfig = {
        environment: 'development',
        marketplaceApiBaseUrl: 'http://localhost:8080',
        marketplaceApiVersion: '1.0',
        firebase: {
          apiKey: 'demo-key',
          authDomain: '',
          projectId: 'demo-custom-dev',
          storageBucket: '',
          messagingSenderId: '',
          appId: 'demo-app',
        },
        features: {
          mswEnabled: true,
          appCheckEnabled: false,
          analyticsEnabled: false,
        },
        api: {
          timeoutMs: 30000,
          retryAttempts: 2,
          retryDelayMs: 500,
        },
      };

      assert.equal(shouldApplyProdFirebaseDefaults(demoConfig), false);
      const result = applyFirebaseDefaults(demoConfig);
      assert.equal(result.firebase.apiKey, 'demo-key');
      assert.equal(result.firebase.projectId, 'demo-custom-dev');
      assert.equal(result.firebase.authDomain, '');
    });

    it('DOES apply bhojanos-prod defaults when project is explicitly bhojanos-prod', () => {
      const prodConfig: AppConfig = {
        environment: 'production',
        marketplaceApiBaseUrl: 'https://manaintibojanam-backend.onrender.com',
        marketplaceApiVersion: '1.0',
        firebase: {
          apiKey: '',
          authDomain: '',
          projectId: 'bhojanos-prod',
          storageBucket: '',
          messagingSenderId: '',
          appId: '',
        },
        features: {
          mswEnabled: false,
          appCheckEnabled: false,
          analyticsEnabled: true,
        },
        api: {
          timeoutMs: 30000,
          retryAttempts: 2,
          retryDelayMs: 500,
        },
      };

      assert.equal(shouldApplyProdFirebaseDefaults(prodConfig), true);
      const result = applyFirebaseDefaults(prodConfig);
      assert.equal(result.firebase.projectId, 'bhojanos-prod');
      assert.equal(result.firebase.apiKey, BHOJANOS_PROD_FIREBASE_PUBLIC.apiKey);
      assert.equal(result.firebase.authDomain, BHOJANOS_PROD_FIREBASE_PUBLIC.authDomain);
      assert.equal(result.firebase.storageBucket, BHOJANOS_PROD_FIREBASE_PUBLIC.storageBucket);
      assert.equal(result.firebase.messagingSenderId, BHOJANOS_PROD_FIREBASE_PUBLIC.messagingSenderId);
      assert.equal(result.firebase.appId, BHOJANOS_PROD_FIREBASE_PUBLIC.appId);
    });

    it('does not combine a non-prod project ID with prod credentials', () => {
      const config = loadAppConfig();
      if (config.firebase.projectId !== 'bhojanos-prod') {
        assert.notEqual(
          config.firebase.apiKey,
          BHOJANOS_PROD_FIREBASE_PUBLIC.apiKey,
          'Must never combine non-bhojanos-prod projectId with bhojanos-prod API key',
        );
        assert.notEqual(
          config.firebase.authDomain,
          BHOJANOS_PROD_FIREBASE_PUBLIC.authDomain,
          'Must never combine non-bhojanos-prod projectId with bhojanos-prod authDomain',
        );
      }
    });
  });

  describe('Finding 2: Browser PWA service-worker registration restored', () => {
    it('configures VitePWA with plugin injection enabled (injectRegister != false)', () => {
      const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
      assert.doesNotMatch(
        viteConfig,
        /injectRegister:\s*false/,
        'vite.config.ts must not disable PWA script injection with injectRegister: false',
      );
      assert.match(
        viteConfig,
        /injectRegister:\s*['"]auto['"]/,
        'vite.config.ts must explicitly enable automatic PWA script injection',
      );
    });

    it('generates dist/registerSW.js and includes registration script in dist/index.html', () => {
      const registerSwPath = resolve(root, 'dist/registerSW.js');
      assert.ok(existsSync(registerSwPath), 'dist/registerSW.js must exist after build');

      const registerSwContent = readFileSync(registerSwPath, 'utf8');
      assert.match(
        registerSwContent,
        /navigator\.serviceWorker\.register\(['"]\/sw\.js['"]/,
        'registerSW.js must register /sw.js',
      );

      const indexHtml = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
      assert.match(
        indexHtml,
        /<script[^>]*registerSW\.js[^>]*>/,
        'dist/index.html must include the registerSW.js script tag for browser users',
      );
    });

    it('preserves native Capacitor protection in index.html head script', () => {
      const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
      assert.match(
        indexHtml,
        /if \(isCapacitor\)[\s\S]*?navigator\.serviceWorker\.register = function\(\)/,
        'Capacitor native runtime must override serviceWorker.register to reject, preventing registration',
      );
    });
  });

  describe('Finding 3: All maintained build-script configurations exist', () => {
    it('verifies all config files referenced in package.json scripts exist on disk', () => {
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
      const scripts = pkg.scripts as Record<string, string>;

      for (const [name, cmd] of Object.entries(scripts)) {
        // Find flags like --config <file>
        const configMatches = cmd.matchAll(/--config\s+([^\s]+)/g);
        for (const match of configMatches) {
          const configFile = match[1];
          const fullPath = resolve(root, configFile);
          assert.ok(
            existsSync(fullPath),
            `Script "${name}" references config "${configFile}", but it does not exist on disk`,
          );
        }
      }
    });

    it('verifies storefront-vite.config.ts exists and outputs to dist-marketing', () => {
      const storefrontConfigPath = resolve(root, 'storefront-vite.config.ts');
      assert.ok(existsSync(storefrontConfigPath), 'storefront-vite.config.ts must exist at repository root');

      const content = readFileSync(storefrontConfigPath, 'utf8');
      assert.match(content, /outDir:\s*['"]\.\.\/dist-marketing['"]/, 'Marketing build must target dist-marketing');
      assert.match(content, /root:\s*path\.resolve\(__dirname,\s*['"]storefront-src['"]\)/);
    });

    it('verifies customer app deploy script deploys dist only to orderbhojan target', () => {
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
      assert.equal(
        pkg.scripts.deploy,
        'npm run build && firebase deploy --only hosting:orderbhojan --project orderbhojan',
      );
      assert.equal(
        pkg.scripts['deploy:marketing'],
        'npm run build:marketing && firebase deploy --only hosting:bhojanos-prod --project bhojanos-prod',
      );
    });
  });
});
