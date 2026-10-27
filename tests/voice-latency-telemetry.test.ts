import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordVoiceLatencySample,
  getStageLatencyStats,
  getFullVoiceLatencyReport,
  resetVoiceLatencyTelemetry,
} from '../src/features/assistant/domain/voiceLatencyTelemetry';

describe('Voice Latency Telemetry Ring Buffer Tests', () => {
  beforeEach(() => {
    resetVoiceLatencyTelemetry();
  });

  it('records samples and calculates percentiles accurately', () => {
    // Record sample turns
    const samples = [
      { turnId: '1', timestamp: 100, t_mic_ready_ms: 120, t_post_speech_to_cart_ms: 2100, t_e2e_checkout_ready_ms: 13500 },
      { turnId: '2', timestamp: 200, t_mic_ready_ms: 150, t_post_speech_to_cart_ms: 2300, t_e2e_checkout_ready_ms: 14200 },
      { turnId: '3', timestamp: 300, t_mic_ready_ms: 110, t_post_speech_to_cart_ms: 1900, t_e2e_checkout_ready_ms: 12800 },
      { turnId: '4', timestamp: 400, t_mic_ready_ms: 130, t_post_speech_to_cart_ms: 2200, t_e2e_checkout_ready_ms: 13900 },
      { turnId: '5', timestamp: 500, t_mic_ready_ms: 140, t_post_speech_to_cart_ms: 2400, t_e2e_checkout_ready_ms: 14800 },
    ];

    for (const s of samples) {
      recordVoiceLatencySample(s);
    }

    const postSpeechStats = getStageLatencyStats('t_post_speech_to_cart_ms');
    assert.equal(postSpeechStats.count, 5);
    assert.equal(postSpeechStats.min, 1900);
    assert.equal(postSpeechStats.max, 2400);
    // Median of [1900, 2100, 2200, 2300, 2400] is 2200
    assert.equal(postSpeechStats.p50, 2200);
    assert.ok(postSpeechStats.p50 < 2500, 'Median post-speech to cart confirmation must be < 2.5s');

    const e2eStats = getStageLatencyStats('t_e2e_checkout_ready_ms');
    assert.equal(e2eStats.count, 5);
    assert.ok(e2eStats.p50 <= 15000, 'Median e2e checkout ready must be approximately 15s');

    const fullReport = getFullVoiceLatencyReport();
    assert.ok(fullReport.t_mic_ready_ms.count === 5);
    assert.ok(fullReport.t_post_speech_to_cart_ms.count === 5);
    assert.ok(fullReport.t_e2e_checkout_ready_ms.count === 5);
  });

  it('bounds buffer to capacity without unbounded memory growth', () => {
    for (let i = 0; i < 75; i++) {
      recordVoiceLatencySample({
        turnId: `turn_${i}`,
        timestamp: Date.now(),
        t_mic_ready_ms: 100 + i,
      });
    }

    const stats = getStageLatencyStats('t_mic_ready_ms');
    assert.equal(stats.count, 50, 'Buffer capacity must be strictly capped at 50 samples');
  });
});
