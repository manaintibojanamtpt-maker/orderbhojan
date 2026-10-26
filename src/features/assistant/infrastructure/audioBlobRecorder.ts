/**
 * Browser & WebView Audio Capture for Sarvam Gateway STT
 *
 * Captures microphone audio using MediaRecorder API and packages into
 * audio/webm or audio/wav Blob for upstream Saaras v4 transcription.
 */

export interface AudioRecordingSession {
  stop: () => Promise<Blob | null>;
  cancel: () => void;
}

export function isMediaRecorderSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const hasMediaDevices =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  const hasMediaRecorder = typeof window.MediaRecorder !== 'undefined';
  return hasMediaDevices && hasMediaRecorder;
}

export async function startAudioRecording(options: {
  maxDurationMs?: number;
  signal?: AbortSignal;
}): Promise<AudioRecordingSession> {
  if (!isMediaRecorderSupported()) {
    throw new Error('MediaRecorder is not supported in this environment');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 16000,
      channelCount: 1,
    },
  });

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

  mediaRecorder.start(250); // Record in 250ms chunks

  let stopPromiseResolve: ((blob: Blob | null) => void) | null = null;
  let timer: any = null;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
  };

  const stop = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      stopPromiseResolve = resolve;

      mediaRecorder.onstop = () => {
        cleanup();
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        const outputBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        resolve(outputBlob);
      };

      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      } else {
        cleanup();
        resolve(null);
      }
    });
  };

  const cancel = () => {
    cleanup();
    if (mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    if (stopPromiseResolve) {
      stopPromiseResolve(null);
    }
  };

  if (options.signal) {
    options.signal.addEventListener('abort', cancel, { once: true });
  }

  if (options.maxDurationMs && options.maxDurationMs > 0) {
    timer = setTimeout(() => {
      stop();
    }, options.maxDurationMs);
  }

  return { stop, cancel };
}
