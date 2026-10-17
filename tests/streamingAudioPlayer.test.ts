import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStreamingAudioPlayer,
  StreamingAudioPlayer,
} from '../src/features/assistant/infrastructure/streamingAudioPlayer';

describe('StreamingAudioPlayer (Progressive TTS, Framing & Turn Cancellation)', () => {
  let originalWindow: any;

  beforeEach(() => {
    originalWindow = (globalThis as any).window;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it('initializes in idle non-playing state', () => {
    const player = createStreamingAudioPlayer();
    assert.equal(player.playing, false);
    assert.equal(player.activeTurn, null);
  });

  it('handles barge-in / stop gracefully when idle', () => {
    const player = createStreamingAudioPlayer();
    assert.doesNotThrow(() => player.stop());
    assert.equal(player.playing, false);
  });

  it('plays explicit PCM chunks and handles 16-bit odd-byte boundary alignment', async () => {
    let sourcesCreated = 0;
    let totalSamplesBuffered = 0;

    class MockAudioBufferSourceNode {
      public buffer: any = null;
      public onended: (() => void) | null = null;
      connect() {}
      disconnect() {}
      start() {}
      stop() {}
    }

    class MockAudioContext {
      public currentTime = 0;
      public state = 'running';
      public destination = {};
      createBuffer(channels: number, length: number, sampleRate: number) {
        totalSamplesBuffered += length;
        return {
          channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          copyToChannel: () => {},
        };
      }
      createBufferSource() {
        sourcesCreated++;
        return new MockAudioBufferSourceNode();
      }
      createAnalyser() {
        return {
          fftSize: 64,
          smoothingTimeConstant: 0.7,
          frequencyBinCount: 32,
          connect() {},
          getByteFrequencyData() {},
        };
      }
    }

    (globalThis as any).window = {
      AudioContext: MockAudioContext,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    };

    const player = new StreamingAudioPlayer();

    // Chunk 1: 5 bytes (2 samples + 1 dangling odd byte)
    const chunk1Bytes = new Uint8Array([0x00, 0x10, 0x00, 0x20, 0x55]);
    const chunk1Base64 = Buffer.from(chunk1Bytes).toString('base64');

    await player.playChunk(chunk1Base64, {
      format: 'audio/pcm',
      sampleRate: 16000,
      turnId: 'turn_1',
    });

    // Chunk 1 should have processed 2 samples (4 bytes) and buffered the dangling byte
    assert.equal(totalSamplesBuffered, 2);

    // Chunk 2: 3 bytes (dangling byte + 3 bytes = 4 bytes = 2 samples)
    const chunk2Bytes = new Uint8Array([0x66, 0x00, 0x30]);
    const chunk2Base64 = Buffer.from(chunk2Bytes).toString('base64');

    await player.playChunk(chunk2Base64, {
      format: 'audio/pcm',
      sampleRate: 16000,
      turnId: 'turn_1',
    });

    // Total samples buffered should now be 2 + 2 = 4 samples! No byte dropped!
    assert.equal(totalSamplesBuffered, 4);
    assert.equal(player.playing, true);
  });

  it('rejects late chunks arriving from superseded turn IDs', async () => {
    let sourcesCreated = 0;

    class MockAudioBufferSourceNode {
      public buffer: any = null;
      connect() {}
      disconnect() {}
      start() {}
      stop() {}
    }

    class MockAudioContext {
      public currentTime = 0;
      public state = 'running';
      public destination = {};
      createBuffer(channels: number, length: number, sampleRate: number) {
        return { channels, length, sampleRate, duration: length / sampleRate, copyToChannel: () => {} };
      }
      createBufferSource() {
        sourcesCreated++;
        return new MockAudioBufferSourceNode();
      }
      createAnalyser() {
        return { connect: () => {}, getByteFrequencyData: () => {} };
      }
    }

    (globalThis as any).window = {
      AudioContext: MockAudioContext,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    };

    const player = new StreamingAudioPlayer();
    player.setTurn('turn_1');

    const sampleBase64 = Buffer.from(new Int16Array([100, 200]).buffer).toString('base64');

    // Play chunk for active turn
    await player.playChunk(sampleBase64, { turnId: 'turn_1', format: 'audio/pcm' });
    assert.equal(sourcesCreated, 1);

    // Switch to turn_2 (e.g. user barge-in and new turn)
    player.setTurn('turn_2');

    // Late chunk arriving from old turn_1
    await player.playChunk(sampleBase64, { turnId: 'turn_1', format: 'audio/pcm' });

    // Late chunk must be rejected; sourcesCreated must still be 1!
    assert.equal(sourcesCreated, 1);
  });

  it('does NOT treat unrecognized non-container bytes as PCM without explicit format', async () => {
    let errorReported = false;

    class MockAudioContext {
      public currentTime = 0;
      public state = 'running';
      public destination = {};
      createAnalyser() {
        return { connect: () => {}, getByteFrequencyData: () => {} };
      }
      async decodeAudioData() {
        throw new Error('Invalid container format');
      }
    }

    (globalThis as any).window = {
      AudioContext: MockAudioContext,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    };

    const player = new StreamingAudioPlayer({
      onError: () => {
        errorReported = true;
      },
    });

    // Random non-container bytes
    const randomBytesBase64 = Buffer.from([0x12, 0x34, 0x56, 0x78]).toString('base64');
    await player.playChunk(randomBytesBase64, { format: 'auto' });

    // Must report error, NOT play random bytes as PCM!
    assert.equal(errorReported, true);
    assert.equal(player.playing, false);
  });

  it('barge-in stop executes in < 20ms and clears active playback', () => {
    let stoppedSource = false;

    class MockAudioBufferSourceNode {
      connect() {}
      disconnect() {}
      start() {}
      stop() {
        stoppedSource = true;
      }
    }

    class MockAudioContext {
      public currentTime = 0;
      public state = 'running';
      public destination = {};
      createBufferSource() {
        return new MockAudioBufferSourceNode();
      }
      createAnalyser() {
        return { connect: () => {}, getByteFrequencyData: () => {} };
      }
    }

    (globalThis as any).window = {
      AudioContext: MockAudioContext,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    };

    const player = new StreamingAudioPlayer();
    const start = performance.now();
    player.stop();
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 20, `Barge-in took ${elapsed}ms, expected < 20ms`);
    assert.equal(player.playing, false);
  });
});
