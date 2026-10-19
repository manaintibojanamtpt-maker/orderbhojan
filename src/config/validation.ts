import { CANONICAL_FIREBASE_PROJECT_ID, type AppConfig } from './environment';

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export function validateAppConfig(config: AppConfig): void {
  const errors: string[] = [];

  if (!config.marketplaceApiBaseUrl || !config.marketplaceApiBaseUrl.startsWith('http')) {
    errors.push('marketplaceApiBaseUrl must be an explicit absolute URL');
  }

  if (!config.marketplaceApiVersion) {
    errors.push('marketplaceApiVersion is required');
  }

  if (Number.isNaN(config.api.timeoutMs) || config.api.timeoutMs < 1000 || config.api.timeoutMs > 120_000) {
    errors.push('api.timeoutMs must be between 1000 and 120000 (invalid timeout)');
  }

  if (config.environment === 'production') {
    if (config.firebase.projectId.startsWith('demo-')) {
      errors.push('firebase.projectId must not be a demo/emulator project in production');
    } else if (config.firebase.projectId !== CANONICAL_FIREBASE_PROJECT_ID) {
      errors.push(`firebase.projectId must be '${CANONICAL_FIREBASE_PROJECT_ID}' in production; got '${config.firebase.projectId}'`);
    }
    if (config.firebase.firestoreEmulatorHost) {
      errors.push('firebase.firestoreEmulatorHost must not be set in production');
    }
    if (config.firebase.authEmulatorHost) {
      errors.push('firebase.authEmulatorHost must not be set in production');
    }

    const requiredFirebase = [
      'apiKey',
      'authDomain',
      'projectId',
      'appId',
    ] as const;

    for (const key of requiredFirebase) {
      if (!config.firebase[key]) {
        errors.push(`firebase.${key} is required in production`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors.join('; '));
  }
}
