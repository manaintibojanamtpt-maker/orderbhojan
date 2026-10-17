import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  downsampleTo16k,
  isVoiceStreamingSupported,
  shouldTriggerBargeIn,
  updateAdaptiveNoiseFloor,
} from '../src/features/assistant/infrastructure/realtimeVoiceClient';

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

    it('maintains high passband quality (< 1.5 dB attenuation)', () => {
      // Test tones at 500Hz, 1kHz, 2kHz, and 3.5kHz at 48kHz input
      // Butterworth maximally flat response guarantees < 1.5 dB attenuation (ratio > 0.841)
      const freqs = [500, 1000, 2000, 3500];
      const sampleCount = 4800; // 100ms
      for (const freq of freqs) {
        const input = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
          input[i] = Math.sin((2 * Math.PI * freq * i) / 48000);
        }
        const resampled = downsampleTo16k(input, 48000);
        // Exclude initial filter transient
        const steady = resampled.slice(200);
        let sumSq = 0;
        for (let i = 0; i < steady.length; i++) sumSq += steady[i] * steady[i];
        const rms = Math.sqrt(sumSq / steady.length);
        const expectedRms = 1 / Math.SQRT2; // RMS of unit sine wave is ~0.7071
        const ratio = rms / expectedRms;
        const attenuationDb = -20 * Math.log10(ratio);
        assert.ok(
          attenuationDb < 1.5,
          `Expected ${freq}Hz passband attenuation < 1.5 dB, got ${attenuationDb.toFixed(2)} dB (ratio ${ratio.toFixed(3)})`,
        );
      }
    });

    it('achieves steep stopband rejection (> 24 dB) via 4th-order Butterworth filter', () => {
      // 14 kHz and 16 kHz tones at 48 kHz sampling rate
      // 4th order filter (24 dB/octave) guarantees > 24 dB rejection (ratio < 0.063)
      const sampleCount = 4800;
      const testFreqs = [14000, 16000];
      for (const freq of testFreqs) {
        const highFreqInput = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
          highFreqInput[i] = Math.sin((2 * Math.PI * freq * i) / 48000);
        }

        const resampled = downsampleTo16k(highFreqInput, 48000);
        const steady = resampled.slice(200);
        let sumSq = 0;
        for (let i = 0; i < steady.length; i++) sumSq += steady[i] * steady[i];
        const rms = Math.sqrt(sumSq / steady.length);
        const expectedRms = 1 / Math.SQRT2;
        const ratio = rms / expectedRms;
        const attenuationDb = -20 * Math.log10(ratio);
        assert.ok(
          attenuationDb > 24,
          `Expected ${freq}Hz stopband rejection > 24 dB, got ${attenuationDb.toFixed(2)} dB (ratio ${ratio.toFixed(4)})`,
        );
      }
    });

    it('resamples correctly across irregular transport chunk boundaries without distortion or drift', () => {
      const irregularChunkSizes = [128, 256, 512, 1024, 768, 2048, 384, 4096];
      let totalInputSamples = 0;
      let totalOutputSamples = 0;

      for (const size of irregularChunkSizes) {
        const chunk = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          chunk[i] = Math.sin((2 * Math.PI * 1000 * (totalInputSamples + i)) / 48000);
        }
        totalInputSamples += size;
        const resampled = downsampleTo16k(chunk, 48000);
        totalOutputSamples += resampled.length;

        // Verify no NaNs or Infinities
        for (let i = 0; i < resampled.length; i++) {
          assert.ok(Number.isFinite(resampled[i]), `Resampled sample ${i} is not finite`);
          assert.ok(Math.abs(resampled[i]) <= 1.2, `Resampled sample ${i} exceeds amplitude bounds`);
        }
      }

      const expectedOutput = Math.round(totalInputSamples / 3);
      assert.ok(
        Math.abs(totalOutputSamples - expectedOutput) <= 1,
        `Expected ~${expectedOutput} samples from ${totalInputSamples} input samples, got ${totalOutputSamples}`,
      );
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

  describe('barge-in and acoustic echo rejection', () => {
    it('freezes adaptive noise floor during active assistant speech to avoid speaker echo contamination', () => {
      const initialFloor = 0.005;
      const speakerAcousticEchoRms = 0.022; // Loud playback sound picked up by microphone

      // During active speech (isSpeaking: true), noise floor must NOT be corrupted by playback audio
      const floorDuringPlayback = updateAdaptiveNoiseFloor(initialFloor, speakerAcousticEchoRms, true, false);
      assert.equal(floorDuringPlayback, initialFloor, 'Noise floor must remain frozen during playback');

      // When assistant is silent, ambient room noise is tracked normally
      const ambientRoomRms = 0.008;
      const floorDuringSilence = updateAdaptiveNoiseFloor(initialFloor, ambientRoomRms, false, false);
      assert.ok(floorDuringSilence > initialFloor, 'Noise floor adapts to ambient room noise when silent');
    });

    it('rejects assistant playback echo as user speech and triggers barge-in only on deliberate user speech', () => {
      const noiseFloor = 0.006;

      // 1. When assistant is not speaking, barge-in does not trigger
      assert.equal(shouldTriggerBargeIn(0.04, noiseFloor, false), false);

      // 2. When assistant IS speaking, normal acoustic speaker leakage (e.g. RMS 0.018) is rejected
      const acousticEchoRms = 0.018;
      assert.equal(
        shouldTriggerBargeIn(acousticEchoRms, noiseFloor, true),
        false,
        'Assistant speaker echo must NOT trigger false barge-in',
      );

      // 3. When user speaks clearly into the mic (e.g. RMS 0.045), barge-in triggers immediately
      const deliberateSpeechRms = 0.045;
      assert.equal(
        shouldTriggerBargeIn(deliberateSpeechRms, noiseFloor, true),
        true,
        'Genuine user utterance must trigger instant barge-in',
      );
    });
  });

  describe('isVoiceStreamingSupported', () => {
    it('returns false in non-browser Node.js environment', () => {
      assert.equal(isVoiceStreamingSupported(), false);
    });
  });
});
