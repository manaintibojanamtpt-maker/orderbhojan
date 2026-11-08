import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/routes/app_router.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/widgets/veg_badge.dart';
import '../../domain/entities/customer_order.dart';
import '../../domain/repositories/orders_repository.dart';

class OrderTrackingScreen extends StatefulWidget {
  final String orderId;

  const OrderTrackingScreen({super.key, required this.orderId});

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  CustomerOrder? _order;
  bool _isLoading = true;
  StreamSubscription<CustomerOrder?>? _orderSub;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _initLiveTracking();
  }

  void _initLiveTracking() {
    final repo = sl<OrdersRepository>();

    // 1. Initial Load
    repo.getOrderById(widget.orderId).then((order) {
      if (mounted && order != null) {
        setState(() {
          _order = order;
          _isLoading = false;
        });
      }
    });

    // 2. Real-time Firestore snapshot subscription
    _orderSub = repo.watchOrder(widget.orderId).listen((updated) {
      if (mounted && updated != null) {
        setState(() {
          _order = updated;
          _isLoading = false;
        });
      }
    });

    // 3. Fallback active polling for backend tracking API
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) async {
      if (!mounted) return;
      if (_order != null && _order!.status == 'delivered') {
        _pollTimer?.cancel();
        return;
      }
      final latest = await repo.getOrderById(widget.orderId);
      if (mounted && latest != null && latest != _order) {
        setState(() {
          _order = latest;
          _isLoading = false;
        });
      }
    });
  }

  @override
  void dispose() {
    _orderSub?.cancel();
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: BhojanColors.scaffoldBackground,
        body: Center(
          child: CircularProgressIndicator(color: BhojanColors.primary),
        ),
      );
    }

    final order = _order;
    if (order == null) {
      return Scaffold(
        backgroundColor: BhojanColors.scaffoldBackground,
        appBar: AppBar(
          title: const Text('Live Tracking'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go(AppRoutes.orders),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Order not found'),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => context.go(AppRoutes.orders),
                child: const Text('Back to Orders'),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: BhojanColors.scaffoldBackground,
      appBar: AppBar(
        backgroundColor: BhojanColors.surface,
        elevation: 0.5,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Live Order Tracking',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: BhojanColors.onSurface,
              ),
            ),
            Text(
              order.id,
              style: const TextStyle(
                fontSize: 12,
                color: BhojanColors.onSurfaceVariant,
              ),
            ),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: BhojanColors.onSurface),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(AppRoutes.orders);
            }
          },
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(BhojanDimens.space16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Status ETA Hero Card
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [BhojanColors.primaryDark, BhojanColors.primary],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BhojanDimens.roundedCard,
                boxShadow: BhojanDimens.cardShadow,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: BhojanColors.goldAccent,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          order.status.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: BhojanColors.primaryDark,
                          ),
                        ),
                      ),
                      Row(
                        children: [
                          const Icon(Icons.timer_outlined,
                              size: 16, color: Colors.white70),
                          const SizedBox(width: 4),
                          Text(
                            order.eta,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Fresh Meal in Progress',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Simmered with pure ingredients at ${order.kitchenName}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFFE7EFEA),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Stepper Timeline
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: BhojanColors.surface,
                borderRadius: BhojanDimens.roundedCard,
                border: Border.all(color: BhojanColors.outline, width: 0.8),
                boxShadow: BhojanDimens.cardShadow,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'DELIVERY PROGRESS',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: BhojanColors.onSurfaceVariant,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 14),
                  _buildStepTile(
                    title: 'Order Confirmed',
                    subtitle: 'Kitchen accepted your order',
                    isCompleted: order.statusStep >= 1,
                    isCurrent: order.statusStep == 1,
                    icon: Icons.check_circle_outline,
                  ),
                  _buildStepTile(
                    title: 'Cooking Fresh',
                    subtitle: 'Home chef is preparing your meal',
                    isCompleted: order.statusStep >= 2,
                    isCurrent: order.statusStep == 2,
                    icon: Icons.soup_kitchen,
                  ),
                  _buildStepTile(
                    title: 'Out for Delivery',
                    subtitle: 'Carrier assigned in insulated thermal box',
                    isCompleted: order.statusStep >= 3,
                    isCurrent: order.statusStep == 3,
                    icon: Icons.delivery_dining,
                  ),
                  _buildStepTile(
                    title: 'Delivered',
                    subtitle:
                        'Delivered to ${order.deliveryAddress != null ? order.deliveryAddress!.split(',').first : 'TBD'}',
                    isCompleted: order.statusStep >= 4,
                    isCurrent: order.statusStep == 4,
                    icon: Icons.home,
                    isLast: true,
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Kitchen Contact & Help Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: BhojanColors.surface,
                borderRadius: BhojanDimens.roundedCard,
                border: Border.all(color: BhojanColors.outline, width: 0.8),
                boxShadow: BhojanDimens.cardShadow,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: BhojanColors.primaryContainer,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.cottage,
                            size: 20, color: BhojanColors.primary),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              order.kitchenName,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: BhojanColors.onSurface,
                              ),
                            ),
                            Text(
                              order.kitchenAddress ?? 'Address unavailable',
                              style: const TextStyle(
                                fontSize: 12,
                                color: BhojanColors.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon:
                            const Icon(Icons.call, color: BhojanColors.primary),
                        onPressed: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                  'Calling ${order.kitchenName}... (+91 98450 12345)'),
                              backgroundColor: BhojanColors.primary,
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Order Items & Bill Summary
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: BhojanColors.surface,
                borderRadius: BhojanDimens.roundedCard,
                border: Border.all(color: BhojanColors.outline, width: 0.8),
                boxShadow: BhojanDimens.cardShadow,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'ORDER ITEMS',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: BhojanColors.onSurfaceVariant,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 10),
                  ...order.items.map((item) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            BhojanVegBadge(isVeg: item.isVeg, size: 14),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                '${item.name} x ${item.qty}',
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: BhojanColors.onSurface,
                                ),
                              ),
                            ),
                            Text(
                              '₹${item.price}',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: BhojanColors.onSurface,
                              ),
                            ),
                          ],
                        ),
                      )),
                  const Divider(height: 20, color: BhojanColors.outline),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Total (${order.paymentMode})',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: BhojanColors.onSurfaceVariant,
                        ),
                      ),
                      Text(
                        '₹${order.total}',
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: BhojanColors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStepTile({
    required String title,
    required String subtitle,
    required bool isCompleted,
    required bool isCurrent,
    required IconData icon,
    bool isLast = false,
  }) {
    final color =
        isCompleted ? BhojanColors.primary : BhojanColors.outlineVariant;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: isCompleted
                    ? BhojanColors.primaryContainer
                    : BhojanColors.surfaceContainerLow,
                shape: BoxShape.circle,
                border: Border.all(
                  color:
                      isCompleted ? BhojanColors.primary : BhojanColors.outline,
                  width: isCurrent ? 2 : 1,
                ),
              ),
              child: Icon(icon, size: 15, color: color),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 36,
                color:
                    isCompleted ? BhojanColors.primary : BhojanColors.outline,
              ),
          ],
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 2, bottom: 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: isCompleted ? FontWeight.w700 : FontWeight.w500,
                    color: isCompleted
                        ? BhojanColors.onSurface
                        : BhojanColors.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 11,
                    color: BhojanColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
