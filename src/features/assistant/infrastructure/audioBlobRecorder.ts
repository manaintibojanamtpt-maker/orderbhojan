/**
 * Browser & WebView Audio Capture for Sarvam Gateway STT
 *
 * Captures microphone audio using MediaRecorder API with Voice Activity
 * Detection (VAD) / silence detection, bounded duration timeouts, clean track
 * disposal, and protection against empty or startup-only recordings.
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
  maxDurationMs?: number;
  silenceTimeoutMs?: number;
  minAudioBytes?: number;
  signal?: AbortSignal;
}

export function isMediaRecorderSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const hasMediaDevices =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  const hasMediaRecorder = typeof window.MediaRecorder !== 'undefined';
  return hasMediaDevices && hasMediaRecorder;
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
  let isCleanedUp = false;
  let isStoppedOrCancelled = false;

  const startTime = Date.now();
  const maxDurationMs = options.maxDurationMs ?? 7000;
  const silenceTimeoutMs = options.silenceTimeoutMs ?? 1500;
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

  // Optional Voice Activity Detection (silence detection) via AudioContext
  try {
    const AudioContextClass =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as any).webkitAudioContext
        : null;

    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      vadInterval = setInterval(() => {
        if (mediaRecorder.state !== 'recording') return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        // Speech threshold
        if (avg > 15) {
          speechDetected = true;
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
        } else if (speechDetected && !silenceTimer) {
          // Detected speech previously, now observing silence
          silenceTimer = setTimeout(() => {
            void stop();
          }, silenceTimeoutMs);
        }
      }, 100);
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
