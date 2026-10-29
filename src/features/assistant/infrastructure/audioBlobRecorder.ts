/**
 * Browser & WebView Audio Capture for Sarvam Gateway STT
 *
 * Captures microphone audio using MediaRecorder API with Voice Activity
 * Detection (VAD) / silence detection, bounded duration timeouts, clean track
 * disposal, and protection against empty or startup-only recordings.
 *
 * Implements OrderBhojan Voice Commerce Overhaul audio capture specification:
 * - Minimum speech-arming grace window (800–1200ms, default 1000ms) to guard
 *   against premature stop during initial mic warmup or user pause.
 * - RMS-based Voice Activity Detection using Web Audio AnalyserNode.
 * - Consecutive frame confirmation to filter out clicks/pops.
 * - Post-speech silence window (900–1200ms, default 1100ms).
 * - Bounded maximum duration timeout (12–15s, default 12000ms).
 * - Immediate AbortController cancellation and clean resource disposal.
 */

import { AssistantApiError } from '../types';

export interface AudioRecordingSession {
  /** Explicitly stop recording and resolve the recorded audio Blob. */
  stop: () => Promise<Blob | null>;
  /** Abort/cancel recording, cleanly stopping tracks and resolving completion with null. */
  cancel: () => void;
  /** Promise that resolves when the recording session completes. */
  completion: Promise<Blob | null>;
  /** Whether the recorder is currently recording audio. */
  readonly isActive: boolean;
}

export interface AudioRecordingOptions {
  /** Maximum duration before auto-stop in milliseconds (12000–15000ms). */
  maxDurationMs?: number;
  /** Post-speech silence window before auto-stop in milliseconds (900–1200ms). */
  silenceTimeoutMs?: number;
  /** Initial grace period in milliseconds where silence auto-stop is inhibited (800–1200ms). */
  speechArmingWindowMs?: number;
  /** RMS amplitude threshold for voice activity detection (e.g. 0.02 - 0.03). */
  rmsThreshold?: number;
  /** Minimum bytes required for a valid recording. */
  minAudioBytes?: number;
  /** AbortSignal for immediate cancellation. */
  signal?: AbortSignal;
  /** Optional callback receiving normalized RMS amplitude (0.0 to 1.0) for visualizers. */
  onAudioLevel?: (rms: number) => void;
}

export function isMediaRecorderSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const hasMediaDevices =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  const hasMediaRecorder = typeof window.MediaRecorder !== 'undefined';
  return hasMediaDevices && hasMediaRecorder;
}

/**
 * Calculates true Root Mean Square (RMS) volume from byte time-domain data.
 * Time domain values range from 0 to 255 with 128 representing silence.
 */
export function calculateTimeDomainRms(buffer: Uint8Array): number {
  if (buffer.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    const normalized = (buffer[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / buffer.length);
}

export async function startAudioRecording(
  options: AudioRecordingOptions = {},
): Promise<AudioRecordingSession> {
  if (options.signal?.aborted) {
    throw new AssistantApiError({
      code: 'AI_VOICE_ABORTED',
      message: 'Voice capture was aborted before starting.',
      retryable: false,
    });
  }

  if (!isMediaRecorderSupported()) {
    throw new AssistantApiError({
      code: 'AI_VOICE_UNSUPPORTED',
      message: 'MediaRecorder is not supported in this environment.',
      retryable: false,
    });
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
        channelCount: 1,
      },
    });
  } catch (err: any) {
    if (
      err?.name === 'NotAllowedError' ||
      err?.name === 'PermissionDeniedError' ||
      err?.message?.includes?.('Permission denied')
    ) {
      throw new AssistantApiError({
        code: 'AI_VOICE_PERMISSION_DENIED',
        message: 'Microphone permission denied.',
        retryable: false,
      });
    }
    throw new AssistantApiError({
      code: 'AI_VOICE_ERROR',
      message: err?.message || 'Failed to acquire microphone stream.',
      retryable: true,
    });
  }

  // If aborted while acquiring microphone
  if (options.signal?.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    throw new AssistantApiError({
      code: 'AI_VOICE_ABORTED',
      message: 'Voice capture was aborted.',
      retryable: false,
    });
  }

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : '';

  const mediaRecorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  const chunks: Blob[] = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  let maxDurationTimer: any = null;
  let silenceTimer: any = null;
  let vadInterval: any = null;
  let audioCtx: any = null;
  let speechDetected = false;
  let consecutiveSpeechFrames = 0;
  let isCleanedUp = false;
  let isStoppedOrCancelled = false;

  const startTime = Date.now();
  // Bounded defaults per voice commerce overhaul specification
  const maxDurationMs = options.maxDurationMs ?? 12000;
  const silenceTimeoutMs = options.silenceTimeoutMs ?? 1100;
  const speechArmingWindowMs = options.speechArmingWindowMs ?? 1000;
  const rmsThreshold = options.rmsThreshold ?? 0.025;
  const minAudioBytes = options.minAudioBytes ?? 256;

  let resolveCompletion: (blob: Blob | null) => void;
  const completion = new Promise<Blob | null>((resolve) => {
    resolveCompletion = resolve;
  });

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer);
      maxDurationTimer = null;
    }
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (vadInterval) {
      clearInterval(vadInterval);
      vadInterval = null;
    }
    if (audioCtx && audioCtx.state !== 'closed') {
      try {
        void audioCtx.close();
      } catch {
        /* ignore close error */
      }
      audioCtx = null;
    }
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* ignore track stop error */
      }
    });
  };

  // Robust Voice Activity Detection (silence detection) via AudioContext Time-Domain RMS
  try {
    const AudioContextClass =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as any).webkitAudioContext
        : null;

    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      if (typeof audioCtx.createMediaStreamSource === 'function') {
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const timeData = new Uint8Array(analyser.frequencyBinCount);
        vadInterval = setInterval(() => {
          if (mediaRecorder.state !== 'recording') return;
          if (typeof analyser.getByteTimeDomainData === 'function') {
            analyser.getByteTimeDomainData(timeData);
            const rms = calculateTimeDomainRms(timeData);
            options.onAudioLevel?.(rms);

            const elapsed = Date.now() - startTime;

            if (rms >= rmsThreshold) {
              consecutiveSpeechFrames++;
              // Require 2 consecutive frames (~160ms) to confirm genuine speech vs audio clicks
              if (consecutiveSpeechFrames >= 2) {
                speechDetected = true;
              }
              if (silenceTimer) {
                clearTimeout(silenceTimer);
                silenceTimer = null;
              }
            } else {
              consecutiveSpeechFrames = 0;
              // Guard against premature stop:
              // Only trigger silence auto-stop if speech was genuinely detected
              // AND the minimum speech-arming grace window has passed.
              if (speechDetected && elapsed >= speechArmingWindowMs && !silenceTimer) {
                silenceTimer = setTimeout(() => {
                  void stop();
                }, silenceTimeoutMs);
              }
            }
          }
        }, 80);
      }
    }
  } catch {
    // VAD optional; gracefully falls back to maxDurationMs / user stop
  }

  const stop = async (): Promise<Blob | null> => {
    if (isStoppedOrCancelled) {
      return completion;
    }
    isStoppedOrCancelled = true;

    if (mediaRecorder.state !== 'inactive') {
      try {
        if (typeof mediaRecorder.requestData === 'function') {
          mediaRecorder.requestData();
        }
        mediaRecorder.stop();
      } catch {
        cleanup();
        resolveCompletion(null);
      }
    } else {
      cleanup();
      resolveCompletion(null);
    }

    return completion;
  };

  const cancel = () => {
    if (isStoppedOrCancelled) return;
    isStoppedOrCancelled = true;
    cleanup();

    if (mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }

    resolveCompletion(null);
  };

  mediaRecorder.onstop = () => {
    cleanup();
    const duration = Date.now() - startTime;
    const totalBytes = chunks.reduce((acc, c) => acc + c.size, 0);

    // Guard against unintended empty or startup-only recordings (< 250ms or < minAudioBytes)
    if (chunks.length === 0 || totalBytes < minAudioBytes || duration < 250) {
      resolveCompletion(null);
      return;
    }

    const outputBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    resolveCompletion(outputBlob);
  };

  if (options.signal) {
    options.signal.addEventListener('abort', cancel, { once: true });
  }

  if (maxDurationMs > 0) {
    maxDurationTimer = setTimeout(() => {
      void stop();
    }, maxDurationMs);
  }

  mediaRecorder.start(250); // Emit audio chunk every 250ms

  return {
    stop,
    cancel,
    completion,
    get isActive() {
      return mediaRecorder.state === 'recording';
    },
  };
}
