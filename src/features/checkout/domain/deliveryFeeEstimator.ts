import { getMarketplaceApiClient } from '@/marketplace-api';
import type { DistanceResult, DeliveryZoneResult, ServiceabilityResult } from '@/types/marketplace-location';
import type { RestaurantExperiencePublic } from '@/types/marketplace-restaurant';

const DELIVERY_FEE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_ENTRIES = 50;

interface DeliveryFeeCacheEntry {
  readonly restaurantId: string;
  readonly customerLat: number;
  readonly customerLng: number;
  readonly restaurantLat: number;
  readonly restaurantLng: number;
  readonly fee: number | null;
  readonly known: boolean;
  readonly computedAt: number;
  readonly zoneConfigHash: string;
}

interface DeliveryFeeConfig {
  readonly baseFee: number;
  readonly perKmRate: number;
  readonly minOrderForFreeDelivery?: number;
  readonly maxDistanceKm?: number;
}

let deliveryFeeCache: DeliveryFeeCacheEntry[] = [];

function generateZoneConfigHash(
  distance: DistanceResult,
  zone: DeliveryZoneResult,
  serviceability: ServiceabilityResult
): string {
  return `${distance.distanceKm.toFixed(2)}|${zone.inZone}|${zone.maxRadiusKm ?? 0}|${serviceability.delivery}`;
}

function readCache(
  restaurantId: string,
  customerLat: number,
  customerLng: number,
  restaurantLat: number,
  restaurantLng: number
): DeliveryFeeCacheEntry | null {
  const now = Date.now();
  const entry = deliveryFeeCache.find(
    (e) => e.restaurantId === restaurantId &&
      Math.abs(e.customerLat - customerLat) < 0.001 &&
      Math.abs(e.customerLng - customerLng) < 0.001 &&
      Math.abs(e.restaurantLat - restaurantLat) < 0.001 &&
      Math.abs(e.restaurantLng - restaurantLng) < 0.001 &&
      now - e.computedAt <= DELIVERY_FEE_CACHE_TTL_MS
  );
  return entry ?? null;
}

function writeCache(entry: DeliveryFeeCacheEntry): void {
  const now = Date.now();
  deliveryFeeCache = [
    entry,
    ...deliveryFeeCache.filter(
      (e) => e.restaurantId !== entry.restaurantId ||
        Math.abs(e.customerLat - entry.customerLat) > 0.001 ||
        Math.abs(e.customerLng - entry.customerLng) > 0.001 ||
        now - e.computedAt <= DELIVERY_FEE_CACHE_TTL_MS
    ).slice(0, MAX_CACHE_ENTRIES - 1),
  ];
}

function clearCacheForRestaurant(restaurantId: string): void {
  deliveryFeeCache = deliveryFeeCache.filter((e) => e.restaurantId !== restaurantId);
}

/**
 * Estimates delivery fee based on distance and tenant config.
 * Returns null if coordinates are missing — never falls back to (0,0).
 */
export function estimateDeliveryFee(
  customerLat: number | null | undefined,
  customerLng: number | null | undefined,
  restaurantLat: number | null | undefined,
  restaurantLng: number | null | undefined,
  config: DeliveryFeeConfig = DEFAULT_CONFIG
): { fee: number; distanceKm: number } | null {
  // CRITICAL: Never fall back to (0,0) — that produces fake distances
  if (
    customerLat == null ||
    customerLng == null ||
    restaurantLat == null ||
    restaurantLng == null
  ) {
    return null;
  }

  const distanceKm = getDistance(
    { latitude: customerLat, longitude: customerLng },
    { latitude: restaurantLat, longitude: restaurantLng }
  ) / 1000;

  if (distanceKm > config.maxDistanceKm) {
    return null;
  }

  if (distanceKm <= config.freeRadiusKm) {
    return { fee: 0, distanceKm };
  }

  const fee = Math.max(config.baseFee, config.baseFee + Math.ceil(distanceKm - config.baseRadiusKm) * config.perKmRate);
  return { fee: config.minOrderForFreeDelivery > 0 ? fee : fee, distanceKm };
}
function getDefaultConfig(): DeliveryFeeConfig {
  return {
    baseFee: 30,
    perKmRate: 5,
    minOrderForFreeDelivery: 299,
    maxDistanceKm: 15,
  };
}

/**
 * Estimates delivery fee locally using distance, delivery zone, and serviceability.
 * This provides an instant estimate before the server quote arrives.
 */
export async function estimateLocalDeliveryFee(
  restaurantId: string,
  customerLat: number,
  customerLng: number,
  restaurantLat: number,
  restaurantLng: number,
  experience?: RestaurantExperiencePublic | null
): Promise<{ fee: number | null; known: boolean; fromCache: boolean }> {
  // Never price a route from missing/zero restaurant coordinates — a (0,0) origin
  // must not silently produce a plausible-looking delivery fee.
  if (
    !Number.isFinite(customerLat) ||
    !Number.isFinite(customerLng) ||
    !Number.isFinite(restaurantLat) ||
    !Number.isFinite(restaurantLng) ||
    (restaurantLat === 0 && restaurantLng === 0)
  ) {
    return { fee: null, known: false, fromCache: false };
  }

  // Check cache first
  const cached = readCache(restaurantId, customerLat, customerLng, restaurantLat, restaurantLng);
  if (cached) {
    return { fee: cached.fee, known: cached.known, fromCache: true };
  }

  // If we already have a fee from the restaurant experience, use it as the baseline
  if (experience?.deliveryFee != null && experience.deliveryFeeKnown) {
    const result = { fee: experience.deliveryFee, known: true, fromCache: false };
    writeCache({
      restaurantId,
      customerLat,
      customerLng,
      restaurantLat,
      restaurantLng,
      fee: result.fee,
      known: result.known,
      computedAt: Date.now(),
      zoneConfigHash: 'experience',
    });
    return result;
  }

  // If delivery is explicitly not available
  if (experience?.deliveryFeeKnown === false) {
    const result = { fee: null, known: true, fromCache: false };
    writeCache({
      restaurantId,
      customerLat,
      customerLng,
      restaurantLat,
      restaurantLng,
      fee: result.fee,
      known: result.known,
      computedAt: Date.now(),
      zoneConfigHash: 'experience-known-false',
    });
    return result;
  }

  try {
    // Fetch distance, delivery zone, and serviceability in parallel
    const api = getMarketplaceApiClient();
    const [distance, zone, serviceability] = await Promise.all([
      api.locationDistance({
        origin: { lat: customerLat, lng: customerLng },
        destination: { lat: restaurantLat, lng: restaurantLng },
      }),
      api.locationDeliveryZone({
        lat: customerLat,
        lng: customerLng,
        restaurantId,
      }),
      api.locationServiceability({
        lat: customerLat,
        lng: customerLng,
        restaurantId,
        orderType: 'delivery',
      }),
    ]);

    const configHash = generateZoneConfigHash(distance, zone, serviceability);

    // Check cache with config hash
    const cachedWithConfig = deliveryFeeCache.find(
      (e) => e.restaurantId === restaurantId &&
        Math.abs(e.customerLat - customerLat) < 0.001 &&
        Math.abs(e.customerLng - customerLng) < 0.001 &&
        e.zoneConfigHash === configHash &&
        Date.now() - e.computedAt <= DELIVERY_FEE_CACHE_TTL_MS
    );
    if (cachedWithConfig) {
      return { fee: cachedWithConfig.fee, known: cachedWithConfig.known, fromCache: true };
    }

    // If not serviceable or not in zone, no delivery
    if (!serviceability.delivery || !zone.inZone) {
      const result = { fee: null, known: true, fromCache: false };
      writeCache({
        restaurantId,
        customerLat,
        customerLng,
        restaurantLat,
        restaurantLng,
        fee: result.fee,
        known: result.known,
        computedAt: Date.now(),
        zoneConfigHash: configHash,
      });
      return result;
    }

    // Check max distance
    const maxDistance = zone.maxRadiusKm ?? getDefaultConfig().maxDistanceKm ?? 15;
    if (distance.distanceKm > maxDistance) {
      const result = { fee: null, known: true, fromCache: false };
      writeCache({
        restaurantId,
        customerLat,
        customerLng,
        restaurantLat,
        restaurantLng,
        fee: result.fee,
        known: result.known,
        computedAt: Date.now(),
        zoneConfigHash: configHash,
      });
      return result;
    }

    // Calculate fee: base + perKm * distance
    const config = getDefaultConfig();
    let fee = config.baseFee + config.perKmRate * distance.distanceKm;
    fee = Math.round(fee * 100) / 100; // Round to 2 decimal places

    const result = { fee, known: true, fromCache: false };
    writeCache({
      restaurantId,
      customerLat,
      customerLng,
      restaurantLat,
      restaurantLng,
      fee: result.fee,
      known: result.known,
      computedAt: Date.now(),
      zoneConfigHash: configHash,
    });
    return result;
  } catch {
    // On error, fall back to experience fee if available, otherwise unknown
    if (experience?.deliveryFee != null) {
      const result = { fee: experience.deliveryFee, known: false, fromCache: false };
      writeCache({
        restaurantId,
        customerLat,
        customerLng,
        restaurantLat,
        restaurantLng,
        fee: result.fee,
        known: result.known,
        computedAt: Date.now(),
        zoneConfigHash: 'fallback-experience',
      });
      return result;
    }
    return { fee: null, known: false, fromCache: false };
  }
}

/**
 * Invalidates the delivery fee cache for a specific restaurant.
 * Call this when restaurant context changes (e.g., different restaurant, address change).
 */
export function invalidateDeliveryFeeCache(restaurantId: string): void {
  clearCacheForRestaurant(restaurantId);
}

/**
 * Invalidates all delivery fee cache entries.
 */
export function invalidateAllDeliveryFeeCache(): void {
  deliveryFeeCache = [];
}

/**
 * Gets a cached delivery fee estimate without making network calls.
 * Returns null if no valid cache entry exists.
 */
export function getCachedDeliveryFeeEstimate(
  restaurantId: string,
  customerLat: number,
  customerLng: number,
  restaurantLat: number,
  restaurantLng: number
): { fee: number | null; known: boolean } | null {
  if (
    !Number.isFinite(customerLat) ||
    !Number.isFinite(customerLng) ||
    !Number.isFinite(restaurantLat) ||
    !Number.isFinite(restaurantLng) ||
    (restaurantLat === 0 && restaurantLng === 0)
  ) {
    return null;
  }
  const cached = readCache(restaurantId, customerLat, customerLng, restaurantLat, restaurantLng);
  if (cached) {
    return { fee: cached.fee, known: cached.known };
  }
  return null;
}