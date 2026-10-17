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

    it('attenuates out-of-band frequencies (anti-alias filter rejection)', () => {
      // 12 kHz tone at 48 kHz sampling rate (above 8 kHz Nyquist of 16 kHz target)
      // Must be attenuated by the 7.2 kHz low-pass filter
      const sampleCount = 4800; // 100ms
      const highFreqInput = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        highFreqInput[i] = Math.sin((2 * Math.PI * 12000 * i) / 48000);
      }

      // 1 kHz tone at 48 kHz sampling rate (well within passband)
      const passbandInput = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        passbandInput[i] = Math.sin((2 * Math.PI * 1000 * i) / 48000);
      }

      const highResampled = downsampleTo16k(highFreqInput, 48000);
      const passResampled = downsampleTo16k(passbandInput, 48000);

      // Compute RMS of both resampled signals
      let highRms = 0;
      for (let i = 0; i < highResampled.length; i++) highRms += highResampled[i] * highResampled[i];
      highRms = Math.sqrt(highRms / highResampled.length);

      let passRms = 0;
      for (let i = 0; i < passResampled.length; i++) passRms += passResampled[i] * passResampled[i];
      passRms = Math.sqrt(passRms / passResampled.length);

      // Anti-aliasing filter must attenuate 12 kHz signal by > 10 dB relative to passband
      const attenuationRatio = highRms / passRms;
      assert.ok(attenuationRatio < 0.35, `Expected high frequency attenuation < 0.35 (-10 dB), got ${attenuationRatio.toFixed(3)}`);
    });

    it('preserves exact output sample length with zero drift over long streaming sessions', () => {
      // Simulate 10 seconds of streaming audio delivered in 100ms chunks (100 chunks)
      const chunkCount = 100;
      const chunkSize48k = 4800; // 100ms at 48kHz
      let totalOutputSamples = 0;

      for (let c = 0; c < chunkCount; c++) {
        const chunk = new Float32Array(chunkSize48k);
        for (let i = 0; i < chunkSize48k; i++) {
          chunk[i] = Math.sin((2 * Math.PI * 440 * (c * chunkSize48k + i)) / 48000);
        }
        const resampled = downsampleTo16k(chunk, 48000);
        totalOutputSamples += resampled.length;
      }

      // Exactly 10.0 seconds at 16,000 Hz must yield 160,000 samples (zero sample drift)
      const expectedTotalSamples = 160000;
      assert.equal(totalOutputSamples, expectedTotalSamples, `Long session sample drift detected: expected ${expectedTotalSamples}, got ${totalOutputSamples}`);
    });
  });

  describe('isVoiceStreamingSupported', () => {
    it('returns false in non-browser Node.js environment', () => {
      assert.equal(isVoiceStreamingSupported(), false);
    });
  });
});
