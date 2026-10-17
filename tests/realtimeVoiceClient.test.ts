import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downsampleTo16k, isVoiceStreamingSupported } from '../src/features/assistant/infrastructure/realtimeVoiceClient';

describe('RealtimeVoiceClient Infrastructure Tests', () => {
  describe('downsampleTo16k', () => {
    it('returns exact same buffer if already 16,000 Hz', () => {
      const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const res = downsampleTo16k(input, 16000);
      assert.equal(res, input);
    });

    it('accurately downsamples 48kHz audio to 16kHz (3:1 factor)', () => {
      // 4800 samples at 48kHz is 100ms of audio
      // At 16kHz, 100ms should be exactly 1600 samples!
      const sampleCount48k = 4800;
      const input = new Float32Array(sampleCount48k);
      for (let i = 0; i < sampleCount48k; i++) {
        input[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
      }

      const resampled = downsampleTo16k(input, 48000);
      assert.equal(resampled.length, 1600);
      // Verify values remain bounded within [-1, 1]
      for (let i = 0; i < resampled.length; i++) {
        assert.ok(resampled[i] >= -1 && resampled[i] <= 1);
      }
    });

    it('accurately downsamples 44.1kHz audio to 16kHz', () => {
      // 4410 samples at 44.1kHz is 100ms of audio
      // At 16kHz, 100ms should be 1600 samples
      const sampleCount44k = 4410;
      const input = new Float32Array(sampleCount44k);
      for (let i = 0; i < sampleCount44k; i++) {
        input[i] = 0.5;
      }

      const resampled = downsampleTo16k(input, 44100);
      assert.equal(resampled.length, 1600);
      assert.ok(Math.abs(resampled[0] - 0.5) < 0.001);
    });
  });

  describe('isVoiceStreamingSupported', () => {
    it('returns false in non-browser Node.js environment', () => {
      assert.equal(isVoiceStreamingSupported(), false);
    });
  });
});
