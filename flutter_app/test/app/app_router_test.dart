import 'package:flutter_test/flutter_test.dart';
import 'package:orderbhojan/app/routes/app_router.dart';

void main() {
  group('BhojanRouter Path Definitions', () {
    test('Core route paths match Sprint 1 architectural blueprint', () {
      expect(AppRoutes.home, '/');
      expect(AppRoutes.search, '/search');
      expect(AppRoutes.cart, '/cart');
      expect(AppRoutes.orders, '/orders');
      expect(AppRoutes.profile, '/profile');
      expect(AppRoutes.restaurantDetails, '/restaurant/:id');
      expect(AppRoutes.foodDetails, '/dish/:id');
      expect(AppRoutes.checkout, '/checkout');
      expect(AppRoutes.liveTracking, '/tracking/:orderId');
      expect(AppRoutes.onboarding, '/onboarding');
    });

    test('GoRouter is properly instantiated with root key and routes', () {
      final router = BhojanRouter.router;
      expect(router, isNotNull);
      expect(router.configuration.routes.length, greaterThanOrEqualTo(5));
    });
  });
}
