import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDynamicMenuKeyterms,
  sanitizeKeyterms,
  CORE_ORDERING_VOCABULARY,
} from '../src/features/assistant/domain/buildDynamicMenuKeyterms';
import { transcribeAudioViaGateway } from '../src/features/assistant/infrastructure/voiceSttGatewayClient';
import { AssistantApiError } from '../src/features/assistant/types';
import fs from 'node:fs';
import path from 'node:path';

describe('OrderBhojan Sarvam Saaras v4 STT Integration', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Dynamic Menu Keyterms & Biasing Rules (Saaras v4)', () => {
    it('enforces maximum 50 keyterms and 64 character truncation', () => {
      const veryLongDish = 'Special Hyderabad Dum Biryani With Extra Masala And Chicken Fry Pieces'.repeat(2);
      const manyDishes = Array.from({ length: 60 }, (_, i) => ({ name: `Dish Item ${i}` }));

      const keyterms = buildDynamicMenuKeyterms({
        restaurantName: veryLongDish,
        dishes: manyDishes,
      });

      assert.equal(keyterms.length, 50, 'Must cap strictly at 50 keyterms');
      assert.ok(
        keyterms.every((term) => term.length <= 64),
        'All terms must be <= 64 characters',
      );
      assert.ok(keyterms[0].length <= 64, 'First term must be truncated');
    });

    it('deduplicates case-insensitively and prioritizes active cart dishes', () => {
      const keyterms = buildDynamicMenuKeyterms({
        restaurantName: 'Bawarchi Grand',
        cartItems: [{ name: 'Chicken Biryani' }, { name: 'chicken biryani' }],
        dishes: [{ name: 'CHICKEN BIRYANI' }, { name: 'Paneer Butter Masala' }],
      });

      // 'Chicken Biryani' should only appear once
      const biryaniMatches = keyterms.filter((k) => k.toLowerCase() === 'chicken biryani');
      assert.equal(biryaniMatches.length, 1);
      assert.equal(keyterms[0], 'Bawarchi Grand');
      assert.equal(keyterms[1], 'Chicken Biryani');
    });

    it('includes Indic vocabulary and vernacular ordering verbs (Telugu, Hindi)', () => {
      const keyterms = buildDynamicMenuKeyterms({});
      assert.ok(keyterms.includes('kavali'), 'Should include Telugu verb kavali');
      assert.ok(keyterms.includes('chahiye'), 'Should include Hindi verb chahiye');
      assert.ok(keyterms.includes('parcel'), 'Should include parcel keyword');
      assert.ok(keyterms.includes('Biryani'), 'Should include Biryani');
      assert.ok(keyterms.includes('Masala Dosa'), 'Should include Masala Dosa');
    });
  });

  describe('Voice STT Gateway Client (saaras:v4)', () => {
    it('throws AI_VOICE_EMPTY when audio content is empty', async () => {
      await assert.rejects(
        () => transcribeAudioViaGateway({ audioBase64: '   ' }),
        (err: any) => {
          assert.equal(err.code, 'AI_VOICE_EMPTY');
          return true;
        },
      );
    });

    it('transcribes audio via gateway endpoint with saaras:v4 payload', async () => {
      let capturedRequest: any = null;

      globalThis.fetch = (async (url: string, init: any) => {
        capturedRequest = { url, init, body: JSON.parse(init.body) };
        return new Response(
          JSON.stringify({
            success: true,
            transcript: 'Rendu masala dosa parcel kavali',
            language: 'te-IN',
            confidence: 0.98,
            provider: 'sarvam',
            model: 'saaras:v4',
            requestId: 'req_saaras_test_001',
            timestamps: {
              words: [
                { word: 'Rendu', start_time_seconds: 0.1, end_time_seconds: 0.4 },
                { word: 'masala', start_time_seconds: 0.4, end_time_seconds: 0.8 },
                { word: 'dosa', start_time_seconds: 0.8, end_time_seconds: 1.1 },
                { word: 'parcel', start_time_seconds: 1.1, end_time_seconds: 1.5 },
                { word: 'kavali', start_time_seconds: 1.5, end_time_seconds: 1.9 },
              ],
            },
            keytermsUsedCount: 15,
            latencyMs: 120,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as any;

      const result = await transcribeAudioViaGateway({
        audioBase64: 'dGVzdC1hdWRpby1ieXRlcw==',
        lang: 'unknown',
        keyterms: ['Masala Dosa', 'parcel', 'kavali'],
        restaurantId: 'rest_kalyan_dosa',
      });

      assert.ok(capturedRequest);
      assert.ok(capturedRequest.url.endsWith('/api/voice/transcribe'));
      assert.equal(capturedRequest.body.model, 'saaras:v4');
      assert.equal(capturedRequest.body.lang, 'unknown');
      assert.deepEqual(capturedRequest.body.keyterms, ['Masala Dosa', 'parcel', 'kavali']);
      assert.equal(capturedRequest.body.restaurantId, 'rest_kalyan_dosa');

      assert.equal(result.success, true);
      assert.equal(result.transcript, 'Rendu masala dosa parcel kavali');
      assert.equal(result.language, 'te-IN');
      assert.equal(result.confidence, 0.98);
      assert.equal(result.model, 'saaras:v4');
      assert.equal(result.requestId, 'req_saaras_test_001');
      assert.ok(result.timestamps?.words?.length === 5);
    });

    it('falls back to /api/voice/stt when /api/voice/transcribe returns 404', async () => {
      const urlsCalled: string[] = [];

      globalThis.fetch = (async (url: string) => {
        urlsCalled.push(url);
        if (url.endsWith('/transcribe')) {
          return new Response('Not Found', { status: 404 });
        }
        return new Response(
          JSON.stringify({
            success: true,
            transcript: 'Masala Dosa',
            language: 'te-IN',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as any;

      const result = await transcribeAudioViaGateway({
        audioBase64: 'dGVzdA==',
      });

      assert.equal(urlsCalled.length, 2);
      assert.ok(urlsCalled[0].endsWith('/transcribe'));
      assert.ok(urlsCalled[1].endsWith('/stt'));
      assert.equal(result.transcript, 'Masala Dosa');
    });

    it('retries with exponential backoff on 429 rate limit', async () => {
      let attempts = 0;

      globalThis.fetch = (async () => {
        attempts++;
        if (attempts < 2) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 });
        }
        return new Response(
          JSON.stringify({
            success: true,
            transcript: 'Chicken Dum Biryani',
            language: 'en-IN',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as any;

      const result = await transcribeAudioViaGateway({
        audioBase64: 'dGVzdA==',
      });

      assert.equal(attempts, 2, 'Should have retried once after 429');
      assert.equal(result.transcript, 'Chicken Dum Biryani');
    });
  });

  describe('Security & Non-Exposure of SARVAM_API_KEY in Customer Bundle', () => {
    it('verifies SARVAM_API_KEY is never imported or bundled in client source code', () => {
      const srcDir = path.resolve(process.cwd(), 'src');
      const files = fs.readdirSync(srcDir, { recursive: true }) as string[];
      const codeFiles = files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));

      for (const relPath of codeFiles) {
        const fullPath = path.join(srcDir, relPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(
          !content.includes('SARVAM_API_KEY'),
          `Client file ${relPath} must never reference SARVAM_API_KEY directly`,
        );
      }
    });
  });
});
