import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
  type Auth,
  type User,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { getAppConfig } from '@/config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let authPersistenceReady: Promise<void> | null = null;
let firestoreEmulatorConnected = false;
let authEmulatorConnected = false;

function buildFirebaseConfig() {
  const { firebase } = getAppConfig();
  return {
    apiKey: firebase.apiKey || 'demo-api-key',
    authDomain: firebase.authDomain,
    projectId: firebase.projectId,
    storageBucket: firebase.storageBucket,
    messagingSenderId: firebase.messagingSenderId,
    appId: firebase.appId || 'demo-app-id',
    measurementId: firebase.measurementId,
  };
}

export function initializeFirebase(): { app: FirebaseApp | null; auth: Auth | null; firestore: Firestore | null } {
  const config = getAppConfig();
  const { firebase } = config;

  if (!firebase.apiKey || !firebase.projectId) {
    if (config.environment === 'development' && !firebase.firestoreEmulatorHost) {
      return { app: null, auth: null, firestore: null };
    }
  }

  if (!app) {
    app = getApps()[0] ?? initializeApp(buildFirebaseConfig());
    auth = getAuth(app);
    authPersistenceReady = setPersistence(auth, browserLocalPersistence).then(() => undefined);
    firestore = getFirestore(app);
  }

  if (firestore && !import.meta.env?.PROD && firebase.firestoreEmulatorHost && !firestoreEmulatorConnected) {
    const [host, portStr] = firebase.firestoreEmulatorHost.split(':');
    const port = Number(portStr) || 8185;
    connectFirestoreEmulator(firestore, host || '127.0.0.1', port);
    firestoreEmulatorConnected = true;
    console.info(`[Firebase] Connected to Firestore emulator at ${host || '127.0.0.1'}:${port}`);
  }

  if (auth && !import.meta.env?.PROD && firebase.authEmulatorHost && !authEmulatorConnected) {
    connectAuthEmulator(auth, `http://${firebase.authEmulatorHost}`, { disableWarnings: true });
    authEmulatorConnected = true;
    console.info(`[Firebase] Connected to Auth emulator at ${firebase.authEmulatorHost}`);
  }

  return { app, auth: auth!, firestore: firestore! };
}

/** Await before getRedirectResult so redirect sessions restore reliably on web. */
export async function ensureAuthPersistence(): Promise<void> {
  initializeFirebase();
  if (!authPersistenceReady) {
    return;
  }
  await authPersistenceReady;
}

export function getFirebaseAuth(): Auth | null {
  if (!auth) {
    initializeFirebase();
  }
  return auth;
}

export function getFirebaseFirestore(): Firestore | null {
  if (!firestore) {
    initializeFirebase();
  }
  return firestore;
}

export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function getFirebaseIdToken(): Promise<string | null> {
  const { fetchBearerToken } = await import('@/features/auth/application/authService');
  return fetchBearerToken();
}

export function isFirebaseConfigured(): boolean {
  const { firebase } = getAppConfig();
  return Boolean(firebase.apiKey && firebase.projectId && firebase.appId);
}

export function isFirestoreConfigured(): boolean {
  return isFirebaseConfigured();
}
