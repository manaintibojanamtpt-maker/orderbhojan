import 'package:flutter_test/flutter_test.dart';
import 'package:orderbhojan/core/services/preferences_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late PreferencesService preferencesService;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    preferencesService = PreferencesService(prefs);
  });

  group('PreferencesService Tests', () {
    test('default active address is empty before selection', () {
      expect(preferencesService.getActiveAddress(), '');
    });

    test('setActiveAddress updates address', () async {
      await preferencesService.setActiveAddress('North Main Road, Koregaon Park, Pune');
      expect(preferencesService.getActiveAddress(),
          'North Main Road, Koregaon Park, Pune');
    });

    test('default saved addresses list is empty initially', () {
      final list = preferencesService.getSavedAddresses();
      expect(list.isEmpty, true);
    });

    test('addSavedAddress adds new address at top', () async {
      await preferencesService.addSavedAddress({
        'tag': 'Home',
        'title': 'Flat 402, Ganga Satellite',
        'address': 'North Main Road, Koregaon Park, Pune',
        'eta': '25 mins',
      });
      final list = preferencesService.getSavedAddresses();
      expect(list.isNotEmpty, true);
      expect(list.first['tag'], 'Home');
      expect(list.first['address'], 'North Main Road, Koregaon Park, Pune');
    });

    test('pure veg preference toggles correctly', () async {
      expect(preferencesService.isPureVeg(), false);
      await preferencesService.setPureVeg(true);
      expect(preferencesService.isPureVeg(), true);
    });

    test('language preference updates correctly', () async {
      expect(preferencesService.getLanguage(), 'English');
      await preferencesService.setLanguage('Telugu');
      expect(preferencesService.getLanguage(), 'Telugu');
    });

    test('favorite kitchens toggle correctly', () async {
      expect(preferencesService.isKitchenFavorite('k1'), false);
      final added = await preferencesService.toggleFavoriteKitchen('k1');
      expect(added, true);
      expect(preferencesService.isKitchenFavorite('k1'), true);

      final removed = await preferencesService.toggleFavoriteKitchen('k1');
      expect(removed, false);
      expect(preferencesService.isKitchenFavorite('k1'), false);
    });

    test('favorite dishes toggle correctly', () async {
      expect(preferencesService.isDishFavorite('d1'), false);
      final added = await preferencesService.toggleFavoriteDish('d1');
      expect(added, true);
      expect(preferencesService.isDishFavorite('d1'), true);

      final removed = await preferencesService.toggleFavoriteDish('d1');
      expect(removed, false);
      expect(preferencesService.isDishFavorite('d1'), false);
    });
  });
}
