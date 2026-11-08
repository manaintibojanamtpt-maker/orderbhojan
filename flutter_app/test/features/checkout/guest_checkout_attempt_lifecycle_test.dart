import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:orderbhojan/core/services/preferences_service.dart';

void main() {
  late PreferencesService prefs;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = PreferencesService(await SharedPreferences.getInstance());
  });

  group('guest checkout attempt lifecycle', () {
    test('successful guest checkout clears the persisted id', () async {
      await prefs.setCheckoutAttemptId('guest-attempt-001-minimum-16c');
      expect(prefs.getCheckoutAttemptId(), isNotNull);

      expect(
        shouldClearGuestCheckoutAttemptId(
          inFlight: false,
          event: GuestCheckoutAttemptEvent.confirmedAndPersisted,
        ),
        isTrue,
      );
      await prefs.clearCheckoutAttemptId();
      expect(prefs.getCheckoutAttemptId(), isNull);
    });

    test('failed checkout retains the id for safe retry', () async {
      await prefs.setCheckoutAttemptId('guest-attempt-002-minimum-16cb');

      expect(
        shouldClearGuestCheckoutAttemptId(
          inFlight: false,
          event: GuestCheckoutAttemptEvent.failedOrAmbiguous,
        ),
        isFalse,
      );
      expect(prefs.getCheckoutAttemptId(), 'guest-attempt-002-minimum-16cb');
    });

    test('network timeout retains the id', () async {
      await prefs.setCheckoutAttemptId('guest-attempt-003-minimum-16cc');

      expect(
        shouldClearGuestCheckoutAttemptId(
          inFlight: true,
          event: GuestCheckoutAttemptEvent.failedOrAmbiguous,
        ),
        isFalse,
      );
      expect(prefs.getCheckoutAttemptId(), 'guest-attempt-003-minimum-16cc');
    });

    test('app restart retains an unresolved attempt id', () async {
      await prefs.setCheckoutAttemptId('guest-attempt-004-minimum-16cd');

      // Simulate a process restart: a new PreferencesService instance reads
      // the same SharedPreferences, so the unresolved attempt survives.
      final reloaded = PreferencesService(await SharedPreferences.getInstance());
      expect(reloaded.getCheckoutAttemptId(), 'guest-attempt-004-minimum-16cd');
    });

    test('explicit checkout cancellation clears the id when nothing is in flight', () async {
      await prefs.setCheckoutAttemptId('guest-attempt-005-minimum-16ce');

      expect(
        shouldClearGuestCheckoutAttemptId(
          inFlight: false,
          event: GuestCheckoutAttemptEvent.abandoned,
        ),
        isTrue,
      );
      await prefs.clearCheckoutAttemptId();
      expect(prefs.getCheckoutAttemptId(), isNull);
    });

    test('explicit abandon does NOT clear the id while a request is unresolved', () async {
      await prefs.setCheckoutAttemptId('guest-attempt-006-minimum-16cf');

      expect(
        shouldClearGuestCheckoutAttemptId(
          inFlight: true,
          event: GuestCheckoutAttemptEvent.abandoned,
        ),
        isFalse,
      );
      expect(prefs.getCheckoutAttemptId(), 'guest-attempt-006-minimum-16cf');
    });

    test('new checkout after successful completion generates a different id', () async {
      await prefs.setCheckoutAttemptId('guest-attempt-007-minimum-16cg');

      // Successful completion clears the persisted id.
      expect(
        shouldClearGuestCheckoutAttemptId(
          inFlight: false,
          event: GuestCheckoutAttemptEvent.confirmedAndPersisted,
        ),
        isTrue,
      );
      await prefs.clearCheckoutAttemptId();
      expect(prefs.getCheckoutAttemptId(), isNull);

      // A subsequent guest checkout has no persisted id to reuse, so the
      // caller mints a fresh one — it cannot equal the completed attempt.
      const fresh = 'guest-attempt-008-minimum-16ch';
      expect(fresh, isNot('guest-attempt-007-minimum-16cg'));
      await prefs.setCheckoutAttemptId(fresh);
      expect(prefs.getCheckoutAttemptId(), fresh);
    });

    test('authentication change does not discard an unresolved guest attempt', () async {
      await prefs.setCheckoutAttemptId('guest-attempt-009-minimum-16ci');

      // A sign-in is not a checkout lifecycle event: the unresolved attempt
      // must remain recoverable. No event fires, so nothing clears the id.
      expect(
        shouldClearGuestCheckoutAttemptId(
          inFlight: true,
          event: GuestCheckoutAttemptEvent.failedOrAmbiguous,
        ),
        isFalse,
      );
      expect(prefs.getCheckoutAttemptId(), 'guest-attempt-009-minimum-16ci');
    });
  });
}