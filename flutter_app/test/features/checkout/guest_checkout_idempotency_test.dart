import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:orderbhojan/core/services/preferences_service.dart';

const _attemptKey = 'ob_checkout_attempt_id';

void main() {
  group('guest checkout idempotency', () {
    test('first guest checkout mints and persists an attempt id', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = PreferencesService(await SharedPreferences.getInstance());

      expect(prefs.getCheckoutAttemptId(), isNull);

      const attemptId = 'guest-attempt-001-minimum-16c';
      await prefs.setCheckoutAttemptId(attemptId);

      expect(prefs.getCheckoutAttemptId(), attemptId);
    });

    test('second guest checkout reuses the persisted attempt id', () async {
      const existing = 'guest-attempt-002-minimum-16cb';
      SharedPreferences.setMockInitialValues({_attemptKey: existing});
      final prefs = PreferencesService(await SharedPreferences.getInstance());

      expect(prefs.getCheckoutAttemptId(), existing);
    });

    test('clearCheckoutAttemptId removes the persisted value', () async {
      const attemptId = 'guest-attempt-003-minimum-16cc';
      SharedPreferences.setMockInitialValues({_attemptKey: attemptId});
      final prefs = PreferencesService(await SharedPreferences.getInstance());

      expect(prefs.getCheckoutAttemptId(), attemptId);
      await prefs.clearCheckoutAttemptId();
      expect(prefs.getCheckoutAttemptId(), isNull);
    });

    test('attempt id is stable across prefs reloads', () async {
      const attemptId = 'guest-attempt-004-minimum-16cd';
      SharedPreferences.setMockInitialValues({_attemptKey: attemptId});
      final first = PreferencesService(await SharedPreferences.getInstance());
      final reloaded = PreferencesService(await SharedPreferences.getInstance());

      expect(first.getCheckoutAttemptId(), attemptId);
      expect(reloaded.getCheckoutAttemptId(), attemptId);
    });
  });
}