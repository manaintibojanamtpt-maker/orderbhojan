import { type AppConfig, BHOJANOS_PROD_FIREBASE_PUBLIC } from './environment';

export interface RemoteClientConfig {
  readonly firebase: {
    readonly apiKey: string;
    readonly authDomain: string;
    readonly projectId: string;
    readonly storageBucket: string;
    readonly messagingSenderId: string;
    readonly appId: string;
  };
  readonly configured?: boolean;
}

export { BHOJANOS_PROD_FIREBASE_PUBLIC };

/**
 * Web OAuth client ID for native Google sign-in (Capacitor).
 * Must match `default_web_client_id` generated from android/app/google-services.json.
 */
export const BHOJANOS_PROD_GOOGLE_WEB_CLIENT_ID =
  '170989397954-6mimml7p7gft6vg71essvpt74bat4kbc.apps.googleusercontent.com' as const;

/** Debug keystore SHA-1 for `orderbhojan/android` — register in Firebase Console for native Google sign-in. */
export const ORDERBHOJAN_ANDROID_DEBUG_SHA1 =
  '9A:0E:E4:A5:84:5D:72:B5:8D:71:E3:82:BE:0E:7E:A4:79:1B:30:5F' as const;

export function isFirebaseConfigIncomplete(config: AppConfig): boolean {
  const { firebase } = config;
  return !firebase.apiKey || !firebase.authDomain || !firebase.appId || !firebase.messagingSenderId;
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

export function shouldApplyProdFirebaseDefaults(config: AppConfig): boolean {
  // Apply bhojanos-prod public defaults ONLY when the project explicitly matches bhojanos-prod,
  // or in production/Capacitor when no project ID is specified.
  if (config.firebase.projectId === BHOJANOS_PROD_FIREBASE_PUBLIC.projectId) {
    return true;
  }
  if (!config.firebase.projectId && (config.environment === 'production' || isCapacitorRuntime())) {
    return true;
  }
  return false;
}

export function applyFirebaseDefaults(config: AppConfig): AppConfig {
  if (!shouldApplyProdFirebaseDefaults(config)) {
    return config;
  }
  return {
    ...config,
    firebase: {
      ...config.firebase,
      apiKey: config.firebase.apiKey || BHOJANOS_PROD_FIREBASE_PUBLIC.apiKey,
      authDomain: config.firebase.authDomain || BHOJANOS_PROD_FIREBASE_PUBLIC.authDomain,
      projectId: config.firebase.projectId || BHOJANOS_PROD_FIREBASE_PUBLIC.projectId,
      storageBucket: config.firebase.storageBucket || BHOJANOS_PROD_FIREBASE_PUBLIC.storageBucket,
      messagingSenderId: config.firebase.messagingSenderId || BHOJANOS_PROD_FIREBASE_PUBLIC.messagingSenderId,
      appId: config.firebase.appId || BHOJANOS_PROD_FIREBASE_PUBLIC.appId,
    },
  };
}

export function mergeRemoteFirebaseConfig(
  config: AppConfig,
  remote: RemoteClientConfig,
): AppConfig {
  const remoteFirebase = remote.firebase;
  return {
    ...config,
    firebase: {
      apiKey: config.firebase.apiKey || remoteFirebase.apiKey || '',
      authDomain: config.firebase.authDomain || remoteFirebase.authDomain || '',
      projectId: config.firebase.projectId || remoteFirebase.projectId || '',
      storageBucket: config.firebase.storageBucket || remoteFirebase.storageBucket || '',
      messagingSenderId: config.firebase.messagingSenderId || remoteFirebase.messagingSenderId || '',
      appId: config.firebase.appId || remoteFirebase.appId || '',
      measurementId: config.firebase.measurementId,
      firestoreEmulatorHost: config.firebase.firestoreEmulatorHost,
      authEmulatorHost: config.firebase.authEmulatorHost,
    },
  };
}

/** Live production must adopt backend Firebase project even when build env still says orderbhojan. */
export function mergeRemoteFirebaseConfigPreferRemote(
  config: AppConfig,
  remote: RemoteClientConfig,
): AppConfig {
  const remoteFirebase = remote.firebase;
  return {
    ...config,
    firebase: {
      apiKey: remoteFirebase.apiKey || config.firebase.apiKey,
      authDomain: remoteFirebase.authDomain || config.firebase.authDomain,
      projectId: remoteFirebase.projectId || BHOJANOS_PROD_FIREBASE_PUBLIC.projectId,
      storageBucket: remoteFirebase.storageBucket || config.firebase.storageBucket,
      messagingSenderId: remoteFirebase.messagingSenderId || config.firebase.messagingSenderId,
      appId: remoteFirebase.appId || config.firebase.appId,
      measurementId: config.firebase.measurementId,
      firestoreEmulatorHost: config.firebase.firestoreEmulatorHost,
      authEmulatorHost: config.firebase.authEmulatorHost,
    },
  };
}

export async function fetchRemoteClientConfig(
  baseUrl: string,
  timeoutMs = 5000,
): Promise<RemoteClientConfig | null> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/client-config`;
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  try {
    const fetchPromise = fetch(url, { credentials: 'same-origin', signal: controller.signal });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        controller.abort(err);
        reject(err);
      }, timeoutMs);
    });
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as RemoteClientConfig;
    if (!payload?.firebase) {
      return null;
    }
    return payload;
  } catch (err: unknown) {
    const isTimeout =
      (err instanceof Error && err.name === 'TimeoutError') || controller.signal.aborted;
    if (isTimeout) {
      const timeoutError = new Error('TimeoutError');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function hydrateFirebaseConfig(
  config: AppConfig,
  timeoutMs = 5000,
): Promise<AppConfig> {
  let hydrated = applyFirebaseDefaults(config);
  const usesLiveBackend = hydrated.marketplaceApiBaseUrl.includes('manaintibojanam-backend');
  const isLiveProductionBackend = Boolean(import.meta.env?.PROD) && usesLiveBackend;
  const wrongProdFirebaseProject =
    isLiveProductionBackend && hydrated.firebase.projectId === 'orderbhojan';

  // The browser bundle already has the canonical public Firebase config. If a production
  // build accidentally names the legacy project, correct it locally instead of blocking
  // first paint on a Render request that may be cold or temporarily unavailable.
  if (wrongProdFirebaseProject) {
    hydrated = {
      ...hydrated,
      firebase: {
        ...BHOJANOS_PROD_FIREBASE_PUBLIC,
        measurementId: hydrated.firebase.measurementId,
      },
    };
  }

  // Only fetch remote config when required fields are genuinely missing, or a production
  // live-backend build targets a non-canonical project that must be checked against the API.
  const needsRemoteProjectValidation =
    isLiveProductionBackend &&
    hydrated.firebase.projectId !== BHOJANOS_PROD_FIREBASE_PUBLIC.projectId;
  if (!isFirebaseConfigIncomplete(hydrated) && !needsRemoteProjectValidation) {
    return applyFirebaseDefaults(hydrated);
  }

  const remote = await fetchRemoteClientConfig(hydrated.marketplaceApiBaseUrl, timeoutMs);
  if (remote) {
    if (
      remote.firebase.projectId &&
      hydrated.firebase.projectId &&
      remote.firebase.projectId !== hydrated.firebase.projectId
    ) {
      throw new Error(
        `Refusing unintended Firebase project: expected ${hydrated.firebase.projectId}, got ${remote.firebase.projectId}`,
      );
    }
    hydrated =
      wrongProdFirebaseProject || (usesLiveBackend && Boolean(import.meta.env?.PROD))
        ? mergeRemoteFirebaseConfigPreferRemote(hydrated, remote)
        : mergeRemoteFirebaseConfig(hydrated, remote);
  }
  if (isFirebaseConfigIncomplete(hydrated) && shouldApplyProdFirebaseDefaults(hydrated)) {
    hydrated = mergeRemoteFirebaseConfigPreferRemote(hydrated, {
      firebase: BHOJANOS_PROD_FIREBASE_PUBLIC,
      configured: true,
    });
  }
  return applyFirebaseDefaults(hydrated);
}
