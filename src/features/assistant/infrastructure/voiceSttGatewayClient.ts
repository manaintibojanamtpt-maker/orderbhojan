/**
 * OrderBhojan Voice Gateway STT Client
 *
 * Communicates with the backend /api/voice/transcribe endpoint powered by
 * Sarvam AI's flagship Saaras v4 model.
 *
 * Security & Integrity:
 * - Sarvam AI secret key is never exposed to the client; all calls go through the server gateway.
 * - Supports dynamic menu biasing via keyterms.
 * - Defaults to language_code="unknown" for automated Indic language detection.
 * - Bounded retries with exponential backoff on transient 429/503 errors.
 */

import { getAppConfig } from '@/config';
import { getMarketplaceAuthTokenProvider } from '@/marketplace-api';
import { AssistantApiError } from '../types';

export interface TranscribeAudioOptions {
  audioBase64?: string;
  audioBlob?: Blob;
  mime?: string;
  lang?: string;
  keyterms?: readonly string[];
  restaurantId?: string;
  restaurantSlug?: string;
  withTimestamps?: boolean;
  promptText?: string;
  signal?: AbortSignal;
}

export interface SttGatewayResponse {
  success: boolean;
  transcript: string;
  language: string;
  confidence: number;
  provider: string;
  model: string;
  requestId?: string;
  timestamps?: {
    words?: Array<{
      word: string;
      start_time_seconds: number;
      end_time_seconds: number;
    }>;
  };
  keytermsUsedCount?: number;
  latencyMs?: number;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to encode audio blob to base64'));
    reader.readAsDataURL(blob);
  });
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Aborted'));
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      },
      { once: true },
    );
  });
}

export async function transcribeAudioViaGateway(
  options: TranscribeAudioOptions,
): Promise<SttGatewayResponse> {
  const {
    audioBase64: rawB64,
    audioBlob,
    mime = 'audio/wav',
    lang = 'unknown',
    keyterms,
    restaurantId,
    restaurantSlug,
    withTimestamps = true,
    promptText,
    signal,
  } = options;

  let audioBase64 = rawB64;
  if (!audioBase64 && audioBlob) {
    audioBase64 = await blobToBase64(audioBlob);
  }

  if (!audioBase64 || !audioBase64.trim()) {
    throw new AssistantApiError({
      code: 'AI_VOICE_EMPTY',
      message: 'No audio content provided for speech recognition.',
      retryable: false,
    });
  }

  const baseUrl = getAppConfig().marketplaceApiBaseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/api/voice/transcribe`;

  const tokenProvider = getMarketplaceAuthTokenProvider();
  const token = tokenProvider ? await tokenProvider() : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const payload: Record<string, unknown> = {
    audioBase64,
    mime,
    lang,
    model: 'saaras:v4',
    withTimestamps,
  };

  if (keyterms && keyterms.length > 0) {
    payload.keyterms = keyterms;
  }
  if (restaurantId) {
    payload.restaurantId = restaurantId;
  }
  if (restaurantSlug) {
    payload.restaurantSlug = restaurantSlug;
  }
  if (promptText) {
    payload.promptText = promptText;
  }

  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (signal?.aborted) {
        throw new AssistantApiError({
          code: 'AI_VOICE_ABORTED',
          message: 'Speech recognition was cancelled.',
          retryable: false,
        });
      }

      let activeUrl = url;
      let response = await fetch(activeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      });

      if (response.status === 404 && activeUrl.endsWith('/transcribe')) {
        activeUrl = `${baseUrl}/api/voice/stt`;
        response = await fetch(activeUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal,
        });
      }

      if (response.ok) {
        const json = await response.json();
        if (json.success && typeof json.transcript === 'string') {
          return {
            success: true,
            transcript: json.transcript.trim(),
            language: json.language || lang,
            confidence: typeof json.confidence === 'number' ? json.confidence : 1.0,
            provider: json.provider || 'sarvam',
            model: json.model || 'saaras:v4',
            requestId: json.requestId,
            timestamps: json.timestamps,
            keytermsUsedCount: json.keytermsUsedCount,
            latencyMs: json.latencyMs,
          };
        }
        throw new AssistantApiError({
          code: 'AI_VOICE_ERROR',
          message: json.error || 'Speech transcription failed on server',
          retryable: json.retryable ?? false,
        });
      }

      const status = response.status;
      let errBody: any = null;
      try {
        errBody = await response.json();
      } catch {
        /* non-json error body */
      }

      if (status === 429) {
        if (attempt < maxAttempts) {
          const backoffMs = Math.min(2000, 300 * Math.pow(2, attempt));
          await delay(backoffMs, signal);
          continue;
        }
        throw new AssistantApiError({
          code: 'AI_RATE_LIMITED',
          message: 'Speech recognition rate limit exceeded. Please wait a moment.',
          retryable: true,
        });
      }

      if (status >= 500 && status < 600) {
        if (attempt < maxAttempts) {
          const backoffMs = Math.min(2000, 200 * Math.pow(2, attempt));
          await delay(backoffMs, signal);
          continue;
        }
        throw new AssistantApiError({
          code: 'AI_UNAVAILABLE',
          message: errBody?.error || 'Speech service is temporarily unavailable.',
          retryable: true,
        });
      }

      throw new AssistantApiError({
        code: 'AI_VOICE_ERROR',
        message: errBody?.error || `STT gateway failed with status ${status}`,
        retryable: false,
      });
    } catch (err: any) {
      if (err instanceof AssistantApiError) {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts && !signal?.aborted) {
        await delay(200 * attempt, signal);
        continue;
      }
      break;
    }
  }

  throw new AssistantApiError({
    code: 'NETWORK_ERROR',
    message: lastError?.message || 'Failed to connect to speech recognition gateway.',
    retryable: true,
  });
}
