import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('Finding 2 Regression: Service Worker & Cache Isolation (Browser vs Capacitor)', () => {
  const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');

  // Extract the head script containing the Capacitor detection and cache logic
  const scriptMatch = indexHtml.match(/<script>([\s\S]*?var isCapacitor[\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Must find the Capacitor & service worker script in index.html');
  const inlineScript = scriptMatch[1];

  it('syntactically encloses caches and serviceWorker cleanup strictly inside if (isCapacitor)', () => {
    // Find where if (isCapacitor) begins
    const ifIndex = inlineScript.indexOf('if (isCapacitor)');
    assert.ok(ifIndex !== -1, 'if (isCapacitor) block must exist');

    // Code before if (isCapacitor)
    const codeBefore = inlineScript.slice(0, ifIndex);
    assert.doesNotMatch(codeBefore, /caches\.delete/, 'caches.delete must not exist before if (isCapacitor)');
    assert.doesNotMatch(codeBefore, /registration\.unregister/, 'registration.unregister must not exist before if (isCapacitor)');

    // The entire block after if (isCapacitor)
    const codeFromIf = inlineScript.slice(ifIndex);
    assert.match(codeFromIf, /caches\.delete/, 'caches.delete must exist inside if (isCapacitor)');
    assert.match(codeFromIf, /registration\.unregister/, 'registration.unregister must exist inside if (isCapacitor)');
  });

  function createMockBrowser(options: {
    protocol?: string;
    hostname?: string;
    hasCapacitor?: boolean;
  }) {
    let cacheKeysCalled = false;
    const deletedKeys: string[] = [];
    let getRegistrationsCalled = false;
    let unregisterCalls = 0;
    const initialRegisterFn = () => Promise.resolve('registered-mock');

    const mockCaches = {
      keys: () => {
        cacheKeysCalled = true;
        return Promise.resolve(['pwa-cache-v1', 'workbox-precache']);
      },
      delete: (key: string) => {
        deletedKeys.push(key);
        return Promise.resolve(true);
      },
    };

    const mockNavigator = {
      serviceWorker: {
        register: initialRegisterFn,
        getRegistrations: () => {
          getRegistrationsCalled = true;
          return Promise.resolve([
            { unregister: () => { unregisterCalls++; return Promise.resolve(true); } },
            { unregister: () => { unregisterCalls++; return Promise.resolve(true); } },
          ]);
        },
      },
    };

    const win: any = {
      location: {
        protocol: options.protocol ?? 'https:',
        hostname: options.hostname ?? 'orderbhojan.web.app',
      },
      caches: mockCaches,
      navigator: mockNavigator,
    };

    if (options.hasCapacitor) {
      win.Capacitor = { isNativePlatform: () => true };
    }

    win.window = win;

    const sandbox = {
      window: win,
      location: win.location,
      navigator: win.navigator,
      caches: win.caches,
    };

    return {
      sandbox,
      win,
      getStats: () => ({
        cacheKeysCalled,
        deletedKeys,
        getRegistrationsCalled,
        unregisterCalls,
        registerFn: win.navigator.serviceWorker.register,
        initialRegisterFn,
        skipSplash: win.__SKIP_SPLASH__,
      }),
    };
  }

  it('preserves normal PWA service worker and caches for browser users (isCapacitor=false)', async () => {
    const { sandbox, getStats } = createMockBrowser({
      protocol: 'https:',
      hostname: 'orderbhojan.web.app',
      hasCapacitor: false,
    });

    vm.createContext(sandbox);
    vm.runInContext(inlineScript, sandbox);

    await new Promise((r) => setTimeout(r, 20));

    const stats = getStats();
    assert.equal(stats.cacheKeysCalled, false, 'Browser users must NOT have cache keys inspected or wiped');
    assert.equal(stats.deletedKeys.length, 0, 'Browser users must NOT have caches deleted');
    assert.equal(stats.getRegistrationsCalled, false, 'Browser users must NOT have service workers unregistered');
    assert.equal(
      stats.registerFn,
      stats.initialRegisterFn,
      'Browser users must preserve normal serviceWorker.register capability',
    );
    assert.equal(stats.skipSplash, undefined, 'Browser users must not skip splash flag');
  });

  it('executes aggressive cleanup and invalidation for native Capacitor runtime', async () => {
    const { sandbox, getStats } = createMockBrowser({
      protocol: 'http:',
      hostname: 'localhost',
      hasCapacitor: true,
    });

    vm.createContext(sandbox);
    vm.runInContext(inlineScript, sandbox);

    await new Promise((r) => setTimeout(r, 20));

    const stats = getStats();
    assert.equal(stats.skipSplash, true, 'Capacitor must set __SKIP_SPLASH__');
    assert.equal(stats.cacheKeysCalled, true, 'Capacitor must inspect caches');
    assert.deepEqual(stats.deletedKeys, ['pwa-cache-v1', 'workbox-precache'], 'Capacitor must purge all old caches');
    assert.equal(stats.unregisterCalls, 2, 'Capacitor must unregister all leftover service workers');

    await assert.rejects(
      () => stats.registerFn(),
      'Capacitor must disable serviceWorker registration',
    );
  });

  it('detects capacitor: protocol as native Capacitor runtime', async () => {
    const { sandbox, getStats } = createMockBrowser({
      protocol: 'capacitor:',
      hostname: 'localhost',
      hasCapacitor: false,
    });

    vm.createContext(sandbox);
    vm.runInContext(inlineScript, sandbox);

    await new Promise((r) => setTimeout(r, 20));

    const stats = getStats();
    assert.equal(stats.skipSplash, true);
    assert.equal(stats.cacheKeysCalled, true);
    await assert.rejects(() => stats.registerFn());
  });

  it('detects https://localhost as native Capacitor runtime', async () => {
    const { sandbox, getStats } = createMockBrowser({
      protocol: 'https:',
      hostname: 'localhost',
      hasCapacitor: false,
    });

    vm.createContext(sandbox);
    vm.runInContext(inlineScript, sandbox);

    await new Promise((r) => setTimeout(r, 20));

    const stats = getStats();
    assert.equal(stats.skipSplash, true);
    assert.equal(stats.cacheKeysCalled, true);
    await assert.rejects(() => stats.registerFn());
  });
});
