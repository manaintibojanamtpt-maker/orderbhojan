/**
 * Voice Latency Telemetry Ring Buffer
 *
 * Captures high-resolution timing marks (via performance.now()) across all
 * 7 pipeline stages of the OrderBhojan Voice Commerce Overhaul:
 *
 * 1. t_mic_ready_ms: Mic toggle/auto-arm to recorder active
 * 2. t_utterance_capture_ms: Recording start to end-of-utterance (including VAD silence tail)
 * 3. t_stt_upload_and_saaras_ms: Audio upload + Sarvam Saaras v4 transcription latency
 * 4. t_intent_and_grounding_ms: Intent interpretation + menu matching + cart-plan validation
 * 5. t_cart_commit_and_ui_ms: Cart state mutation to visible React DOM commit
 * 6. t_tts_first_audio_ms: Assistant reply ready to first spoken audio frame
 * 7. t_post_speech_to_cart_ms: User finishing speech to visible cart confirmation (target < 2.5s median)
 * 8. t_e2e_checkout_ready_ms: First utterance start to checkout-ready state (target ~15s)
 *
 * Maintains a circular ring buffer of samples and calculates p50, p90, p95 percentiles.
 */

export interface VoiceTurnTimingSample {
  readonly turnId: string;
  readonly timestamp: number;
  readonly t_mic_ready_ms?: number;
  readonly t_utterance_capture_ms?: number;
  readonly t_stt_upload_and_saaras_ms?: number;
  readonly t_intent_and_grounding_ms?: number;
  readonly t_cart_commit_and_ui_ms?: number;
  readonly t_tts_first_audio_ms?: number;
  readonly t_post_speech_to_cart_ms?: number;
  readonly t_e2e_checkout_ready_ms?: number;
}

export interface MetricPercentiles {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
}

export type LatencyStageName =
  | 't_mic_ready_ms'
  | 't_utterance_capture_ms'
  | 't_stt_upload_and_saaras_ms'
  | 't_intent_and_grounding_ms'
  | 't_cart_commit_and_ui_ms'
  | 't_tts_first_audio_ms'
  | 't_post_speech_to_cart_ms'
  | 't_e2e_checkout_ready_ms';

const BUFFER_CAPACITY = 50;
const ringBuffer: VoiceTurnTimingSample[] = [];

/**
 * Record a completed voice turn's timing sample into the circular ring buffer.
 */
export function recordVoiceLatencySample(sample: VoiceTurnTimingSample): void {
  if (ringBuffer.length >= BUFFER_CAPACITY) {
    ringBuffer.shift();
  }
  ringBuffer.push(Object.freeze({ ...sample }));
}

/**
 * Calculates percentile from a sorted array of numbers.
 */
function calculatePercentile(sorted: readonly number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Number((sorted[lower] * (1 - weight) + sorted[upper] * weight).toFixed(1));
}

/**
 * Computes statistics (count, min, max, mean, p50, p90, p95) for a specific stage.
 */
export function getStageLatencyStats(stage: LatencyStageName): MetricPercentiles {
  const values: number[] = [];
  for (const sample of ringBuffer) {
    const val = sample[stage];
    if (typeof val === 'number' && !Number.isNaN(val) && val >= 0) {
      values.push(val);
    }
  }

  if (values.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      p50: 0,
      p90: 0,
      p95: 0,
    };
  }

  values.sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / values.length).toFixed(1));

  return {
    count: values.length,
    min: Number(values[0].toFixed(1)),
    max: Number(values[values.length - 1].toFixed(1)),
    mean,
    p50: calculatePercentile(values, 50),
    p90: calculatePercentile(values, 90),
    p95: calculatePercentile(values, 95),
  };
}

/**
 * Get comprehensive latency telemetry report across all 8 metrics.
 */
export function getFullVoiceLatencyReport(): Record<LatencyStageName, MetricPercentiles> {
  const stages: LatencyStageName[] = [
    't_mic_ready_ms',
    't_utterance_capture_ms',
    't_stt_upload_and_saaras_ms',
    't_intent_and_grounding_ms',
    't_cart_commit_and_ui_ms',
    't_tts_first_audio_ms',
    't_post_speech_to_cart_ms',
    't_e2e_checkout_ready_ms',
  ];

  const report: Partial<Record<LatencyStageName, MetricPercentiles>> = {};
  for (const stage of stages) {
    report[stage] = getStageLatencyStats(stage);
  }
  return report as Record<LatencyStageName, MetricPercentiles>;
}

/**
 * Clears the telemetry ring buffer (for tests and clean session start).
 */
export function resetVoiceLatencyTelemetry(): void {
  ringBuffer.length = 0;
}
