import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/routes/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/widgets/bhojan_button.dart';
import '../../../../core/widgets/veg_badge.dart';
import '../../../cart/domain/entities/cart_item.dart';
import '../../../cart/presentation/bloc/cart_bloc.dart';
import '../../../cart/presentation/bloc/cart_event.dart';
import '../../domain/entities/customer_order.dart';
import '../bloc/orders_bloc.dart';
import '../bloc/orders_event.dart';
import '../bloc/orders_state.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    context.read<OrdersBloc>().add(const OrdersLoadRequested());
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BhojanColors.scaffoldBackground,
      appBar: AppBar(
        title: const Text(
          'My Orders',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: BhojanColors.onSurface,
          ),
        ),
        backgroundColor: BhojanColors.surface,
        elevation: 0.5,
        centerTitle: false,
        bottom: TabBar(
          controller: _tabController,
          labelColor: BhojanColors.primary,
          unselectedLabelColor: BhojanColors.onSurfaceVariant,
          indicatorColor: BhojanColors.primary,
          indicatorWeight: 3,
          labelStyle:
              const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
          tabs: const [
            Tab(text: 'Active Orders'),
            Tab(text: 'Past Orders'),
          ],
        ),
      ),
      body: BlocBuilder<OrdersBloc, OrdersState>(
        builder: (context, state) {
          if (state.isLoading && state.orders.isEmpty) {
            return const Center(
              child: CircularProgressIndicator(color: BhojanColors.primary),
            );
          }

          return TabBarView(
            controller: _tabController,
            children: [
              _buildActiveOrdersTab(state.activeOrders),
              _buildPastOrdersTab(state.pastOrders),
            ],
          );
        },
      ),
    );
  }

  Widget _buildActiveOrdersTab(List<CustomerOrder> activeOrders) {
    if (activeOrders.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(BhojanDimens.space32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: const BoxDecoration(
                  color: BhojanColors.primaryContainer,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.soup_kitchen_outlined,
                  size: 40,
                  color: BhojanColors.primary,
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'No Active Orders',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: BhojanColors.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Hungry for authentic home-cooked meals?\nExplore fresh kitchens nearby.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  color: BhojanColors.onSurfaceVariant,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 24),
              BhojanButton(
                label: 'Order Fresh Meals',
                width: 200,
                onPressed: () => context.go(AppRoutes.home),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      color: BhojanColors.primary,
      onRefresh: () async {
        context.read<OrdersBloc>().add(const OrdersLoadRequested());
      },
      child: ListView.builder(
        padding: const EdgeInsets.all(BhojanDimens.space16),
        itemCount: activeOrders.length,
        itemBuilder: (context, index) {
          final order = activeOrders[index];
          return _buildActiveOrderCard(order);
        },
      ),
    );
  }

  Widget _buildActiveOrderCard(CustomerOrder order) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: BhojanColors.surface,
        borderRadius: BhojanDimens.roundedCard,
        border: Border.all(color: BhojanColors.outline, width: 0.8),
        boxShadow: BhojanDimens.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Order Header with ETA
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: BhojanColors.primaryContainer.withValues(alpha: 0.6),
              borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(BhojanDimens.radiusLarge)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.delivery_dining,
                        size: 20, color: BhojanColors.primary),
                    const SizedBox(width: 8),
                    Text(
                      order.eta,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: BhojanColors.primaryDark,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: BhojanColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: BhojanColors.outline, width: 0.8),
                  ),
                  child: Text(
                    order.id,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: BhojanColors.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Kitchen Details
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: const BoxDecoration(
                        color: BhojanColors.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const Center(
                        child: Icon(Icons.soup_kitchen,
                            size: 20, color: Colors.white),
                      ),
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
                  ],
                ),

                const SizedBox(height: 16),

                // Stepper Progress
                _buildTimelineProgress(order.statusStep),

                const Divider(height: 24, color: BhojanColors.outline),

                // Items list
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

                // Total and CTA
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          order.paymentMode,
                          style: const TextStyle(
                            fontSize: 11,
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
                    Row(
                      children: [
                        OutlinedButton(
                          onPressed: () =>
                              _showCallKitchenSheet(context, order),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: BhojanColors.primary,
                            side: const BorderSide(color: BhojanColors.outline),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20)),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 8),
                          ),
                          child: const Text('Call Kitchen'),
                        ),
                        const SizedBox(width: 8),
                        ElevatedButton(
                          onPressed: () =>
                              context.push('/tracking/${order.id}'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: BhojanColors.primary,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20)),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 8),
                            elevation: 0,
                          ),
                          child: const Text('Track Live'),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimelineProgress(int currentStep) {
    final steps = [
      'Confirmed',
      'Cooking',
      'On the Way',
      'Delivered',
    ];

    return Row(
      children: List.generate(steps.length * 2 - 1, (index) {
        if (index.isOdd) {
          final stepIndex = index ~/ 2;
          final isCompleted = stepIndex < currentStep;
          return Expanded(
            child: Container(
              height: 2.5,
              color: isCompleted
                  ? BhojanColors.primary
                  : BhojanColors.outlineVariant,
            ),
          );
        } else {
          final stepIndex = index ~/ 2;
          final isCompleted = stepIndex < currentStep;
          final isCurrent = stepIndex == currentStep - 1;

          return Column(
            children: [
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: isCompleted
                      ? BhojanColors.primary
                      : BhojanColors.surfaceContainerLow,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: isCurrent
                        ? BhojanColors.goldAccent
                        : isCompleted
                            ? BhojanColors.primary
                            : BhojanColors.outlineVariant,
                    width: isCurrent ? 2 : 1,
                  ),
                ),
                child: Center(
                  child: isCompleted
                      ? const Icon(Icons.check, size: 12, color: Colors.white)
                      : null,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                steps[stepIndex],
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: isCurrent ? FontWeight.w800 : FontWeight.w500,
                  color: isCurrent
                      ? BhojanColors.primary
                      : BhojanColors.onSurfaceVariant,
                ),
              ),
            ],
          );
        }
      }),
    );
  }

  Widget _buildPastOrdersTab(List<CustomerOrder> pastOrders) {
    if (pastOrders.isEmpty) {
      return const Center(
        child: Text(
          'No past orders found',
          style: TextStyle(color: BhojanColors.onSurfaceVariant),
        ),
      );
    }

    return RefreshIndicator(
      color: BhojanColors.primary,
      onRefresh: () async {
        context.read<OrdersBloc>().add(const OrdersLoadRequested());
      },
      child: ListView.builder(
        padding: const EdgeInsets.all(BhojanDimens.space16),
        itemCount: pastOrders.length,
        itemBuilder: (context, index) {
          final order = pastOrders[index];
          return _buildPastOrderCard(order);
        },
      ),
    );
  }

  Widget _buildPastOrderCard(CustomerOrder order) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: BhojanColors.surface,
        borderRadius: BhojanDimens.roundedCard,
        border: Border.all(color: BhojanColors.outline, width: 0.8),
        boxShadow: BhojanDimens.cardShadow,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
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
                        '${order.createdAt.day}/${order.createdAt.month}/${order.createdAt.year} • ${order.id}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: BhojanColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: BhojanColors.primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.check_circle,
                          size: 12, color: BhojanColors.primary),
                      SizedBox(width: 4),
                      Text(
                        'Delivered',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: BhojanColors.primaryDark,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const Divider(height: 16, color: BhojanColors.outline),
            ...order.items.map((item) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      BhojanVegBadge(isVeg: item.isVeg, size: 12),
                      const SizedBox(width: 6),
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
                          color: BhojanColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                )),
            const Divider(height: 16, color: BhojanColors.outline),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text(
                      '₹${order.total}',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: BhojanColors.onSurface,
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: () => _showReceiptDialog(context, order),
                      style: TextButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                      ),
                      child: const Text(
                        'View Bill',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: BhojanColors.primary,
                        ),
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    OutlinedButton(
                      onPressed: () => _showRateDialog(context, order),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: BhojanColors.goldDark,
                        side: const BorderSide(color: BhojanColors.outline),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20)),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            order.rating != null
                                ? Icons.star
                                : Icons.star_border,
                            size: 14,
                            color: BhojanColors.goldAccent,
                          ),
                          const SizedBox(width: 4),
                          Text(order.rating != null
                              ? '${order.rating}★'
                              : 'Rate'),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      onPressed: () => _reorder(context, order),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: BhojanColors.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20)),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 6),
                        elevation: 0,
                      ),
                      child: const Text('Reorder'),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showCallKitchenSheet(BuildContext context, CustomerOrder order) {
    showModalBottomSheet(
      context: context,
      backgroundColor: BhojanColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: BhojanColors.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              const Icon(Icons.soup_kitchen,
                  size: 36, color: BhojanColors.primary),
              const SizedBox(height: 10),
              Text(
                'Connect with ${order.kitchenName}',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: BhojanColors.onSurface,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Home chefs personally supervise cooking and dispatch.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  color: BhojanColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 20),
              ListTile(
                leading: const Icon(Icons.phone, color: BhojanColors.primary),
                title: const Text('Home Chef Direct Line'),
                subtitle: const Text('+91 98450 12345'),
                trailing: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content:
                            Text('Dialing Home Chef Anju (+91 98450 12345)...'),
                        backgroundColor: BhojanColors.primary,
                      ),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: BhojanColors.primary,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Call'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showReceiptDialog(BuildContext context, CustomerOrder order) {
    final subtotal =
        order.items.fold<int>(0, (sum, i) => sum + (i.price * i.qty));
    final deliveryFee = 35;
    final packagingFee = 25;
    final gst = ((subtotal * 0.05).round());

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: BhojanColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            const Icon(Icons.receipt_long, color: BhojanColors.primary),
            const SizedBox(width: 8),
            Text(
              'Bill Receipt - ${order.id}',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                order.kitchenName,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: BhojanColors.onSurface,
                ),
              ),
              Text(
                'Delivery to: ${order.deliveryAddress ?? 'TBD'}',
                style: const TextStyle(
                  fontSize: 11,
                  color: BhojanColors.onSurfaceVariant,
                ),
              ),
              const Divider(height: 20),
              ...order.items.map((i) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('${i.name} x ${i.qty}',
                            style: const TextStyle(fontSize: 12)),
                        Text('₹${i.price * i.qty}',
                            style: const TextStyle(
                                fontSize: 12, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  )),
              const Divider(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Item Subtotal',
                      style: TextStyle(
                          fontSize: 12, color: BhojanColors.onSurfaceVariant)),
                  Text('₹$subtotal', style: const TextStyle(fontSize: 12)),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Packaging Fee',
                      style: TextStyle(
                          fontSize: 12, color: BhojanColors.onSurfaceVariant)),
                  Text('₹$packagingFee', style: const TextStyle(fontSize: 12)),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Delivery Fee',
                      style: TextStyle(
                          fontSize: 12, color: BhojanColors.onSurfaceVariant)),
                  Text('₹$deliveryFee', style: const TextStyle(fontSize: 12)),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('GST (5%)',
                      style: TextStyle(
                          fontSize: 12, color: BhojanColors.onSurfaceVariant)),
                  Text('₹$gst', style: const TextStyle(fontSize: 12)),
                ],
              ),
              const Divider(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total Paid',
                      style:
                          TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                  Text('₹${order.total}',
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: BhojanColors.primary)),
                ],
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _showRateDialog(BuildContext context, CustomerOrder order) {
    int selectedRating = order.rating ?? 5;
    showDialog(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: BhojanColors.surface,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text(
            'Rate Your Meal',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'How was your food from ${order.kitchenName}?',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12,
                  color: BhojanColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (idx) {
                  final star = idx + 1;
                  return IconButton(
                    icon: Icon(
                      star <= selectedRating ? Icons.star : Icons.star_border,
                      size: 32,
                      color: BhojanColors.goldAccent,
                    ),
                    onPressed: () {
                      setDialogState(() => selectedRating = star);
                    },
                  );
                }),
              ),
              const SizedBox(height: 8),
              Text(
                selectedRating == 5
                    ? 'Pure Home Bliss! Highly Recommended'
                    : selectedRating >= 4
                        ? 'Great Homestyle Flavor'
                        : 'Average Experience',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: BhojanColors.primary,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                context.read<OrdersBloc>().add(
                      OrderRateRequested(
                        orderId: order.id,
                        rating: selectedRating,
                      ),
                    );
                Navigator.pop(dialogCtx);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Thanks for rating ${order.kitchenName}!'),
                    backgroundColor: BhojanColors.primary,
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: BhojanColors.primary,
                foregroundColor: Colors.white,
              ),
              child: const Text('Submit Rating'),
            ),
          ],
        ),
      ),
    );
  }

  void _reorder(BuildContext context, CustomerOrder order) {
    final cartBloc = context.read<CartBloc>();
    for (final item in order.items) {
      cartBloc.add(
        AddToCartRequested(
          CartItem(
            id: '${item.id}_${DateTime.now().millisecondsSinceEpoch}',
            dishId: item.id,
            name: item.name,
            kitchenId: order.kitchenId,
            kitchenName: order.kitchenName,
            unitPrice: item.price,
            quantity: item.qty,
            isVeg: item.isVeg,
            customizationSummary: item.portion,
          ),
        ),
      );
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            'Added ${order.items.length} items from ${order.kitchenName} to cart!'),
        backgroundColor: BhojanColors.primary,
      ),
    );

    context.go(AppRoutes.cart);
  }
}
