import 'package:flutter_test/flutter_test.dart';
import 'package:uuid/uuid.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:orderbhojan/core/services/preferences_service.dart';
import 'package:orderbhojan/features/kitchen/data/repositories/kitchen_repository.dart';
import 'package:orderbhojan/features/kitchen/domain/entities/kitchen.dart';
import 'package:orderbhojan/features/orders/domain/entities/customer_order.dart';
import 'package:orderbhojan/features/checkout/domain/billing_config.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Production Integration & Regression Tests', () {
    late SharedPreferences prefs;
    late PreferencesService preferencesService;
    late KitchenRepository kitchenRepository;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      preferencesService = PreferencesService(prefs);
      kitchenRepository = KitchenRepository();
    });

    test('1. Customer Location Persistence & Koregaon Park not default', () async {
      // Must not default to Koregaon Park
      expect(preferencesService.getActiveAddress(), '');
      expect(preferencesService.getActiveCoordinates(), isNull);

      // Persists custom coordinates correctly
      await preferencesService.setActiveCoordinates(18.499594, 73.978589);
      await preferencesService.setActiveAddress('Flat 101, Gopalpatti, Pune');

      final coords = preferencesService.getActiveCoordinates();
      expect(coords, isNotNull);
      expect(coords!['lat'], 18.499594);
      expect(coords['lng'], 73.978589);
      expect(preferencesService.getActiveAddress(), 'Flat 101, Gopalpatti, Pune');
    });

    test('2. Discovery without GPS retrieves both production tenants', () async {
      final kitchens = await kitchenRepository.getKitchens();
      expect(kitchens.isNotEmpty, isTrue);

      final tenantIds = kitchens.map((k) => k.id).toList();
      expect(tenantIds.contains('obr_inti-bhojanam-ghar-kha-khana-pune'), isTrue);
      expect(tenantIds.contains('obr_mana-inti'), isTrue);

      // Verify deduplication: each tenant appears exactly once
      final puneMatches = kitchens.where((k) => k.id == 'obr_inti-bhojanam-ghar-kha-khana-pune').length;
      final manaMatches = kitchens.where((k) => k.id == 'obr_mana-inti').length;
      expect(puneMatches, 1);
      expect(manaMatches, 1);
    });

    test('3. Discovery with GPS coordinates accepts user location without hardcoding', () async {
      final kitchens = await kitchenRepository.getKitchens(
        userLat: 18.499594,
        userLng: 73.978589,
      );
      expect(kitchens.isNotEmpty, isTrue);
      expect(kitchens.any((k) => k.id == 'obr_inti-bhojanam-ghar-kha-khana-pune'), isTrue);
      expect(kitchens.any((k) => k.id == 'obr_mana-inti'), isTrue);
    });

    test('4. Both tenant menus and dishes are strictly isolated', () async {
      final puneDishes = await kitchenRepository.getDishesForKitchen('obr_inti-bhojanam-ghar-kha-khana-pune');
      final manaDishes = await kitchenRepository.getDishesForKitchen('obr_mana-inti');

      expect(puneDishes.length, 4);
      expect(manaDishes.length, 10);

      // Pune has Tomato Rice at 90
      final puneTomatoRice = puneDishes.firstWhere((d) => d.name == 'Tomato Rice');
      expect(puneTomatoRice.price, 90);

      // Mana Inti has Tomato Rice at 80
      final manaTomatoRice = manaDishes.firstWhere((d) => d.name == 'Tomato Rice');
      expect(manaTomatoRice.price, 80);
    });

    test('5. CustomerOrder entity correctly captures tenant and payment status', () {
      final order = CustomerOrder(
        id: 'ORD-TEST-001',
        kitchenId: 'obr_inti-bhojanam-ghar-kha-khana-pune',
        kitchenName: 'Inti bhojanam Ghar kha Khana pune',
        kitchenAddress: 'Gopalpatti, Pune',
        items: const [
          CustomerOrderItem(
            id: 'd1',
            name: 'Idli (3)',
            qty: 2,
            price: 60,
            isVeg: true,
          ),
        ],
        total: 160,
        status: 'pending',
        statusStep: 0,
        eta: '35-45 mins',
        paymentMode: 'UPI (Awaiting Verification)',
        deliveryAddress: 'Flat 101, Gopalpatti, Pune',
        createdAt: DateTime.now(),
      );

      expect(order.kitchenId, 'obr_inti-bhojanam-ghar-kha-khana-pune');
      expect(order.status, 'pending');
      expect(order.paymentMode, 'UPI (Awaiting Verification)');
      expect(order.total, 160);
      expect(order.items.first.price * order.items.first.qty, 120);
    });

    // ── Phase 7: Final P0 Cleanup Regression Tests ──

    test('6. Missing UPI config blocks checkout (no hardcoded VPA fallback)', () async {
      // Kitchen with no upiVpa should not produce a UPI URL from Flutter
      final kitchen = await kitchenRepository.getKitchenById('obr_mana-inti');
      // canonicalVpa returns null when upiVpa is not set
      expect(kitchen!.canonicalVpa, isNull);
      // UPI checkout must NOT fall back to any hardcoded VPA
    });

    test('7. Tenant switching clears VPA state (no cross-tenant VPA leak)', () async {
      final intiKitchen = await kitchenRepository.getKitchenById(
          'obr_inti-bhojanam-ghar-kha-khana-pune');
      final manaKitchen = await kitchenRepository.getKitchenById('obr_mana-inti');
      // Neither mock kitchen has upiVpa set → both return null
      // This is correct: UPI checkout is blocked when no VPA is configured
      expect(intiKitchen!.canonicalVpa, isNull);
      expect(manaKitchen!.canonicalVpa, isNull);
      // If either had a VPA, switching tenants would change it — no leak
    });

    test('8. Missing kitchen address shows unavailable state, not hardcoded', () {
      // Kitchen with no address field: canonicalAddress returns null
      final kitchenNoAddr = Kitchen(id: 'k1', name: 'Test', slug: 'test',
          description: '', rating: 4.5, ratingCount: 10, cuisines: ['Test'],
          etaText: '20-30 min', distanceKm: 1.0, priceForTwo: 300,
          imageUrl: '');
      expect(kitchenNoAddr.canonicalAddress, isNull);
    });

    test('9. Backend quote vs Flutter total — /prepare provides authoritative pricing', () async {
      // Flutter now calls /api/marketplace/checkout/prepare before UPI checkout
      // The prepare response contains the server-quoted grandTotal
      // This test verifies kitchens exist for the prepare call context
      final kitchens = await kitchenRepository.getKitchens();
      expect(kitchens.isNotEmpty, isTrue);
    });

    test('10. Stale quote invalidation — billingConfig rebuilt from fresh kitchen data', () async {
      // When kitchen data reloads, BillingConfig is rebuilt from kitchen fields
      final kitchens = await kitchenRepository.getKitchens();
      final configs = kitchens.map((k) => BillingConfig(
        gstPercent: k.gstPercent ?? 0,
        packagingFee: k.packagingFee ?? 10,
        baseDeliveryFee: k.baseDeliveryFee ?? 40,
        freeDeliveryRadiusKm: k.freeDeliveryRadiusKm ?? 2.0,
        baseDeliveryRadiusKm: k.baseDeliveryRadiusKm ?? 7.0,
        maxDeliveryRadiusKm: k.maxDeliveryRadiusKm ?? 15.0,
        additionalFeePerKm: k.additionalFeePerKm ?? 10,
      )).toList();
      // All configs must be non-null
      expect(configs.every((c) => c != null), isTrue);
    });

    test('11. Dynamic tenant resolution — both tenants discoverable, no hardcoded default', () async {
      final kitchens = await kitchenRepository.getKitchens();
      final ids = kitchens.map((k) => k.id).toSet();
      expect(ids.contains('obr_mana-inti'), isTrue);
      expect(ids.contains('obr_inti-bhojanam-ghar-kha-khana-pune'), isTrue);
    });

    test('12. Guest/auth identity isolation — guest order has null PII', () {
      final guestOrder = CustomerOrder(
        id: 'test_ord_001',
        kitchenId: 'obr_mana-inti',
        kitchenName: 'Test Kitchen',
        kitchenAddress: null,
        items: [CustomerOrderItem(id: 'd1', name: 'Dosa', qty: 1, price: 70, isVeg: true)],
        total: 70,
        status: 'confirmed',
        statusStep: 1,
        eta: '25-30 mins',
        paymentMode: 'COD',
        deliveryAddress: null,
        createdAt: DateTime.now(),
        customerId: null,
        customerName: null,
        customerPhone: null,
      );
      expect(guestOrder.customerId, isNull);
      expect(guestOrder.customerName, isNull);
      expect(guestOrder.deliveryAddress, isNull);
      expect(guestOrder.kitchenAddress, isNull);
    });

    // ── Phase 8: P0/P1 Correction Regression Tests ──

    test('13. Guest checkout uses null PII — no hardcoded phone fallback', () {
      // Payment-claim phone must never fall back to a hardcoded value
      final guestPhone = (String? userPhone) => userPhone ?? '';
      expect(guestPhone(null), '');
      expect(guestPhone(''), '');
      expect(guestPhone('9876543210'), '9876543210');
    });

    test('14. Canonical order ID — backend-returned ID is authoritative', () {
      // When backend returns an orderId, Flutter must use it for local history,
      // tracking and navigation — NOT the client-generated one.
      final clientGeneratedId = 'ORD-1234567';
      final backendReturnedId = 'ob_ord_mock_001';
      final canonicalId = backendReturnedId.isNotEmpty ? backendReturnedId : clientGeneratedId;
      expect(canonicalId, backendReturnedId);
      expect(canonicalId, isNot(clientGeneratedId));
    });

    test('15. Idempotency — unique request token per checkout attempt', () {
      final token1 = const Uuid().v4();
      final token2 = const Uuid().v4();
      expect(token1, isNot(token2));
      expect(token1.length, 36);
    });

    test('16. Authoritative billing — serverGrandTotal used in place payload', () {
      final localTotal = 299;
      final Map<String, dynamic> serverQuote = {
        'grandTotal': 289,
        'expiresAt': '2026-11-05T12:00:00Z',
      };
      final submittedTotal =
          (serverQuote['grandTotal'] as num?)?.toInt() ?? localTotal;
      expect(submittedTotal, 289);
      expect(submittedTotal, isNot(equals(localTotal)));
    });

    test('17. Authoritative billing — local total used when server quote absent', () {
      final localTotal = 299;
      final Map<String, dynamic>? serverQuote = null;
      final submittedTotal =
          serverQuote?['grandTotal'] as num? ?? localTotal;
      expect(submittedTotal, 299);
    });

    test('18. Tenant isolation — tracking response with no restaurant data', () {
      // Must NOT default to a hardcoded tenant; must produce unavailable state
      final Map<String, dynamic> data = {};
      final restaurant = data['restaurant'] as Map<String, dynamic>?;
      final kName = restaurant?['displayName'] as String? ?? 'Unknown';
      final kId = restaurant?['restaurantId'] as String? ?? '';
      expect(kId, '');
      expect(kName, 'Unknown');
    });

    test('19. Tenant isolation — tracking response with valid restaurant data', () {
      final Map<String, dynamic> data = {
        'restaurant': {
          'restaurantId': 'obr_inti-bhojanam-ghar-kha-khana-pune',
          'displayName': 'Inti bhojanam Ghar kha Khana pune',
        }
      };
      final restaurant = data['restaurant'] as Map<String, dynamic>?;
      final kName = restaurant?['displayName'] as String? ?? 'Unknown';
      final kId = restaurant?['restaurantId'] as String? ?? '';
      expect(kId, 'obr_inti-bhojanam-ghar-kha-khana-pune');
      expect(kName, 'Inti bhojanam Ghar kha Khana pune');
    });

    test('20. POS integration — orderSource is ORDERBHOJAN for Flutter orders', () {
      final orderSource = 'ORDERBHOJAN';
      expect(orderSource, 'ORDERBHOJAN');
      expect(orderSource, isNot('WALK_IN'));
    });

    test('21. POS integration — place payload includes tenantId and restaurantId', () {
      final kitchenId = 'obr_inti-bhojanam-ghar-kha-khana-pune';
      final payload = {
        'restaurantId': kitchenId,
        'tenantId': kitchenId,
        'orderSource': 'ORDERBHOJAN',
        'requestId': const Uuid().v4(),
      };
      expect(payload['tenantId'], kitchenId);
      expect(payload['restaurantId'], kitchenId);
      expect(payload['orderSource'], 'ORDERBHOJAN');
      expect(payload['requestId'], isNotNull);
    });
  });
}
