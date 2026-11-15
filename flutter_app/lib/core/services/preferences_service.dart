import 'dart:async';
import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:shared_preferences/shared_preferences.dart';

class PreferencesService {
  final SharedPreferences _prefs;

  static const String _keyActiveAddress = 'ob_active_address';
  static const String _keyActiveLat = 'ob_active_lat';
  static const String _keyActiveLng = 'ob_active_lng';
  static const String _keySavedAddresses = 'ob_saved_addresses';
  static const String _keyPureVeg = 'ob_pure_veg_filter';
  static const String _keyLanguage = 'ob_app_language';
  static const String _keyFavKitchens = 'ob_fav_kitchens';
  static const String _keyFavDishes = 'ob_fav_dishes';

  PreferencesService(this._prefs);

  // No dummy mock addresses - user starts clean and adds/imports their real address
  static final List<Map<String, String>> defaultAddresses = const [];

  Map<String, double>? getActiveCoordinates() {
    final lat = _prefs.getDouble(_keyActiveLat);
    final lng = _prefs.getDouble(_keyActiveLng);
    if (lat != null && lng != null) {
      return {'lat': lat, 'lng': lng};
    }
    return null;
  }

  Future<void> setActiveCoordinates(double lat, double lng) async {
    await _prefs.setDouble(_keyActiveLat, lat);
    await _prefs.setDouble(_keyActiveLng, lng);
  }

  String getActiveAddress() {
    final active = _prefs.getString(_keyActiveAddress);
    // Purge outdated Bangalore dummy addresses if stored from earlier test sessions
    if (active != null &&
        active.isNotEmpty &&
        !active.contains('Indiranagar') &&
        !active.contains('Bengaluru')) {
      return active;
    }

    final saved = getSavedAddresses();
    if (saved.isNotEmpty) {
      final first = saved.first['address'] ?? '';
      if (first.isNotEmpty) {
        return first;
      }
    }
    return '';
  }

  Future<void> setActiveAddress(String address) async {
    await _prefs.setString(_keyActiveAddress, address);
  }

  List<Map<String, String>> getSavedAddresses() {
    final raw = _prefs.getString(_keySavedAddresses);
    if (raw == null || raw.isEmpty) {
      return [];
    }
    try {
      final decoded = jsonDecode(raw) as List;
      final list = decoded
          .map((e) => Map<String, String>.from(e as Map))
          .where((m) =>
              !(m['address']?.contains('Indiranagar') ?? false) &&
              !(m['address']?.contains('Bengaluru') ?? false))
          .toList();
      return list;
    } catch (_) {
      return [];
    }
  }

  Future<void> saveAddresses(List<Map<String, String>> addresses) async {
    await _prefs.setString(_keySavedAddresses, jsonEncode(addresses));
  }

  Future<void> addSavedAddress(Map<String, String> address) async {
    final list = getSavedAddresses();
    list.insert(0, address);
    await saveAddresses(list);
  }

  /// Imports saved addresses from Firebase across all user devices upon Google/Auth login
  Future<void> syncAddressesFromFirestore({
    required String uid,
    required FirebaseFirestore firestore,
  }) async {
    try {
      final snapshot = await firestore
          .collection('customers')
          .doc(uid)
          .collection('addresses')
          .get();

      if (snapshot.docs.isNotEmpty) {
        final List<Map<String, String>> imported = [];
        String? defaultAddress;

        for (final doc in snapshot.docs) {
          final data = doc.data();
          final tag = data['label'] as String? ?? 'Home';
          final isDef = data['isDefault'] as bool? ?? false;
          String fullAddr = '';

          if (data['address'] is Map) {
            final a = data['address'] as Map<String, dynamic>;
            final parts = [
              a['flat'] ?? a['building'],
              a['street'] ?? a['landmark'],
              a['area'],
              a['city'],
              a['pincode'],
            ].where((p) => p != null && p.toString().trim().isNotEmpty).toList();
            fullAddr = parts.join(', ');
          } else if (data['address'] is String) {
            fullAddr = data['address'] as String;
          }

          if (fullAddr.isNotEmpty &&
              !fullAddr.contains('Indiranagar') &&
              !fullAddr.contains('Bengaluru')) {
            final item = {
              'tag': tag,
              'title': '$tag, ${fullAddr.split(',').first}',
              'address': fullAddr,
              'eta': '25-35 mins',
            };
            imported.add(item);
            if (isDef || defaultAddress == null) {
              defaultAddress = fullAddr;
            }
          }
        }

        if (imported.isNotEmpty) {
          await saveAddresses(imported);
          if (defaultAddress != null) {
            await setActiveAddress(defaultAddress);
          }
        }
      }
    } catch (_) {}
  }

  bool isPureVeg() {
    return _prefs.getBool(_keyPureVeg) ?? false;
  }

  Future<void> setPureVeg(bool val) async {
    await _prefs.setBool(_keyPureVeg, val);
  }

  String getLanguage() {
    return _prefs.getString(_keyLanguage) ?? 'English';
  }

  Future<void> setLanguage(String lang) async {
    await _prefs.setString(_keyLanguage, lang);
  }

  Set<String> getFavoriteKitchens() {
    final list = _prefs.getStringList(_keyFavKitchens) ?? [];
    return list.toSet();
  }

  Future<bool> toggleFavoriteKitchen(String kitchenId) async {
    final favs = getFavoriteKitchens();
    final bool isFavNow;
    if (favs.contains(kitchenId)) {
      favs.remove(kitchenId);
      isFavNow = false;
    } else {
      favs.add(kitchenId);
      isFavNow = true;
    }
    await _prefs.setStringList(_keyFavKitchens, favs.toList());
    return isFavNow;
  }

  bool isKitchenFavorite(String kitchenId) {
    return getFavoriteKitchens().contains(kitchenId);
  }

  Set<String> getFavoriteDishes() {
    final list = _prefs.getStringList(_keyFavDishes) ?? [];
    return list.toSet();
  }

  Future<bool> toggleFavoriteDish(String dishId) async {
    final favs = getFavoriteDishes();
    final bool isFavNow;
    if (favs.contains(dishId)) {
      favs.remove(dishId);
      isFavNow = false;
    } else {
      favs.add(dishId);
      isFavNow = true;
    }
    await _prefs.setStringList(_keyFavDishes, favs.toList());
    return isFavNow;
  }

  bool isDishFavorite(String dishId) {
    return getFavoriteDishes().contains(dishId);
  }

  // ── Guest checkout idempotency ──────────────────────────────────────────
  // A UUID persisted per device so a guest retry of the same checkout
  // (network blip, timeout) hits the backend's atomic CAS and returns the
  // existing order instead of creating a duplicate. Cleared on login.

  static const String keyCheckoutAttemptId = 'ob_checkout_attempt_id';

  String? getCheckoutAttemptId() => _prefs.getString(keyCheckoutAttemptId);

  Future<void> setCheckoutAttemptId(String value) =>
      _prefs.setString(keyCheckoutAttemptId, value);

  Future<void> clearCheckoutAttemptId() =>
      _prefs.remove(keyCheckoutAttemptId);
}

/// Lifecycle events for the persisted guest checkout attempt id.
///
/// The id is a dedup key, not a secret, so the decision to clear it is a pure
/// function of how the checkout request resolved — which keeps it
/// unit-testable without spinning up the checkout widget.
enum GuestCheckoutAttemptEvent {
  /// /checkout/place returned 200 and the canonical order was persisted locally.
  confirmedAndPersisted,

  /// Network error, timeout, non-200 or ambiguous response — retry safely.
  failedOrAmbiguous,

  /// The customer navigated away while the request was unresolved.
  abandoned,
}

/// Whether the persisted guest checkout attempt id should be removed now.
///
/// The id must survive failures and ambiguity so a retry hits the backend's
/// atomic CAS instead of creating a duplicate order. It is cleared only once
/// the order is confirmed and persisted, or — on explicit abandon — only when
/// no checkout request is still unresolved, because an in-flight request may
/// already have created the order on the server.
bool shouldClearGuestCheckoutAttemptId({
  required bool inFlight,
  required GuestCheckoutAttemptEvent event,
}) {
  switch (event) {
    case GuestCheckoutAttemptEvent.confirmedAndPersisted:
      return true;
    case GuestCheckoutAttemptEvent.failedOrAmbiguous:
      return false;
    case GuestCheckoutAttemptEvent.abandoned:
      return !inFlight;
    throw UnsupportedError('unhandled event: $event');
  }
}
