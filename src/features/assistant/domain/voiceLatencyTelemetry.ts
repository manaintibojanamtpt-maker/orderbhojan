/**
 * Voice Latency Telemetry Ring Buffer
 *
 * Captures high-resolution timing marks (via performance.now()) across all
 * pipeline stages of the OrderBhojan Real-Time Voice Commerce Engine:
 *
 * 1. mic_tap_to_ready_ms / t_mic_ready_ms: Mic toggle/auto-arm to recorder active (< 300ms)
 * 2. mic_ready_to_first_speech_ms: Time between mic arm and user starting speech
 * 3. utterance_capture_ms / t_utterance_capture_ms: Speech start to speech end detection
 * 4. end_of_speech_to_final_transcript_ms: Speech finish to final transcript event
 * 5. transcription_network_ms / t_stt_upload_and_saaras_ms: STT processing latency (on-device or gateway)
 * 6. assistant_request_ms: Intent resolution & conversation engine processing
 * 7. menu_grounding_ms / t_intent_and_grounding_ms: Context grounding against active restaurant menu
 * 8. cart_validation_ms / t_cart_commit_and_ui_ms: Cart plan validation and React state commit
 * 9. time_to_first_reply_text_ms: Speech end to first assistant reply text rendered
 * 10. time_to_first_audio_ms / t_tts_first_audio_ms: Speech end to first audio sample played (< 1.5s p50)
 * 11. tts_total_playback_ms: Duration of complete spoken audio response
 * 12. user_speech_end_to_first_response_ms / t_post_speech_to_cart_ms: User finishing speech to visible reply/cart
 * 13. user_speech_end_to_checkout_ready_ms / t_e2e_checkout_ready_ms: Overall turn completion
 * 14. full_turn_duration_ms: Total elapsed time from tap to completion
 *
 * Maintains a circular ring buffer of 50 samples and calculates p50, p90, p95 percentiles.
 */

export type VoiceSttProviderName = 'native_android' | 'saaras_v4' | 'streaming_ws' | 'web_speech';

export interface VoiceTurnTimingSample {
  readonly turnId: string;
  readonly timestamp: number;

  // Granular stage measurements (performance.now() based)
  readonly mic_tap_to_ready_ms?: number;
  readonly mic_ready_to_first_speech_ms?: number;
  readonly utterance_capture_ms?: number;
  readonly end_of_speech_to_final_transcript_ms?: number;
  readonly transcription_network_ms?: number;
  readonly assistant_request_ms?: number;
  readonly menu_grounding_ms?: number;
  readonly cart_validation_ms?: number;
  readonly time_to_first_reply_text_ms?: number;
  readonly time_to_first_audio_ms?: number;
  readonly tts_total_playback_ms?: number;
  readonly user_speech_end_to_first_response_ms?: number;
  readonly user_speech_end_to_checkout_ready_ms?: number;
  readonly full_turn_duration_ms?: number;

  // Metadata
  readonly provider?: VoiceSttProviderName;
  readonly language?: string;
  readonly success?: boolean;

  // Aliases for backwards compatibility with existing test suites
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
  | 'mic_tap_to_ready_ms'
  | 'mic_ready_to_first_speech_ms'
  | 'utterance_capture_ms'
  | 'end_of_speech_to_final_transcript_ms'
  | 'transcription_network_ms'
  | 'assistant_request_ms'
  | 'menu_grounding_ms'
  | 'cart_validation_ms'
  | 'time_to_first_reply_text_ms'
  | 'time_to_first_audio_ms'
  | 'tts_total_playback_ms'
  | 'user_speech_end_to_first_response_ms'
  | 'user_speech_end_to_checkout_ready_ms'
  | 'full_turn_duration_ms'
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

  // Populate backward compatibility aliases if not explicitly given
  const normalized: VoiceTurnTimingSample = {
    ...sample,
    t_mic_ready_ms: sample.t_mic_ready_ms ?? sample.mic_tap_to_ready_ms,
    t_utterance_capture_ms: sample.t_utterance_capture_ms ?? sample.utterance_capture_ms,
    t_stt_upload_and_saaras_ms: sample.t_stt_upload_and_saaras_ms ?? sample.transcription_network_ms,
    t_intent_and_grounding_ms: sample.t_intent_and_grounding_ms ?? sample.menu_grounding_ms,
    t_cart_commit_and_ui_ms: sample.t_cart_commit_and_ui_ms ?? sample.cart_validation_ms,
    t_tts_first_audio_ms: sample.t_tts_first_audio_ms ?? sample.time_to_first_audio_ms,
    t_post_speech_to_cart_ms: sample.t_post_speech_to_cart_ms ?? sample.user_speech_end_to_first_response_ms,
    t_e2e_checkout_ready_ms: sample.t_e2e_checkout_ready_ms ?? sample.user_speech_end_to_checkout_ready_ms,
  };

  ringBuffer.push(Object.freeze(normalized));
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
 * Get comprehensive latency telemetry report across all core metrics.
 */
export function getFullVoiceLatencyReport(): Record<LatencyStageName, MetricPercentiles> {
  const stages: LatencyStageName[] = [
    'mic_tap_to_ready_ms',
    'mic_ready_to_first_speech_ms',
    'utterance_capture_ms',
    'end_of_speech_to_final_transcript_ms',
    'transcription_network_ms',
    'assistant_request_ms',
    'menu_grounding_ms',
    'cart_validation_ms',
    'time_to_first_reply_text_ms',
    'time_to_first_audio_ms',
    'tts_total_playback_ms',
    'user_speech_end_to_first_response_ms',
    'user_speech_end_to_checkout_ready_ms',
    'full_turn_duration_ms',
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
 * Returns all raw samples currently in the ring buffer.
 */
export function getRawVoiceLatencySamples(): readonly VoiceTurnTimingSample[] {
  return ringBuffer;
}

/**
 * Clears the telemetry ring buffer (for tests and clean session start).
 */
export function resetVoiceLatencyTelemetry(): void {
  ringBuffer.length = 0;
}
