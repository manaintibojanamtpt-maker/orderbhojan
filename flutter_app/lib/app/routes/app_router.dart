import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_dimens.dart';
import '../../features/auth/presentation/screens/welcome_screen.dart';
import '../../features/cart/presentation/bloc/cart_bloc.dart';
import '../../features/cart/presentation/bloc/cart_state.dart';
import '../../features/cart/presentation/screens/cart_screen.dart';
import '../../features/checkout/presentation/screens/checkout_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/kitchen/presentation/screens/food_details_screen.dart';
import '../../features/kitchen/presentation/screens/kitchen_discovery_screen.dart';
import '../../features/kitchen/presentation/screens/kitchen_menu_screen.dart';
import '../../features/orders/presentation/screens/order_tracking_screen.dart';
import '../../features/orders/presentation/screens/orders_screen.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';

class AppRoutes {
  static const String home = '/';
  static const String search = '/search';
  static const String cart = '/cart';
  static const String orders = '/orders';
  static const String profile = '/profile';
  static const String restaurantDetails = '/restaurant/:id';
  static const String foodDetails = '/dish/:id';
  static const String checkout = '/checkout';
  static const String liveTracking = '/tracking/:orderId';
  static const String onboarding = '/onboarding';
}

/// Convenience alias
class AppRouter extends AppRoutes {}

class BhojanRouter {
  static final GlobalKey<NavigatorState> rootNavigatorKey =
      GlobalKey<NavigatorState>(debugLabel: 'root');

  static final GoRouter router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: AppRoutes.home,
    routes: [
      // 1. Fullscreen Stack Routes (No persistent bottom nav)
      GoRoute(
        path: AppRoutes.onboarding,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const WelcomeScreen(),
      ),
      GoRoute(
        path: AppRoutes.checkout,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const CheckoutScreen(),
      ),
      GoRoute(
        path: AppRoutes.liveTracking,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) {
          final orderId = state.pathParameters['orderId'] ?? '';
          return OrderTrackingScreen(orderId: orderId);
        },
      ),
      GoRoute(
        path: AppRoutes.restaurantDetails,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) {
          final kitchenId =
              state.pathParameters['id'] ?? 'ammachis-kerala-kitchen';
          return KitchenMenuScreen(kitchenId: kitchenId);
        },
      ),
      GoRoute(
        path: AppRoutes.foodDetails,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) {
          final dishId = state.pathParameters['id'] ?? 'dish-biryani-1';
          return FoodDetailsScreen(dishId: dishId);
        },
      ),

      // 2. Persistent Bottom Navigation Stateful Shell
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return Scaffold(
            body: navigationShell,
            bottomNavigationBar:
                _BhojanBottomBar(navigationShell: navigationShell),
          );
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.home,
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.search,
                builder: (context, state) => const KitchenDiscoveryScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.cart,
                builder: (context, state) => const CartScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.orders,
                builder: (context, state) => const OrdersScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.profile,
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

class _BhojanBottomBar extends StatelessWidget {
  final StatefulNavigationShell navigationShell;
  const _BhojanBottomBar({required this.navigationShell});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: BhojanColors.surface,
        border: Border(
          top: BorderSide(color: BhojanColors.outline, width: 0.8),
        ),
        boxShadow: BhojanDimens.cardShadow,
      ),
      child: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        backgroundColor: BhojanColors.surface,
        indicatorColor: BhojanColors.primaryContainer,
        elevation: 0,
        height: 64.0,
        onDestinationSelected: (index) {
          navigationShell.goBranch(
            index,
            initialLocation: index == navigationShell.currentIndex,
          );
        },
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.explore_outlined,
                color: BhojanColors.onSurfaceVariant),
            selectedIcon: Icon(Icons.explore, color: BhojanColors.primary),
            label: 'Explore',
          ),
          const NavigationDestination(
            icon: Icon(Icons.search_outlined,
                color: BhojanColors.onSurfaceVariant),
            selectedIcon: Icon(Icons.search, color: BhojanColors.primary),
            label: 'Search',
          ),
          NavigationDestination(
            icon: BlocBuilder<CartBloc, CartState>(
              builder: (context, state) {
                return Badge(
                  isLabelVisible: state.itemCount > 0,
                  label: Text('${state.itemCount}'),
                  backgroundColor: BhojanColors.primary,
                  textColor: Colors.white,
                  child: const Icon(Icons.shopping_bag_outlined,
                      color: BhojanColors.onSurfaceVariant),
                );
              },
            ),
            selectedIcon: BlocBuilder<CartBloc, CartState>(
              builder: (context, state) {
                return Badge(
                  isLabelVisible: state.itemCount > 0,
                  label: Text('${state.itemCount}'),
                  backgroundColor: BhojanColors.primary,
                  textColor: Colors.white,
                  child: const Icon(Icons.shopping_bag,
                      color: BhojanColors.primary),
                );
              },
            ),
            label: 'Cart',
          ),
          const NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined,
                color: BhojanColors.onSurfaceVariant),
            selectedIcon: Icon(Icons.receipt_long, color: BhojanColors.primary),
            label: 'Orders',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline,
                color: BhojanColors.onSurfaceVariant),
            selectedIcon: Icon(Icons.person, color: BhojanColors.primary),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
