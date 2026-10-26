import {
  geolocationErrorMessage,
  mapGeolocationErrorCode,
  type GeolocationResult,
} from './errors.js';

export const DEFAULT_GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  /** Fast satellite attempt; on timeout falls back to network position. */
  timeout: 10_000,
  maximumAge: 120_000,
};

function queryBrowserPosition(opts: PositionOptions): Promise<GeolocationResult> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
            source: 'gps',
            capturedAt: Date.now(),
          },
        });
      },
      (err) => {
        const code = mapGeolocationErrorCode(err.code);
        resolve({
          ok: false,
          code,
          message: err.message || geolocationErrorMessage(code),
        });
      },
      opts,
    );
  });
}

export async function detectLiveLocation(
  options: PositionOptions = DEFAULT_GEOLOCATION_OPTIONS,
): Promise<GeolocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      ok: false,
      code: 'UNSUPPORTED',
      message: geolocationErrorMessage('UNSUPPORTED'),
    };
  }

  const primaryResult = await queryBrowserPosition(options);
  if (primaryResult.ok) {
    return primaryResult;
  }

  // If high-accuracy GPS timed out (common indoors or before satellite lock),
  // attempt an immediate network-assisted position before surfacing an error.
  if (primaryResult.code === 'TIMEOUT' && options.enableHighAccuracy !== false) {
    const fallbackResult = await queryBrowserPosition({
      enableHighAccuracy: false,
      timeout: 8_000,
      maximumAge: 300_000,
    });
    if (fallbackResult.ok) {
      return fallbackResult;
    }
  }

  return primaryResult;
}
