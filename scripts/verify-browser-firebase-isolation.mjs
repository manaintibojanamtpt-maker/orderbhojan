import { chromium } from 'playwright';

async function verifyIsolation() {
  console.log('[Probe] Launching browser to verify Firebase emulator isolation...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const networkRequests = [];
  const consoleLogs = [];

  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('request', req => {
    const url = req.url();
    if (url.includes('8185') || url.includes('firestore.googleapis.com') || url.includes('google.firestore')) {
      networkRequests.push({ url, method: req.method() });
    }
  });

  console.log('[Probe] Navigating to http://localhost:5174/restaurant/demo-biryani-house/menu...');
  await page.goto('http://localhost:5174/restaurant/demo-biryani-house/menu', { waitUntil: 'networkidle' });

  // Evaluate Firebase client config in browser window
  const browserConfig = await page.evaluate(async () => {
    const { getAppConfig } = await import('/src/config/index.ts');
    const config = getAppConfig();
    return {
      environment: config.environment,
      projectId: config.firebase.projectId,
      firestoreEmulatorHost: config.firebase.firestoreEmulatorHost,
      marketplaceApiBaseUrl: config.marketplaceApiBaseUrl,
    };
  });

  console.log('[Probe] Browser Runtime AppConfig:', JSON.stringify(browserConfig, null, 2));

  // Explicitly call initializeFirebase() and getFirebaseFirestore() in browser window
  const initResult = await page.evaluate(async () => {
    const { initializeFirebase, getFirebaseFirestore } = await import('/src/firebase/init.ts');
    const res = initializeFirebase();
    const db = getFirebaseFirestore();
    return {
      hasApp: Boolean(res.app),
      hasAuth: Boolean(res.auth),
      hasFirestore: Boolean(db),
      appName: res.app?.name,
      projectId: res.app?.options?.projectId,
    };
  });

  console.log('[Probe] Browser initializeFirebase result:', initResult);

  // Check if initializeFirebase logged connection to emulator
  const firebaseLogs = consoleLogs.filter(l => l.text.includes('[Firebase]'));
  console.log('[Probe] Console [Firebase] logs:', firebaseLogs);

  // Check network destinations
  const firestoreProdRequests = networkRequests.filter(r => r.url.includes('firestore.googleapis.com'));
  const emulatorRequests = networkRequests.filter(r => r.url.includes('8185'));

  console.log(`[Probe] Emulator requests count: ${emulatorRequests.length}`);
  console.log(`[Probe] Production Firestore requests count: ${firestoreProdRequests.length}`);

  if (firestoreProdRequests.length > 0) {
    console.error('[FAIL] LEAK DETECTED: Browser attempted to hit production Firestore!', firestoreProdRequests);
    process.exit(1);
  }

  console.log('[Probe] SUCCESS: Browser Firebase is strictly isolated to emulator.');
  await browser.close();
}

verifyIsolation().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
