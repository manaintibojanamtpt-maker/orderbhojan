import { getAppConfig } from '@/config';
import { shouldBypassMarketplaceHttpCache } from '@/config/marketplaceQueryPolicy';
import { generateCorrelationId } from '@/utils';
import type { ApiResult } from '@/types/marketplace';
import { withRequestDeadline, waitForSignal, abortableDelay } from '@/lib/requestDeadline';
import {
  mapApiFailureToError,
  mapUnknownError,
  MarketplaceApiError,
} from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface MarketplaceRequestOptions {
  readonly method?: HttpMethod;
  readonly path: string;
  readonly query?: Record<string, string | number | boolean | undefined>;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly authToken?: string | null;
  readonly contextToken?: string | null;
  readonly correlationId?: string;
  readonly signal?: AbortSignal;
  readonly bypassHttpCache?: boolean;
  readonly timeoutMs?: number;
  /** Only for read-only POSTs, never a generic opt-in for order mutations. */
  readonly readOnly?: boolean;
}

export interface MarketplaceClientConfig {
  readonly baseUrl: string;
  readonly apiVersion: string;
  readonly timeoutMs: number;
  readonly retryAttempts: number;
  readonly retryDelayMs: number;
  readonly getAuthToken?: () => Promise<string | null>;
}

export class MarketplaceHttpClient {
  private readonly config: MarketplaceClientConfig;
  private sessionCorrelationId: string;

  constructor(config: MarketplaceClientConfig) {
    this.config = config;
    this.sessionCorrelationId = generateCorrelationId();
  }

  getSessionCorrelationId(): string {
    return this.sessionCorrelationId;
  }

  resetSessionCorrelationId(): void {
    this.sessionCorrelationId = generateCorrelationId();
  }

  async request<T>(options: MarketplaceRequestOptions): Promise<T> {
    const correlationId = options.correlationId ?? this.sessionCorrelationId;
    // timeoutMs is an overall budget, not a fresh allowance per retry.
    try {
      return await withRequestDeadline(options.timeoutMs ?? this.config.timeoutMs, options.signal, async (signal) => {
        for (let attempt = 0; ; attempt++) {
      try {
        return await this.executeOnce<T>(options, correlationId, signal);
      } catch (error) {
        signal.throwIfAborted();
        const mapped = mapUnknownError(error);
        const safe = (options.method ?? 'GET') === 'GET' || options.readOnly === true;
        const shouldRetry = safe && mapped.retryable && attempt < this.config.retryAttempts;
        if (!shouldRetry) {
          throw mapped;
        }
        await abortableDelay(this.config.retryDelayMs * (attempt + 1), signal);
      }
        }
      });
    } catch (error) {
      throw mapUnknownError(error);
    }
  }

  private async executeOnce<T>(
    options: MarketplaceRequestOptions,
    correlationId: string,
    signal: AbortSignal,
  ): Promise<T> {
    const url = this.buildUrl(options.path, options.query);

    const token =
      options.authToken !== undefined
        ? options.authToken
        : this.config.getAuthToken
          ? await waitForSignal(() => this.config.getAuthToken!(), signal)
          : null;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      'X-Marketplace-API-Version': this.config.apiVersion,
      ...(options.bypassHttpCache ?? shouldBypassMarketplaceHttpCache()
        ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
        : {}),
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (options.contextToken) {
      headers['X-Context-Token'] = options.contextToken;
    }

      signal.throwIfAborted();
      const response = await waitForSignal(() => fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal,
      }), signal);

      const responseCorrelationId =
        response.headers.get('X-Correlation-Id') ?? correlationId;

      let payload: ApiResult<T> | null = null;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        payload = (await waitForSignal(() => response.json(), signal)) as ApiResult<T>;
      }

      if (!response.ok) {
        if (payload && 'ok' in payload && payload.ok === false) {
          throw mapApiFailureToError(payload, response.status, responseCorrelationId);
        }
        const gatewayLike = payload as {
          success?: boolean;
          code?: string;
          error?: string;
          message?: string;
        } | null;
        if (gatewayLike && typeof gatewayLike.code === 'string' && gatewayLike.code.trim()) {
          throw new MarketplaceApiError({
            code: gatewayLike.code,
            message:
              (typeof gatewayLike.error === 'string' && gatewayLike.error) ||
              (typeof gatewayLike.message === 'string' && gatewayLike.message) ||
              response.statusText ||
              'Request failed',
            status: response.status,
            correlationId: responseCorrelationId,
            retryable:
              response.status >= 500 ||
              response.status === 429 ||
              gatewayLike.code === 'AI_CANARY_HEALTH_GATE',
          });
        }
        throw new MarketplaceApiError({
          code: `HTTP_${response.status}`,
          message: response.statusText || 'Request failed',
          status: response.status,
          correlationId: responseCorrelationId,
          retryable: response.status >= 500 || response.status === 429,
        });
      }

      if (!payload) {
        throw new MarketplaceApiError({
          code: 'INVALID_RESPONSE',
          message: 'Expected JSON response',
          status: response.status,
          correlationId: responseCorrelationId,
        });
      }

      if ('ok' in payload && payload.ok === false) {
        throw mapApiFailureToError(payload, response.status, responseCorrelationId);
      }

      if ('ok' in payload && payload.ok === true) {
        return payload.value;
      }

      return payload as T;
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const base = this.config.baseUrl.replace(/\/$/, '');
    const qs =
      query && Object.keys(query).length > 0
        ? `?${new URLSearchParams(
            Object.entries(query)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [k, String(v)]),
          ).toString()}`
        : '';
    return `${base}${normalizedPath}${qs}`;
  }
}

export function createMarketplaceHttpClient(
  overrides: Partial<MarketplaceClientConfig> = {},
): MarketplaceHttpClient {
  const app = getAppConfig();
  return new MarketplaceHttpClient({
    baseUrl: app.marketplaceApiBaseUrl,
    apiVersion: app.marketplaceApiVersion,
    timeoutMs: app.api.timeoutMs,
    retryAttempts: app.api.retryAttempts,
    retryDelayMs: app.api.retryDelayMs,
    ...overrides,
  });
}
