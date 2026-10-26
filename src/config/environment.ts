/** Public bhojanos-prod Firebase web SDK config (apiKey is not secret — domain-restricted in GCP). */
export const BHOJANOS_PROD_FIREBASE_PUBLIC = {
  apiKey: 'AIzaSyC6kCJwsEWuwLVPGmJsVDDxTyWlayp2yLQ',
  authDomain: 'bhojanos-prod.firebaseapp.com',
  projectId: 'bhojanos-prod',
  storageBucket: 'bhojanos-prod.firebasestorage.app',
  messagingSenderId: '170989397954',
  appId: '1:170989397954:web:9c67dbacc58329f360185b',
} as const;

export type AppEnvironment = 'development' | 'preview' | 'production';

export interface AppConfig {
  readonly environment: AppEnvironment;
  readonly marketplaceApiBaseUrl: string;
  readonly marketplaceApiVersion: string;
  readonly firebase: {
    readonly apiKey: string;
    readonly authDomain: string;
    readonly projectId: string;
    readonly storageBucket: string;
    readonly messagingSenderId: string;
    readonly appId: string;
    readonly measurementId?: string;
  };
  readonly features: {
    readonly mswEnabled: boolean;
    readonly appCheckEnabled: boolean;
    readonly analyticsEnabled: boolean;
  };
  readonly api: {
    readonly timeoutMs: number;
    readonly retryAttempts: number;
    readonly retryDelayMs: number;
  };
}

function readEnv(key: string, fallback = ''): string {
  const env = import.meta.env ?? {};
  return (env as Record<string, string | undefined>)[key]?.trim() ?? fallback;
}

function resolveEnvironment(): AppEnvironment {
  const env = import.meta.env ?? {};
  const explicit = (env as Record<string, string | undefined>).VITE_APP_ENV?.trim();
  if (explicit === 'production' || explicit === 'preview' || explicit === 'development') {
    return explicit;
  }
  return env.PROD ? 'production' : 'development';
}

function isCapacitorRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const hasCapacitorGlobal = Boolean(
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
    );
    const isCapacitorScheme = window.location.protocol === 'capacitor:';
    const isLocalhostHttps = window.location.hostname === 'localhost' && window.location.protocol === 'https:';
    return hasCapacitorGlobal || isCapacitorScheme || isLocalhostHttps;
  } catch {
    return false;
  }
}

function isLiveMarketplaceBuild(): boolean {
  const explicit = readEnv('VITE_FF_OB_FIRESTORE');
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return Boolean(import.meta.env?.PROD || isCapacitorRuntime());
}

function resolveFirebaseProjectId(liveMarketplace: boolean): string {
  const explicit = readEnv('VITE_FIREBASE_PROJECT_ID');
  if ((liveMarketplace || isCapacitorRuntime()) && (!explicit || explicit === 'orderbhojan')) {
    return 'bhojanos-prod';
  }
  return explicit || (liveMarketplace ? 'bhojanos-prod' : 'orderbhojan');
}

/** Live Render backend — used when production builds accidentally inherit a loopback proxy. */
export const LIVE_MARKETPLACE_API_DEFAULT = 'https://manaintibojanam-backend.onrender.com';

/** True for hosts that phones / Capacitor WebViews cannot reach as an API base. */
export function isNonRoutableDevApiHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1' ||
      host.endsWith('.local')
    );
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

function resolveMarketplaceApiBaseUrl(liveMarketplace: boolean): string {
  const explicitApiUrl = readEnv('VITE_MARKETPLACE_API_URL') || readEnv('VITE_API_URL');
  const isCapacitor = isCapacitorRuntime();

  let marketplaceApiBaseUrl = explicitApiUrl
    ? explicitApiUrl.replace(/\/$/, '')
    : isCapacitor
      ? LIVE_MARKETPLACE_API_DEFAULT
      : liveMarketplace && import.meta.env?.DEV
        ? typeof window !== 'undefined'
          ? window.location.origin
          : readEnv('VITE_MARKETPLACE_API_PROXY', 'http://localhost:8080')
        : liveMarketplace
          ? readEnv('VITE_MARKETPLACE_API_PROXY', LIVE_MARKETPLACE_API_DEFAULT)
          : import.meta.env?.DEV
            ? typeof window !== 'undefined'
              ? window.location.origin
              : 'http://localhost:5174'
            : LIVE_MARKETPLACE_API_DEFAULT;

  // Capacitor/Native and production builds must NEVER use non-routable dev hosts (localhost, 127.0.0.1).
  if (isCapacitor || import.meta.env?.PROD || isLiveMarketplaceBuild() || isNonRoutableDevApiHost(marketplaceApiBaseUrl)) {
    if (isNonRoutableDevApiHost(marketplaceApiBaseUrl)) {
      marketplaceApiBaseUrl = LIVE_MARKETPLACE_API_DEFAULT;
    }
  }

  return marketplaceApiBaseUrl.replace(/\/$/, '');
}

export function loadAppConfig(): AppConfig {
  const liveMarketplace = isLiveMarketplaceBuild();
  const marketplaceApiBaseUrl = resolveMarketplaceApiBaseUrl(liveMarketplace);

  return {
    environment: resolveEnvironment(),
    marketplaceApiBaseUrl,
    marketplaceApiVersion: readEnv('VITE_MARKETPLACE_API_VERSION', '1.0'),
    firebase: {
      apiKey: readEnv('VITE_FIREBASE_API_KEY') || BHOJANOS_PROD_FIREBASE_PUBLIC.apiKey,
      authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || BHOJANOS_PROD_FIREBASE_PUBLIC.authDomain,
      projectId: resolveFirebaseProjectId(liveMarketplace),
      storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || BHOJANOS_PROD_FIREBASE_PUBLIC.storageBucket,
      messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || BHOJANOS_PROD_FIREBASE_PUBLIC.messagingSenderId,
      appId: readEnv('VITE_FIREBASE_APP_ID') || BHOJANOS_PROD_FIREBASE_PUBLIC.appId,
      measurementId: readEnv('VITE_FIREBASE_MEASUREMENT_ID') || undefined,
    },
    features: {
      mswEnabled:
        liveMarketplace
          ? false
          : readEnv('VITE_MSW_ENABLED', (import.meta.env?.DEV ? 'true' : 'false')) === 'true',
      appCheckEnabled: readEnv('VITE_APP_CHECK_ENABLED', 'false') === 'true',
      analyticsEnabled: readEnv('VITE_ANALYTICS_ENABLED', 'true') === 'true',
    },
    api: {
      timeoutMs: Number(readEnv('VITE_API_TIMEOUT_MS', '30000')),
      retryAttempts: Number(readEnv('VITE_API_RETRY_ATTEMPTS', '2')),
      retryDelayMs: Number(readEnv('VITE_API_RETRY_DELAY_MS', '500')),
    },
  };
}
