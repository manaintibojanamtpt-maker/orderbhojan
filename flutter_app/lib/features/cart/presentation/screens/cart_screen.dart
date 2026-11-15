import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/routes/app_router.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/services/preferences_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/widgets/bhojan_button.dart';
import '../../../../core/widgets/veg_badge.dart';
import '../../../home/presentation/widgets/location_selector_sheet.dart';
import '../../domain/entities/cart_item.dart';
import '../bloc/cart_bloc.dart';
import '../bloc/cart_event.dart';
import '../bloc/cart_state.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  bool _noCutlery = true;
  bool _avoidCalling = false;

  final List<Map<String, dynamic>> _frequentlyAdded = [
    {
      'id': 'extra-lime-soda',
      'name': 'Fresh Lime Mint Soda',
      'price': 40,
      'isVeg': true,
      'image':
          'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=300',
    },
    {
      'id': 'extra-banana-chips',
      'name': 'Crispy Kerala Banana Chips (100g)',
      'price': 50,
      'isVeg': true,
      'image':
          'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=300',
    },
    {
      'id': 'extra-payasam',
      'name': 'Ada Pradhaman Payasam Cup',
      'price': 60,
      'isVeg': true,
      'image':
          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BhojanColors.scaffoldBackground,
      appBar: AppBar(
        backgroundColor: BhojanColors.surface,
        elevation: 0.5,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: BhojanColors.onSurface),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(AppRoutes.home);
            }
          },
        ),
        title: BlocBuilder<CartBloc, CartState>(
          builder: (context, state) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'My Cart',
                  style: TextStyle(
                    color: BhojanColors.onSurface,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  state.isEmpty
                      ? 'No items selected'
                      : '${state.itemCount} Items • ${state.kitchenName ?? 'Home Kitchen'}',
                  style: const TextStyle(
                    color: BhojanColors.onSurfaceVariant,
                    fontSize: 12,
                    fontWeight: FontWeight.normal,
                  ),
                ),
              ],
            );
          },
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: BhojanColors.primary.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.bolt, color: BhojanColors.primary, size: 16),
                SizedBox(width: 4),
                Text(
                  '25-30m',
                  style: TextStyle(
                    color: BhojanColors.primary,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: BlocBuilder<CartBloc, CartState>(
        builder: (context, state) {
          if (state.isEmpty) {
            return _buildEmptyCart(context);
          }
          return _buildCartContent(context, state);
        },
      ),
      bottomNavigationBar: BlocBuilder<CartBloc, CartState>(
        builder: (context, state) {
          if (state.isEmpty) return const SizedBox.shrink();
          return _buildStickyBottomBar(context, state);
        },
      ),
    );
  }

  Widget _buildEmptyCart(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(BhojanDimens.space32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                color: BhojanColors.primary.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.shopping_bag_outlined,
                size: 50,
                color: BhojanColors.primary,
              ),
            ),
            const SizedBox(height: BhojanDimens.space24),
            const Text(
              'Your Cart is Empty',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: BhojanColors.onSurface,
              ),
            ),
            const SizedBox(height: BhojanDimens.space8),
            const Text(
              'Good food is always cooking! Explore authentic regional home kitchens near you.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: BhojanColors.onSurfaceVariant,
                height: 1.4,
              ),
            ),
            const SizedBox(height: BhojanDimens.space32),
            BhojanButton(
              label: 'Browse Home Kitchens',
              onPressed: () => context.go(AppRoutes.home),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCartContent(BuildContext context, CartState state) {
    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 120),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ETA Banner
          Container(
            margin: const EdgeInsets.all(BhojanDimens.space16),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: BhojanColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: BhojanColors.outline),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: BhojanColors.vegGreen.withOpacity(0.15),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.schedule,
                    size: 16,
                    color: BhojanColors.vegGreen,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      style: const TextStyle(
                          fontSize: 13, color: BhojanColors.onSurface),
                      children: [
                        const TextSpan(text: 'Delivering to '),
                        TextSpan(
                          text: sl<PreferencesService>()
                                  .getActiveAddress()
                                  .isNotEmpty
                              ? sl<PreferencesService>().getActiveAddress()
                              : 'Set Delivery Location',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: BhojanColors.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Restaurant Header Card
          Container(
            margin:
                const EdgeInsets.symmetric(horizontal: BhojanDimens.space16),
            padding: const EdgeInsets.all(BhojanDimens.space16),
            decoration: BoxDecoration(
              color: BhojanColors.surface,
              borderRadius: BhojanDimens.roundedCard,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.network(
                    'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=150',
                    width: 48,
                    height: 48,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      width: 48,
                      height: 48,
                      color: BhojanColors.outline,
                      child: const Icon(Icons.restaurant,
                          color: BhojanColors.onSurfaceVariant),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        state.kitchenName ?? "Ammachi's Authentic Kitchen",
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: BhojanColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Row(
                        children: [
                          Icon(Icons.verified,
                              size: 14, color: BhojanColors.vegGreen),
                          SizedBox(width: 4),
                          Text(
                            '100% Home Kitchen • 1.2 km',
                            style: TextStyle(
                                fontSize: 12,
                                color: BhojanColors.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                TextButton.icon(
                  onPressed: () {
                    if (state.kitchenId != null) {
                      context.push('/restaurant/${state.kitchenId}');
                    } else {
                      context.pop();
                    }
                  },
                  icon: const Icon(Icons.add,
                      size: 16, color: BhojanColors.primary),
                  label: const Text(
                    'Add more',
                    style: TextStyle(
                      color: BhojanColors.primary,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: BhojanDimens.space16),

          // Items List
          Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: BhojanDimens.space16),
            child: Column(
              children: state.items
                  .map((item) => _buildCartItemCard(context, item))
                  .toList(),
            ),
          ),

          const SizedBox(height: BhojanDimens.space24),

          // Frequently Added Together
          _buildFrequentlyAddedSection(context, state),

          const SizedBox(height: BhojanDimens.space24),

          // Delivery Preferences
          _buildPreferencesSection(),

          const SizedBox(height: BhojanDimens.space24),

          // Promo Coupon
          _buildPromoCard(state),

          const SizedBox(height: BhojanDimens.space24),

          // Bill Summary
          _buildBillSummaryCard(state),

          const SizedBox(height: BhojanDimens.space24),

          // Delivery Address
          _buildAddressCard(),
        ],
      ),
    );
  }

  Widget _buildCartItemCard(BuildContext context, CartItem item) {
    return Container(
      margin: const EdgeInsets.only(bottom: BhojanDimens.space8),
      padding: const EdgeInsets.all(BhojanDimens.space16),
      decoration: BoxDecoration(
        color: BhojanColors.surface,
        borderRadius: BhojanDimens.roundedCard,
        border: Border.all(color: BhojanColors.outline.withOpacity(0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          VegBadge(isVeg: item.isVeg, size: 16),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: BhojanColors.onSurface,
                  ),
                ),
                if (item.customizationSummary != null &&
                    item.customizationSummary!.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    item.customizationSummary!,
                    style: const TextStyle(
                      fontSize: 12,
                      color: BhojanColors.onSurfaceVariant,
                      height: 1.3,
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                Text(
                  '₹${item.totalPrice}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: BhojanColors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          // Stepper & Delete
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                decoration: BoxDecoration(
                  color: BhojanColors.scaffoldBackground,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: BhojanColors.outline),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    InkWell(
                      onTap: () {
                        context.read<CartBloc>().add(
                              UpdateQuantityRequested(
                                item.id,
                                item.quantity - 1,
                              ),
                            );
                      },
                      child: const Padding(
                        padding:
                            EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        child: Icon(Icons.remove,
                            size: 16, color: BhojanColors.primary),
                      ),
                    ),
                    Text(
                      '${item.quantity}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: BhojanColors.onSurface,
                      ),
                    ),
                    InkWell(
                      onTap: () {
                        context.read<CartBloc>().add(
                              UpdateQuantityRequested(
                                item.id,
                                item.quantity + 1,
                              ),
                            );
                      },
                      child: const Padding(
                        padding:
                            EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        child: Icon(Icons.add,
                            size: 16, color: BhojanColors.primary),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              InkWell(
                onTap: () {
                  context
                      .read<CartBloc>()
                      .add(RemoveFromCartRequested(item.id));
                },
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(Icons.delete_outline,
                      size: 18, color: BhojanColors.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFrequentlyAddedSection(BuildContext context, CartState state) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: BhojanDimens.space16),
          child: Text(
            'Frequently Added Together',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: BhojanColors.onSurface,
            ),
          ),
        ),
        const SizedBox(height: BhojanDimens.space8),
        SizedBox(
          height: 145,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding:
                const EdgeInsets.symmetric(horizontal: BhojanDimens.space16),
            itemCount: _frequentlyAdded.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final item = _frequentlyAdded[index];
              return Container(
                width: 140,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: BhojanColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border:
                      Border.all(color: BhojanColors.outline.withOpacity(0.5)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        item['image'] as String,
                        width: double.infinity,
                        height: 60,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          height: 60,
                          color: BhojanColors.outline,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      item['name'] as String,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: BhojanColors.onSurface,
                      ),
                    ),
                    const Spacer(),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '₹${item['price']}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: BhojanColors.onSurface,
                          ),
                        ),
                        InkWell(
                          onTap: () {
                            context.read<CartBloc>().add(
                                  AddToCartRequested(
                                    CartItem(
                                      id: '${item['id']}_${DateTime.now().millisecondsSinceEpoch}',
                                      dishId: item['id'] as String,
                                      name: item['name'] as String,
                                      unitPrice: item['price'] as int,
                                      quantity: 1,
                                      isVeg: item['isVeg'] as bool,
                                      kitchenId:
                                          state.kitchenId ?? 'ammachis_kitchen',
                                      kitchenName: state.kitchenName ??
                                          "Ammachi's Authentic Kitchen",
                                    ),
                                  ),
                                );
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Added ${item['name']} to cart'),
                                duration: const Duration(seconds: 1),
                              ),
                            );
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: BhojanColors.primary.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              '+ ADD',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: BhojanColors.primary,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildPreferencesSection() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: BhojanDimens.space16),
      padding: const EdgeInsets.all(BhojanDimens.space16),
      decoration: BoxDecoration(
        color: BhojanColors.surface,
        borderRadius: BhojanDimens.roundedCard,
        border: Border.all(color: BhojanColors.outline.withOpacity(0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Delivery & Eco Preferences',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: BhojanColors.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: const Text(
              "Don't send plastic cutlery",
              style: TextStyle(fontSize: 13, color: BhojanColors.onSurface),
            ),
            subtitle: const Text(
              'Help save the environment with every home meal',
              style:
                  TextStyle(fontSize: 11, color: BhojanColors.onSurfaceVariant),
            ),
            value: _noCutlery,
            activeColor: BhojanColors.vegGreen,
            onChanged: (val) => setState(() => _noCutlery = val ?? false),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: const Text(
              'Avoid calling & ringing door bell',
              style: TextStyle(fontSize: 13, color: BhojanColors.onSurface),
            ),
            subtitle: const Text(
              'Leave packet at the door / security gate',
              style:
                  TextStyle(fontSize: 11, color: BhojanColors.onSurfaceVariant),
            ),
            value: _avoidCalling,
            activeColor: BhojanColors.primary,
            onChanged: (val) => setState(() => _avoidCalling = val ?? false),
          ),
        ],
      ),
    );
  }

  Widget _buildPromoCard(CartState state) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: BhojanDimens.space16),
      padding: const EdgeInsets.all(BhojanDimens.space16),
      decoration: BoxDecoration(
        color: BhojanColors.vegGreen.withOpacity(0.08),
        borderRadius: BhojanDimens.roundedCard,
        border: Border.all(color: BhojanColors.vegGreen.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.local_offer, color: BhojanColors.vegGreen, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${state.promoCode ?? 'BHOJAN50'} Applied',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: BhojanColors.vegGreen,
                  ),
                ),
                Text(
                  'You saved ₹${state.effectiveDiscount} on this order!',
                  style: TextStyle(
                    fontSize: 12,
                    color: BhojanColors.onSurfaceVariant.withOpacity(0.9),
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Best offer BHOJAN50 is already applied!'),
                  duration: Duration(seconds: 1),
                ),
              );
            },
            child: const Text(
              'CHANGE',
              style: TextStyle(
                color: BhojanColors.primary,
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBillSummaryCard(CartState state) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: BhojanDimens.space16),
      padding: const EdgeInsets.all(BhojanDimens.space16),
      decoration: BoxDecoration(
        color: BhojanColors.surface,
        borderRadius: BhojanDimens.roundedCard,
        border: Border.all(color: BhojanColors.outline.withOpacity(0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Bill Details',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: BhojanColors.onSurface,
            ),
          ),
          const SizedBox(height: 12),
          _buildBillRow('Item Total', '₹${state.subtotal}'),
          const SizedBox(height: 8),
          _buildBillRow(
            'Delivery Fee',
            state.deliveryFee == 0 ? 'FREE' : '₹${state.deliveryFee}',
            isFree: state.deliveryFee == 0,
          ),
          const SizedBox(height: 8),
          _buildBillRow('Homestyle Packaging Fee', '₹${state.packagingFee}'),
          const SizedBox(height: 8),
          _buildBillRow('Govt. Taxes & GST (5%)',
              '₹${state.gstAmount.toStringAsFixed(0)}'),
          if (state.effectiveDiscount > 0) ...[
            const SizedBox(height: 8),
            _buildBillRow(
              'Coupon Discount (${state.promoCode})',
              '-₹${state.effectiveDiscount}',
              isDiscount: true,
            ),
          ],
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(color: BhojanColors.outline),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'To Pay',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: BhojanColors.onSurface,
                ),
              ),
              Text(
                '₹${state.grandTotal}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  color: BhojanColors.primary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: BhojanColors.vegGreen.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.celebration,
                    size: 16, color: BhojanColors.vegGreen),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'You are saving ₹${state.effectiveDiscount + 35} on this home meal!',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: BhojanColors.vegGreen,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBillRow(String label, String value,
      {bool isFree = false, bool isDiscount = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(
              fontSize: 13, color: BhojanColors.onSurfaceVariant),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isFree
                ? BhojanColors.vegGreen
                : isDiscount
                    ? BhojanColors.vegGreen
                    : BhojanColors.onSurface,
          ),
        ),
      ],
    );
  }

  Widget _buildAddressCard() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: BhojanDimens.space16),
      padding: const EdgeInsets.all(BhojanDimens.space16),
      decoration: BoxDecoration(
        color: BhojanColors.surface,
        borderRadius: BhojanDimens.roundedCard,
        border: Border.all(color: BhojanColors.outline.withOpacity(0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: BhojanColors.primary.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child:
                const Icon(Icons.home, color: BhojanColors.primary, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'Delivery Address',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: BhojanColors.onSurface,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  sl<PreferencesService>().getActiveAddress().isNotEmpty
                      ? sl<PreferencesService>().getActiveAddress()
                      : 'No address set. Tap CHANGE to set location.',
                  style: const TextStyle(
                    fontSize: 12,
                    color: BhojanColors.onSurfaceVariant,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: () {
              LocationSelectorSheet.show(
                context,
                currentAddress: sl<PreferencesService>().getActiveAddress(),
                onAddressSelected: (newAddr) {
                  setState(() {});
                },
              );
            },
            child: const Text(
              'CHANGE',
              style: TextStyle(
                color: BhojanColors.primary,
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStickyBottomBar(BuildContext context, CartState state) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: BhojanColors.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 10,
            offset: const Offset(0, -3),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'TOTAL PAYABLE',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                    color: BhojanColors.onSurfaceVariant,
                  ),
                ),
                Text(
                  '₹${state.grandTotal}',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: BhojanColors.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 20),
            Expanded(
              child: BhojanButton(
                label: 'Proceed to Checkout',
                icon: Icons.arrow_forward,
                onPressed: () {
                  context.push(AppRoutes.checkout);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
