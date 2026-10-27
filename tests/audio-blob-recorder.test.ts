import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  startAudioRecording,
  isMediaRecorderSupported,
} from '../src/features/assistant/infrastructure/audioBlobRecorder';
import { AssistantApiError } from '../src/features/assistant/types';

describe('Finding 3 Regression: Audio Blob Recorder & Lifecycle Security', () => {
  let originalMediaDevicesDesc: PropertyDescriptor | undefined;
  let originalWindowDesc: PropertyDescriptor | undefined;
  let originalMediaRecorderDesc: PropertyDescriptor | undefined;

  let stoppedTracks: any[] = [];
  let mediaRecorderInstances: any[] = [];

  class MockMediaStreamTrack {
    kind = 'audio';
    enabled = true;
    stop() {
      stoppedTracks.push(this);
    }
  }

  class MockMediaStream {
    private tracks = [new MockMediaStreamTrack()];
    getTracks() {
      return this.tracks;
    }
  }

  class MockMediaRecorder {
    static isTypeSupported(mime: string) {
      return mime.includes('webm');
    }

    mimeType = 'audio/webm;codecs=opus';
    state: 'inactive' | 'recording' | 'paused' = 'inactive';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    stream: MockMediaStream;

    constructor(stream: MockMediaStream) {
      this.stream = stream;
      mediaRecorderInstances.push(this);
    }

    start(_timeslice?: number) {
      this.state = 'recording';
    }

    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      this.onstop?.();
    }

    requestData() {
      // In real MediaRecorder this flushes pending buffer; here it is a no-op
    }

    emitChunk(size = 512) {
      if (this.state === 'recording') {
        const dummyBuffer = new Uint8Array(size);
        this.ondataavailable?.({ data: new Blob([dummyBuffer], { type: this.mimeType }) });
      }
    }
  }

  beforeEach(() => {
    stoppedTracks = [];
    mediaRecorderInstances = [];

    originalMediaDevicesDesc = Object.getOwnPropertyDescriptor(globalThis.navigator, 'mediaDevices');
    originalWindowDesc = Object.getOwnPropertyDescriptor(globalThis, 'window');
    originalMediaRecorderDesc = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder');

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: async () => new MockMediaStream(),
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'window', {
      value: {
        MediaRecorder: MockMediaRecorder,
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: MockMediaRecorder,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalMediaDevicesDesc) {
      Object.defineProperty(globalThis.navigator, 'mediaDevices', originalMediaDevicesDesc);
    } else {
      delete (globalThis.navigator as any).mediaDevices;
    }

    if (originalWindowDesc) {
      Object.defineProperty(globalThis, 'window', originalWindowDesc);
    } else {
      delete (globalThis as any).window;
    }

    if (originalMediaRecorderDesc) {
      Object.defineProperty(globalThis, 'MediaRecorder', originalMediaRecorderDesc);
    } else {
      delete (globalThis as any).MediaRecorder;
    }
  });

  it('detects MediaRecorder support correctly', () => {
    assert.equal(isMediaRecorderSupported(), true);
  });

  it('proves recording remains active while user speaks and does NOT resolve immediately', async () => {
    const session = await startAudioRecording({ maxDurationMs: 3000 });
    assert.equal(session.isActive, true, 'Recorder must be in active recording state upon start');

    // Verify completion is still pending (has not immediately stopped/resolved)
    let completedImmediately = false;
    session.completion.then(() => {
      completedImmediately = true;
    });

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(completedImmediately, false, 'Recording must remain active while user speaks, not stop immediately');

    // Clean up
    session.cancel();
  });

  it('collects audio chunks before resolving and returns valid Blob on stop', async () => {
    const session = await startAudioRecording({ maxDurationMs: 4000, minAudioBytes: 256 });
    const instance = mediaRecorderInstances[0];
    assert.ok(instance, 'MediaRecorder instance must be created');

    // User speaks: chunks are emitted
    await new Promise((r) => setTimeout(r, 300)); // satisfy minimum duration > 250ms
    instance.emitChunk(600);
    instance.emitChunk(800);

    // User stops speaking (e.g. taps button or speech ended)
    const stopPromise = session.stop();
    const resultBlob = await session.completion;

    assert.ok(resultBlob, 'Must resolve with recorded Blob');
    assert.equal(resultBlob.size, 1400, 'Blob must contain accumulated chunks (600 + 800 bytes)');
    assert.equal(resultBlob.type, 'audio/webm;codecs=opus');
    assert.equal(stoppedTracks.length, 1, 'Stream tracks must be stopped after recording');

    const directStopResult = await stopPromise;
    assert.equal(directStopResult, resultBlob, 'session.stop() must return the same completion Blob');
  });

  it('guards against empty or startup-only recordings resolving null', async () => {
    const session = await startAudioRecording({ maxDurationMs: 4000, minAudioBytes: 256 });

    // Stopped immediately without emitting chunks or before min duration
    const resultBlob = await session.stop();

    assert.equal(resultBlob, null, 'Empty or startup-only recording (< minAudioBytes or < 250ms) must resolve null');
    assert.equal(stoppedTracks.length, 1, 'Stream tracks must be stopped');
  });

  it('cleanly stops tracks and resolves null on cancel', async () => {
    const session = await startAudioRecording({ maxDurationMs: 4000 });
    const instance = mediaRecorderInstances[0];
    instance.emitChunk(1000);

    // Cancel called (e.g. user dismissed sheet or tapped cancel)
    session.cancel();
    const result = await session.completion;

    assert.equal(result, null, 'Cancelled recording must resolve null');
    assert.equal(stoppedTracks.length, 1, 'Stream tracks must be stopped on cancel');
  });

  it('handles abort signal by cancelling recording and stopping media tracks', async () => {
    const ac = new AbortController();
    const session = await startAudioRecording({ signal: ac.signal });
    const instance = mediaRecorderInstances[0];
    instance.emitChunk(1000);

    ac.abort();
    const result = await session.completion;

    assert.equal(result, null, 'Aborted recording must resolve null');
    assert.equal(stoppedTracks.length, 1, 'Stream tracks must be stopped on abort');
  });

  it('automatically stops recording when bounded maxDurationMs timeout is reached', async () => {
    const session = await startAudioRecording({ maxDurationMs: 350, minAudioBytes: 100 });
    const instance = mediaRecorderInstances[0];

    // Emit chunk before timeout
    await new Promise((r) => setTimeout(r, 260));
    instance.emitChunk(500);

    // Wait for bounded maxDurationMs timeout (350ms)
    const result = await session.completion;

    assert.ok(result, 'Bounded timeout must trigger stop and resolve recorded audio');
    assert.equal(result.size, 500);
    assert.equal(stoppedTracks.length, 1, 'Stream tracks must be stopped after maxDurationMs');
  });

  it('maps microphone permission denial to typed AI_VOICE_PERMISSION_DENIED', async () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: async () => {
          const err = new Error('Permission denied');
          err.name = 'NotAllowedError';
          throw err;
        },
      },
      configurable: true,
      writable: true,
    });

    await assert.rejects(
      () => startAudioRecording(),
      (err: any) => {
        assert.ok(err instanceof AssistantApiError);
        assert.equal(err.code, 'AI_VOICE_PERMISSION_DENIED');
        assert.equal(err.retryable, false);
        return true;
      },
    );
  });
});
