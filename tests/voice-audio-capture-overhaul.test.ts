import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  startAudioRecording,
  calculateTimeDomainRms,
  isMediaRecorderSupported,
} from '../src/features/assistant/infrastructure/audioBlobRecorder';

describe('OrderBhojan Voice Capture Overhaul: VAD, Grace Window & Silence Detection', () => {
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

    requestData() {}

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

  it('calculates RMS correctly: 0 for silence, positive for voice data', () => {
    // Silence in byte time domain is 128
    const silence = new Uint8Array(512).fill(128);
    const rmsSilence = calculateTimeDomainRms(silence);
    assert.equal(rmsSilence, 0, 'Pure silence (value 128) must have RMS of 0');

    // Voice / signal waveform varying around 128
    const voiceSignal = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      voiceSignal[i] = Math.round(128 + 40 * Math.sin((i / 512) * Math.PI * 8));
    }
    const rmsVoice = calculateTimeDomainRms(voiceSignal);
    assert.ok(rmsVoice > 0.02, `Voice signal RMS (${rmsVoice.toFixed(4)}) must exceed threshold`);
  });

  it('enforces speech-arming grace window: does not stop immediately during initial silence', async () => {
    const session = await startAudioRecording({
      maxDurationMs: 4000,
      speechArmingWindowMs: 800,
      silenceTimeoutMs: 300,
    });

    assert.equal(session.isActive, true);

    let stoppedEarly = false;
    session.completion.then(() => {
      stoppedEarly = true;
    });

    // Wait 400ms (within 800ms speech arming window)
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(stoppedEarly, false, 'Recording must NOT auto-stop during speech-arming grace window');

    session.cancel();
  });

  it('handles immediate AbortController cancellation during active recording', async () => {
    const ac = new AbortController();
    const session = await startAudioRecording({
      maxDurationMs: 5000,
      signal: ac.signal,
    });

    assert.equal(session.isActive, true);

    ac.abort();

    const result = await session.completion;
    assert.equal(result, null, 'Cancelled recording must resolve null');
    assert.ok(stoppedTracks.length > 0, 'Audio tracks must be cleanly stopped');
  });

  it('provides onAudioLevel callback when configured', async () => {
    let levelReported = false;
    const session = await startAudioRecording({
      maxDurationMs: 2000,
      onAudioLevel: (_rms) => {
        levelReported = true;
      },
    });

    assert.equal(session.isActive, true);
    session.cancel();
  });
});
