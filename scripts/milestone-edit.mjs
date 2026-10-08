import fs from 'node:fs';
function edit(path, fn) { const s=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n'); fs.writeFileSync(path,fn(s)); }
edit('src/features/checkout/infrastructure/razorpayCheckout.ts', s => {
  s = "import { createPaymentScriptLoader } from './paymentScriptLoader';\nimport { withRequestDeadline, waitForSignal } from '@/lib/requestDeadline';\n" + s;
  s = s.replace('let loadPromise: Promise<boolean> | null = null;\n', '');
  const start=s.indexOf('function loadRazorpayScript()'); const end=s.indexOf('async function ensureRazorpayLoaded',start);
  s=s.slice(0,start)+`const loadSdk = createPaymentScriptLoader({
  id: RAZORPAY_SCRIPT_ID, src: RAZORPAY_SCRIPT_URL,
  ready: () => Boolean((window as RazorpayWindow).Razorpay),
  active: () => checkoutOpen, document: () => document,
});
function loadRazorpayScript(): Promise<boolean> {
  return typeof window === 'undefined' ? Promise.resolve(false) : loadSdk();
}

`+s.slice(end);
  const a=s.indexOf('async function paymentFetchJson'); const b=s.indexOf('export async function createRazorpayOrder',a);
  s=s.slice(0,a)+`async function paymentFetchJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  // No automatic mutation retry. Recover the existing checkout attempt on ambiguity.
  return withRequestDeadline(30_000, undefined, async signal => {
    const headers = await waitForSignal(paymentRequestHeaders, signal);
    const response = await waitForSignal(() => fetch(getApiBaseUrl() + path, {
      method: 'POST', headers, body: JSON.stringify(body), signal,
    }), signal);
    const data = await waitForSignal(() => response.json(), signal) as T & { success?: boolean; error?: string };
    if (!response.ok || data.success !== true) throw new Error(data.error || 'Payment result is unknown. Check order status.');
    return data;
  });
}

`+s.slice(b);
  s=s.replace('verified: data.verified !== false,','verified: data.verified === true,');
  s=s.replace('    return {\n      orderId: verified.orderId,',"    if (!verified.verified) throw new Error('Payment verification is pending. Check order status.');\n    return {\n      orderId: verified.orderId,");
  return s;
});
edit('src/config/environment.ts',s=>{
  const a=s.indexOf('function resolveFirebaseProjectId'); const b=s.indexOf('/** True for hosts',a);
  s=s.slice(0,a)+s.slice(b);
  const c=s.indexOf('function resolveMarketplaceApiBaseUrl'); const d=s.indexOf('export function loadAppConfig',c);
  s=s.slice(0,c)+`function resolveMarketplaceApiBaseUrl(): string {
  const explicit = readEnv('VITE_MARKETPLACE_API_URL');
  if (explicit) return explicit.replace(/\\/$/, '');
  if (resolveEnvironment() === 'development') {
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5174';
  }
  return ''; // Deployment must identify its authority explicitly; never guess production.
}

`+s.slice(d);
  return s.replace('resolveMarketplaceApiBaseUrl(liveMarketplace)','resolveMarketplaceApiBaseUrl()').replace('resolveFirebaseProjectId(liveMarketplace)',"readEnv('VITE_FIREBASE_PROJECT_ID')");
});
edit('src/config/clientConfig.ts',s=>{
  s="import { withRequestDeadline, waitForSignal } from '../lib/requestDeadline';\nimport { ConfigValidationError, validateDeploymentTarget, validateAppConfig } from './validation';\n"+s;
  const a=s.indexOf('function applyFirebaseDefaults');
  return s.slice(0,a)+`export async function fetchRemoteClientConfig(baseUrl: string, timeoutMs = 5000): Promise<RemoteClientConfig> {
  return withRequestDeadline(timeoutMs, undefined, async signal => {
    const response = await waitForSignal(() => fetch(baseUrl.replace(/\\/$/, '') + '/api/client-config', { signal, credentials: 'same-origin' }), signal);
    if (!response.ok) throw new ConfigValidationError('Configuration service unavailable');
    const payload = await waitForSignal(() => response.json(), signal) as RemoteClientConfig;
    if (!payload?.firebase || payload.configured === false) throw new ConfigValidationError('Deployment configuration is unavailable');
    return payload;
  });
}

export async function hydrateFirebaseConfig(config: AppConfig, timeoutMs = 5000): Promise<AppConfig> {
  validateDeploymentTarget(config);
  if (config.features.mswEnabled && config.environment === 'development') return config;
  if (!isFirebaseConfigIncomplete(config)) { validateAppConfig(config); return config; }
  const remote = await fetchRemoteClientConfig(config.marketplaceApiBaseUrl, timeoutMs);
  if (!config.firebase.projectId || remote.firebase.projectId !== config.firebase.projectId) {
    throw new ConfigValidationError('Configuration project does not match the explicit deployment project');
  }
  // Reject conflicting partial builds instead of mixing Firebase projects/credentials.
  for (const key of ['apiKey', 'authDomain', 'appId', 'messagingSenderId', 'storageBucket'] as const) {
    if (config.firebase[key] && config.firebase[key] !== remote.firebase[key]) throw new ConfigValidationError('Conflicting Firebase configuration: ' + key);
  }
  const hydrated = { ...config, firebase: { ...remote.firebase, measurementId: config.firebase.measurementId } };
  validateAppConfig(hydrated);
  return hydrated;
}
`;
});
edit('src/config/index.ts',s=>s.replace('  cached = await hydrateFirebaseConfig(base);\n  validateAppConfig(cached);\n  return cached;', '  const hydrated = await hydrateFirebaseConfig(base);\n  validateAppConfig(hydrated);\n  cached = hydrated;\n  return hydrated;'));
edit('src/main.tsx',s=>{
  s=s.replace("import '@/styles/globals.css';", "import '@/styles/globals.css';\nimport { showStartupRecovery } from '@/lib/startupRecovery';");
  s=s.replace("  // Native chrome only", "  const config = await ensureAppConfig();\n\n  // Native chrome only");
  s=s.replace('  const config = await ensureAppConfig();\n  // Config may refine', '  // Config may refine');
  const a=s.indexOf('bootstrap().catch');
  return s.slice(0,a)+`async function start(): Promise<void> {
  try { await bootstrap(); }
  catch (error) {
    console.error('[OrderBhojan] startup unavailable', error);
    showStartupRecovery(() => { void start(); });
  }
}
void start();
`;
});
