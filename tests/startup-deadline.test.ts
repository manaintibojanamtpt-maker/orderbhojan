import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BHOJANOS_PROD_FIREBASE_PUBLIC,
  LIVE_MARKETPLACE_API_DEFAULT,
  loadAppConfig,
} from '../src/config/environment';
import { hydrateFirebaseConfig } from '../src/config/clientConfig';
import { validateAppConfig } from '../src/config/validation';

const config = () => {
  const c = loadAppConfig();
  return {
    ...c,
    environment: 'production' as const,
    marketplaceApiBaseUrl: 'https://example.test',
    firebase: { ...c.firebase, projectId: 'test-project' },
    features: { ...c.features, mswEnabled: false },
  };
};

const remote = {
  configured: true,
  firebase: {
    apiKey: 'key',
    authDomain: 'test-project.firebaseapp.com',
    projectId: 'test-project',
    appId: 'app',
    messagingSenderId: 'sender',
    storageBucket: 'bucket',
  },
};

test('blackholed configuration has deadline and retry can succeed', async t => {
  const mock = t.mock.method(globalThis, 'fetch', () => new Promise<Response>(() => {}));
  await assert.rejects(hydrateFirebaseConfig(config(), 15), { name: 'TimeoutError' });

  mock.mock.mockImplementation(async () => new Response(JSON.stringify(remote)));
  assert.equal((await hydrateFirebaseConfig(config(), 500)).firebase.projectId, 'test-project');
});

test('complete canonical production Firebase config does not wait for remote config', async t => {
  const mock = t.mock.method(globalThis, 'fetch', () => new Promise<Response>(() => {}));
  const productionConfig = {
    ...config(),
    marketplaceApiBaseUrl: LIVE_MARKETPLACE_API_DEFAULT,
    firebase: { ...BHOJANOS_PROD_FIREBASE_PUBLIC },
  };

  const hydrated = await hydrateFirebaseConfig(productionConfig);

  assert.equal(hydrated.firebase.projectId, 'bhojanos-prod');
  assert.equal(mock.mock.callCount(), 0);
});

test('legacy OrderBhojan Firebase project is corrected locally for production startup', async t => {
  const mock = t.mock.method(globalThis, 'fetch', () => new Promise<Response>(() => {}));
  const productionConfig = {
    ...config(),
    marketplaceApiBaseUrl: LIVE_MARKETPLACE_API_DEFAULT,
    firebase: {
      ...BHOJANOS_PROD_FIREBASE_PUBLIC,
      projectId: 'orderbhojan',
      authDomain: 'orderbhojan.firebaseapp.com',
    },
  };

  const hydrated = await hydrateFirebaseConfig(productionConfig);

  assert.equal(hydrated.firebase.projectId, 'bhojanos-prod');
  assert.equal(hydrated.firebase.authDomain, BHOJANOS_PROD_FIREBASE_PUBLIC.authDomain);
  assert.equal(mock.mock.callCount(), 0);
});

test('configuration refuses unintended project, malformed deployment and NaN timeout', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    ...remote,
    firebase: { ...remote.firebase, projectId: 'wrong' },
  })));
  await assert.rejects(hydrateFirebaseConfig(config()), /project/);
  assert.throws(() => validateAppConfig({ ...config(), marketplaceApiBaseUrl: '' }), /explicit/);
  assert.throws(() => validateAppConfig({ ...config(), api: { ...config().api, timeoutMs: NaN } }), /timeout/);
});
