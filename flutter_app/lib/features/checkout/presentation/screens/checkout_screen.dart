import 'dart:async';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';
import '../../../../app/routes/app_router.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/services/preferences_service.dart'
    show PreferencesService, GuestCheckoutAttemptEvent, shouldClearGuestCheckoutAttemptId;
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/widgets/bhojan_button.dart';
import '../../../../core/widgets/veg_badge.dart';
import '../../../cart/presentation/bloc/cart_bloc.dart';
import '../../../cart/presentation/bloc/cart_event.dart';
import '../../../cart/presentation/bloc/cart_state.dart';
import '../../../kitchen/data/repositories/kitchen_repository.dart';
import '../../../home/presentation/widgets/location_selector_sheet.dart';
import '../../../kitchen/domain/entities/kitchen.dart';
import '../../../orders/domain/entities/customer_order.dart';
import '../../../orders/domain/repositories/orders_repository.dart';
import '../../../orders/presentation/bloc/orders_bloc.dart';
import '../../../orders/presentation/bloc/orders_event.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  static const MethodChannel _platformChannel =
      MethodChannel('com.bhojanos.customer/platform');

  String _selectedPayment = 'upi';
  String _selectedSlot = 'now';
  int _deliveryTip = 0;
  bool _isPlacingOrder = false;
  String _selectedAddress = '';
  // Guest checkout attempt lifecycle. The attempt ID is persisted per device
  // and cleared only when /checkout/place returns a confirmed successful
  // response AND the canonical order has been persisted locally. Until then
  // the request is unresolved: a network failure, timeout or ambiguous
  // response keeps the ID for safe retry, and an abandoned checkout keeps it
  // too, because the server may already have created the order.
  bool _guestCheckoutInFlight = false;
  bool _guestCheckoutConfirmed = false;
  // Guard against repeated taps dispatching duplicate local persistence
  // operations for the same canonical order.
  String? _placingOrderId;
  Kitchen? _currentKitchen;
  // Authoritative backend quote from /prepare (used if available)
  Map<String, dynamic>? _serverQuote;

  bool get _isServiceable => _currentKitchen != null &&
      (_distanceKm == null || _currentKitchen!.isServiceableAtDistance(_distanceKm!));
  double? _distanceKm;

  bool get _isStoreOpenNow {
    final nowIst =
        DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
    return nowIst.hour >= 9 && nowIst.hour < 22;
  }

  @override
  void initState() {
    super.initState();
    final saved = sl<PreferencesService>().getActiveAddress();
    _selectedAddress = saved;
    if (!_isStoreOpenNow) {
      _selectedSlot = 'scheduled';
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkLiveServiceability();
    });
  }

  Future<void> _checkLiveServiceability() async {
    final cartState = context.read<CartBloc>().state;
    final kitchenId = cartState.kitchenId;
    final userCoords = sl<PreferencesService>().getActiveCoordinates();
    if (userCoords == null || userCoords['lat'] == null || userCoords['lng'] == null) {
      return;
    }

    final double customerLat = userCoords['lat']!;
    final double customerLng = userCoords['lng']!;

    try {
      final kitchen = await sl<KitchenRepository>().getKitchenById(kitchenId ?? '');
      final distanceKm = _computeDistanceKm(customerLat, customerLng, kitchen);

      if (mounted) {
        setState(() {
          _currentKitchen = kitchen;
          _distanceKm = distanceKm;
        });
      }
    } catch (e) {
      debugPrint('[CheckoutScreen] Serviceability check note: $e');
    }
  }

  static double _computeDistanceKm(double lat1, double lng1, Kitchen? kitchen) {
    if (kitchen?.lat == null || kitchen?.lng == null) return 0.0;
    // Haversine approximation
    const r = 6371.0;
    final dLat = (kitchen!.lat! - lat1) * 3.141592653589793 / 180.0;
    final dLng = (kitchen.lng! - lng1) * 3.141592653589793 / 180.0;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * 3.141592653589793 / 180.0) *
            math.cos(kitchen.lat! * 3.141592653589793 / 180.0) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  int _calculateAuthoritativeTotal(CartState cartState) {
    if (cartState.isEmpty) return 0;
    final dist = _distanceKm ?? cartState.distanceKm ?? 0.0;
    final billingConfig = cartState.billingConfig;
    final deliveryFee = billingConfig.deliveryFeeForDistance(dist);
    final packagingFee = billingConfig.packagingFeeFor(cartState.subtotal);
    final gstAmount = billingConfig.gstAmountOn(cartState.subtotal);
    final total = cartState.subtotal +
        (deliveryFee < 0 ? 0 : deliveryFee) +
        packagingFee +
        gstAmount -
        cartState.effectiveDiscount +
        _deliveryTip;
    return total > 0 ? total : 0;
  }

  final List<Map<String, dynamic>> _paymentMethods = [
    {
      'id': 'upi',
      'title': 'Google Pay / PhonePe / UPI',
      'subtitle': 'Fastest & zero transaction fee',
      'icon': Icons.account_balance_wallet_outlined,
      'isPopular': true,
    },
    {
      'id': 'card',
      'title': 'Credit or Debit Card',
      'subtitle': 'Visa, Mastercard, RuPay',
      'icon': Icons.credit_card_outlined,
      'isPopular': false,
    },
    {
      'id': 'netbanking',
      'title': 'Net Banking',
      'subtitle': 'All major Indian banks',
      'icon': Icons.account_balance_outlined,
      'isPopular': false,
    },
    {
      'id': 'cod',
      'title': 'Cash on Delivery',
      'subtitle': 'Pay cash or scan QR at doorstep',
      'icon': Icons.payments_outlined,
      'isPopular': false,
    },
  ];

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CartBloc, CartState>(
      builder: (context, cartState) {
        final authoritativeTotal = _calculateAuthoritativeTotal(cartState);

        return WillPopScope(
          onWillPop: () async {
            // Explicit cancel/abandon: clear the guest attempt ID only when no
            // checkout request is still unresolved. A request that is in flight
            // may already have created the order on the server, so the ID must
            // remain for safe retry.
            if (shouldClearGuestCheckoutAttemptId(
              inFlight: _guestCheckoutInFlight,
              event: GuestCheckoutAttemptEvent.abandoned,
            )) {
              unawaited(sl<PreferencesService>().clearCheckoutAttemptId());
            }
            return true;
          },
          child: Scaffold(
            backgroundColor: BhojanColors.scaffoldBackground,
            appBar: AppBar(
              backgroundColor: BhojanColors.surface,
              elevation: 0,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back, color: BhojanColors.onSurface),
                onPressed: () => context.pop(),
              ),
              title: const Text(
                'Checkout',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: BhojanColors.onSurface,
                ),
              ),
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(1.0),
                child: Container(
                  color: BhojanColors.outline,
                  height: 0.8,
                ),
              ),
            ),
            body: cartState.isEmpty
              ? _buildEmptyState()
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(BhojanDimens.space16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Delivery Address Section
                      _buildSectionHeader(
                          'DELIVERY LOCATION', Icons.location_on),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: BhojanColors.surface,
                          borderRadius: BhojanDimens.roundedCard,
                          border: Border.all(
                              color: !_isServiceable
                                  ? BhojanColors.terracotta
                                  : BhojanColors.outline,
                              width: !_isServiceable ? 1.5 : 0.8),
                          boxShadow: BhojanDimens.cardShadow,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: const BoxDecoration(
                                    color: BhojanColors.primaryContainer,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.home_outlined,
                                    size: 18,
                                    color: BhojanColors.primary,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _selectedAddress.isNotEmpty
                                            ? _selectedAddress
                                            : 'No delivery address selected',
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700,
                                          color: _selectedAddress.isNotEmpty
                                              ? BhojanColors.onSurface
                                              : BhojanColors.terracotta,
                                        ),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 3),
                                      const Text(
                                        'Insulated temperature packaging • Contactless delivery',
                                        style: TextStyle(
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
                                      currentAddress: _selectedAddress,
                                      onAddressSelected: (newAddress) async {
                                        setState(
                                            () => _selectedAddress = newAddress);
                                        await sl<PreferencesService>()
                                            .setActiveAddress(newAddress);
                                        await _checkLiveServiceability();
                                      },
                                    );
                                  },
                                  style: TextButton.styleFrom(
                                    padding:
                                        const EdgeInsets.symmetric(horizontal: 8),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                  child: Text(
                                    _selectedAddress.isNotEmpty ? 'CHANGE' : 'ADD',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: BhojanColors.primary,
                                    ),
                                  ),
                                ),
                              ],
                            ),

                            // Serviceability Banner
                            const SizedBox(height: 10),
                            if (_currentKitchen == null) ...[
                              const SizedBox(
                                height: 20,
                                child: Center(
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation(
                                        BhojanColors.primary),
                                  ),
                                ),
                              ),
                            ] else if (!_isServiceable) ...[
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 8),
                                decoration: BoxDecoration(
                                  color: BhojanColors.terracotta
                                      .withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                      color: BhojanColors.terracotta
                                          .withValues(alpha: 0.4)),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.cancel_outlined,
                                        size: 16,
                                        color: BhojanColors.terracotta),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        _distanceKm != null
                                            ? 'Outside delivery zone (${_distanceKm!.toStringAsFixed(1)} km). Max: ${_currentKitchen!.maxDeliveryRadiusKm?.toStringAsFixed(0) ?? '?'} km.'
                                            : 'Checking delivery zone…',
                                        style: const TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: BhojanColors.terracotta,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ] else ...[
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: BhojanColors.vegGreen
                                      .withValues(alpha: 0.08),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                      color: BhojanColors.vegGreen
                                          .withValues(alpha: 0.3)),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.check_circle_outline,
                                        size: 15,
                                        color: BhojanColors.vegGreen),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        'Serviceable (${_distanceKm!.toStringAsFixed(1)} km) • Delivery: ₹${cartState.deliveryFee} • ETA: ${_currentKitchen!.etaText}',
                                        style: const TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: BhojanColors.vegGreen,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),

                      const SizedBox(height: 20),

                      // Delivery Slot
                      _buildSectionHeader(
                          'DELIVERY TIMING', Icons.timer_outlined),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: _buildSlotOption(
                              id: 'now',
                              title: _isStoreOpenNow
                                  ? 'Standard'
                                  : 'Closed (ASAP)',
                              subtitle: _isStoreOpenNow
                                  ? '25-30 mins'
                                  : 'Opens 9:00 AM',
                              icon: Icons.electric_bolt_outlined,
                              isEnabled: _isStoreOpenNow,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _buildSlotOption(
                              id: 'scheduled',
                              title: _isStoreOpenNow
                                  ? 'Dinner Slot'
                                  : 'Next Slot (Tomorrow)',
                              subtitle: _isStoreOpenNow
                                  ? '7:30 - 8:00 PM'
                                  : 'Lunch 12:30 PM',
                              icon: Icons.calendar_today_outlined,
                              isEnabled: true,
                            ),
                          ),
                        ],
                      ),
                      if (!_isStoreOpenNow) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color: Colors.amber.shade300, width: 0.8),
                          ),
                          child: const Row(
                            children: [
                              Icon(Icons.info_outline,
                                  size: 14, color: Colors.brown),
                              SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  'Kitchen operating hours: 09:00 AM – 10:00 PM IST. Ordering is scheduled for tomorrow.',
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.brown,
                                      fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],

                      const SizedBox(height: 20),

                      // Order Items Summary
                      _buildSectionHeader(
                        'ORDER FROM ${cartState.kitchenName?.toUpperCase() ?? "HOME KITCHEN"}',
                        Icons.soup_kitchen_outlined,
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: BhojanColors.surface,
                          borderRadius: BhojanDimens.roundedCard,
                          border: Border.all(
                              color: BhojanColors.outline, width: 0.8),
                          boxShadow: BhojanDimens.cardShadow,
                        ),
                        child: Column(
                          children: [
                            ...cartState.items.map((item) => Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 6),
                                  child: Row(
                                    children: [
                                      BhojanVegBadge(
                                          isVeg: item.isVeg, size: 14),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          '${item.name} x ${item.quantity}',
                                          style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: BhojanColors.onSurface,
                                          ),
                                        ),
                                      ),
                                      Text(
                                        '₹${item.totalPrice}',
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                          color: BhojanColors.onSurface,
                                        ),
                                      ),
                                    ],
                                  ),
                                )),
                            const Divider(
                                height: 20, color: BhojanColors.outline),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'Delivery Partner Tip (Optional)',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: BhojanColors.onSurfaceVariant,
                                  ),
                                ),
                                Row(
                                  children: [0, 10, 20, 30].map((tip) {
                                    final isSelected = _deliveryTip == tip;
                                    return Padding(
                                      padding: const EdgeInsets.only(left: 6),
                                      child: InkWell(
                                        onTap: () =>
                                            setState(() => _deliveryTip = tip),
                                        borderRadius: BorderRadius.circular(12),
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: isSelected
                                                ? BhojanColors.primary
                                                : BhojanColors
                                                    .surfaceContainerLow,
                                            borderRadius:
                                                BorderRadius.circular(12),
                                            border: Border.all(
                                              color: isSelected
                                                  ? BhojanColors.primary
                                                  : BhojanColors.outline,
                                              width: 0.8,
                                            ),
                                          ),
                                          child: Text(
                                            tip == 0 ? 'No tip' : '₹$tip',
                                            style: TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                              color: isSelected
                                                  ? Colors.white
                                                  : BhojanColors.onSurface,
                                            ),
                                          ),
                                        ),
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 20),

                      // Bill Details Section (Authoritative Server Pricing & Serviceability Fee)
                      _buildSectionHeader('BILL DETAILS', Icons.receipt_long_outlined),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: BhojanColors.surface,
                          borderRadius: BhojanDimens.roundedCard,
                          border: Border.all(
                              color: BhojanColors.outline, width: 0.8),
                          boxShadow: BhojanDimens.cardShadow,
                        ),
                        child: Column(
                          children: [
                            _buildBillRow('Item Total', '₹${cartState.subtotal}'),
                            const SizedBox(height: 8),
                            _buildBillRow(
                              'Delivery Fee (${_isServiceable ? "${_distanceKm!.toStringAsFixed(1)} km" : "Out of range"})',
                              cartState.deliveryFee == 0
                                  ? 'FREE'
                                  : '₹${cartState.deliveryFee}',
                              valueColor: cartState.deliveryFee == 0
                                  ? BhojanColors.vegGreen
                                  : BhojanColors.onSurface,
                            ),
                            const SizedBox(height: 8),
                            _buildBillRow('Packaging Fee',
                                '₹${cartState.packagingFee}'),
                            const SizedBox(height: 8),
                            _buildBillRow(
                                'Taxes & GST (${cartState.billingConfig.gstPercent}%)',
                                '₹${cartState.gstAmount.round()}'),
                            if (_deliveryTip > 0) ...[
                              const SizedBox(height: 8),
                              _buildBillRow('Delivery Tip', '₹$_deliveryTip'),
                            ],
                            if (cartState.effectiveDiscount > 0) ...[
                              const SizedBox(height: 8),
                              _buildBillRow(
                                'Discount (${cartState.promoCode})',
                                '-₹${cartState.effectiveDiscount}',
                                valueColor: BhojanColors.vegGreen,
                              ),
                            ],
                            const Divider(height: 20, color: BhojanColors.outline),
                            _buildBillRow(
                              'To Pay',
                              '₹$authoritativeTotal',
                              isBold: true,
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 20),

                      // Payment Options
                      _buildSectionHeader('PAYMENT METHOD', Icons.payment),
                      const SizedBox(height: 8),
                      Container(
                        decoration: BoxDecoration(
                          color: BhojanColors.surface,
                          borderRadius: BhojanDimens.roundedCard,
                          border: Border.all(
                              color: BhojanColors.outline, width: 0.8),
                          boxShadow: BhojanDimens.cardShadow,
                        ),
                        child: Column(
                          children: _getAvailablePaymentMethods(cartState.kitchenId).map((method) {
                            final isSelected = _selectedPayment == method['id'];
                            return Column(
                              children: [
                                ListTile(
                                  onTap: () => setState(
                                      () => _selectedPayment = method['id']),
                                  leading: Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: isSelected
                                          ? BhojanColors.primaryContainer
                                          : BhojanColors.surfaceContainerLow,
                                      shape: BoxShape.circle,
                                    ),
                                    child: Icon(
                                      method['icon'] as IconData,
                                      size: 18,
                                      color: isSelected
                                          ? BhojanColors.primary
                                          : BhojanColors.onSurfaceVariant,
                                    ),
                                  ),
                                  title: Row(
                                    children: [
                                      Text(
                                        method['title'] as String,
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700,
                                          color: BhojanColors.onSurface,
                                        ),
                                      ),
                                      if (method['isPopular'] as bool) ...[
                                        const SizedBox(width: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: BhojanColors.goldContainer,
                                            borderRadius:
                                                BorderRadius.circular(4),
                                          ),
                                          child: const Text(
                                            'POPULAR',
                                            style: TextStyle(
                                              fontSize: 9,
                                              fontWeight: FontWeight.w800,
                                              color: BhojanColors.goldDark,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                  subtitle: Text(
                                    method['subtitle'] as String,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: BhojanColors.onSurfaceVariant,
                                    ),
                                  ),
                                  trailing: Icon(
                                    isSelected
                                        ? Icons.radio_button_checked
                                        : Icons.radio_button_unchecked,
                                    color: isSelected
                                        ? BhojanColors.primary
                                        : BhojanColors.outlineVariant,
                                  ),
                                ),
                                if (method != _paymentMethods.last)
                                  const Divider(
                                      height: 1, color: BhojanColors.outline),
                              ],
                            );
                          }).toList(),
                        ),
                      ),

                      const SizedBox(height: 20),

                      // Heritage Trust Badge
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: BhojanColors.primaryContainer
                              .withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: BhojanColors.outline, width: 0.8),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.verified,
                                size: 20, color: BhojanColors.primary),
                            SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                'OrderBhojan Guarantee: Authentic home-cooked recipes, insulated temperature packaging, 100% kitchen safety verified.',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: BhojanColors.primaryDark,
                                  height: 1.3,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 24),
                    ],
                  ),
                ),
          bottomNavigationBar: cartState.isEmpty
              ? null
              : SafeArea(
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                    decoration: BoxDecoration(
                      color: BhojanColors.surface,
                      border: const Border(
                        top:
                            BorderSide(color: BhojanColors.outline, width: 0.8),
                      ),
                      boxShadow: BhojanDimens.floatingBarShadow,
                    ),
                    child: Row(
                      children: [
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'TOTAL AMOUNT',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: BhojanColors.onSurfaceVariant,
                                letterSpacing: 0.5,
                              ),
                            ),
                            Text(
                              '₹$authoritativeTotal',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: BhojanColors.onSurface,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: BhojanButton(
                            label: !_isServiceable
                                ? 'Outside Delivery Zone'
                                : _selectedAddress.isEmpty
                                    ? 'Add Delivery Address'
                                    : 'Pay & Place Order',
                            icon: !_isServiceable
                                ? Icons.block
                                : Icons.lock_outline,
                            isLoading: _isPlacingOrder,
                            onPressed: () {
                              if (_selectedAddress.isEmpty || !_isServiceable) {
                                LocationSelectorSheet.show(
                                  context,
                                  currentAddress: _selectedAddress,
                                  onAddressSelected: (newAddress) async {
                                    setState(() => _selectedAddress = newAddress);
                                    await sl<PreferencesService>().setActiveAddress(newAddress);
                                    await _checkLiveServiceability();
                                  },
                                );
                              } else {
                                _handlePlaceOrder(cartState, authoritativeTotal);
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
          ),
        );
    },
  );
}

  Widget _buildSectionHeader(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 14, color: BhojanColors.primary),
        const SizedBox(width: 6),
        Text(
          title,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: BhojanColors.onSurfaceVariant,
            letterSpacing: 0.8,
          ),
        ),
      ],
    );
  }

  Widget _buildBillRow(String label, String value,
      {bool isBold = false, Color? valueColor}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: isBold ? 14 : 12,
            fontWeight: isBold ? FontWeight.w700 : FontWeight.w500,
            color: isBold ? BhojanColors.onSurface : BhojanColors.onSurfaceVariant,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: isBold ? 16 : 13,
            fontWeight: isBold ? FontWeight.w800 : FontWeight.w600,
            color: valueColor ??
                (isBold ? BhojanColors.primary : BhojanColors.onSurface),
          ),
        ),
      ],
    );
  }

  Widget _buildSlotOption({
    required String id,
    required String title,
    required String subtitle,
    required IconData icon,
    bool isEnabled = true,
  }) {
    final isSelected = _selectedSlot == id;
    return Opacity(
      opacity: isEnabled ? 1.0 : 0.5,
      child: InkWell(
        onTap: isEnabled ? () => setState(() => _selectedSlot = id) : null,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isSelected
                ? BhojanColors.surfaceContainerLow
                : BhojanColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? BhojanColors.primary : BhojanColors.outline,
              width: isSelected ? 1.5 : 0.8,
            ),
          ),
          child: Row(
            children: [
              Icon(
                icon,
                size: 20,
                color: isSelected
                    ? BhojanColors.primary
                    : BhojanColors.onSurfaceVariant,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: isSelected
                            ? BhojanColors.primaryDark
                            : BhojanColors.onSurface,
                      ),
                    ),
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
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(BhojanDimens.space32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: BhojanColors.primaryContainer,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.shopping_bag_outlined,
                size: 48,
                color: BhojanColors.primary,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Your Cart is Empty',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: BhojanColors.onSurface,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Explore authentic home kitchens and add your favorite dishes.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: BhojanColors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            BhojanButton(
              label: 'Explore Kitchens',
              width: 180,
              onPressed: () => context.go(AppRoutes.home),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handlePlaceOrder(CartState state, int total) async {
    if (_selectedPayment == 'card' || _selectedPayment == 'netbanking') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Online card payments are currently under maintenance. Please use UPI or Cash on Delivery.',
          ),
          backgroundColor: BhojanColors.terracotta,
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }

    if (_selectedAddress.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select or add a delivery address to proceed.'),
          backgroundColor: BhojanColors.terracotta,
        ),
      );
      LocationSelectorSheet.show(
        context,
        currentAddress: _selectedAddress,
        onAddressSelected: (newAddress) async {
          setState(() => _selectedAddress = newAddress);
          await sl<PreferencesService>().setActiveAddress(newAddress);
          await _checkLiveServiceability();
        },
      );
      return;
    }

    final userCoords = sl<PreferencesService>().getActiveCoordinates();
    if (userCoords == null || userCoords['lat'] == null || userCoords['lng'] == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please confirm your delivery GPS or map location before placing order.'),
          backgroundColor: BhojanColors.terracotta,
        ),
      );
      LocationSelectorSheet.show(
        context,
        currentAddress: _selectedAddress,
        onAddressSelected: (newAddress) async {
          setState(() => _selectedAddress = newAddress);
          await sl<PreferencesService>().setActiveAddress(newAddress);
          await _checkLiveServiceability();
        },
      );
      return;
    }

    if (!_isServiceable) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _currentKitchen == null
                ? 'Serviceability check in progress…'
                : 'Your selected address is outside the delivery zone for this kitchen.',
          ),
          backgroundColor: BhojanColors.terracotta,
        ),
      );
      return;
    }

    final double customerLat = userCoords['lat']!;
    final double customerLng = userCoords['lng']!;

    setState(() => _isPlacingOrder = true);

    String orderId =
        'ORD-${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}';
    final requestToken = const Uuid().v4();
    // Snapshot kitchen metadata at order creation time so the order record
    // stays accurate even if the kitchen's stored address changes later.
    final Kitchen? kitchen = _currentKitchen;
    final kitchenId = state.kitchenId;
    final kitchenName = state.kitchenName;
    // Fail-safe: must have kitchen context to proceed
    if (kitchen == null || kitchenId == null) {
      debugPrint('[CheckoutScreen] Cannot place order: no kitchen context');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Kitchen data unavailable. Please reload.')),
        );
      }
      return;
    }
    // Flow analysis can't track nullability across the early return — assert non-null
    final String kitchenIdNonNull = kitchenId;
    final String? kitchenAddress = kitchen.canonicalAddress;
    // UPI: resolve exclusively from backend /place response
    // Build minimal payload; do NOT construct a local UPI URL from any VPA
    String? upiUrl;

    // Phase 3: Call /prepare to get authoritative backend quote
    // Required for both UPI and COD — ensures price alignment before /place
    if (_currentKitchen != null) {
      try {
        final prepareDio = sl<Dio>();
        final prepareResp = await prepareDio.post(
          '/api/marketplace/checkout/prepare',
          data: {
            'restaurantId': kitchenId,
            'lines': state.items
                .map((item) => {'itemId': item.dishId, 'quantity': item.quantity})
                .toList(),
          },
          options: Options(receiveTimeout: const Duration(seconds: 3)),
        );
        if (prepareResp.statusCode == 200 && prepareResp.data is Map) {
          final q = prepareResp.data['quote'] as Map<String, dynamic>?;
          if (q != null) {
            setState(() => _serverQuote = q);
            final serverGrandTotal = (q['grandTotal'] as num?)?.toInt();
            if (serverGrandTotal != null && serverGrandTotal > 0) {
              // Backend quote available — use it for the order payload
              // (Flutter still calculates locally for display, but sends backend total)
              debugPrint('[CheckoutScreen] Backend quote received: grandTotal=$serverGrandTotal');
            }
          }
        }
      } catch (e) {
        debugPrint('[CheckoutScreen] Prepare API note: $e');
        // Prepare failure is non-fatal — proceed with local calculation
      }
    }

    // Expected amount in paise — backend validates this against quote.grandTotal * 100.
    final int expectedAmountPaise = (_serverQuote?['grandTotal'] as num?)
            ?.toInt() ?? total;
    // Captured from /place response; null for authenticated users,
    // populated as JWT for guests so /guest-tracking works later.
    String? guestTrackingToken;

    try {
      final dio = sl<Dio>();
      final customerPhone = FirebaseAuth.instance.currentUser?.phoneNumber;
      final customerName = FirebaseAuth.instance.currentUser?.displayName;

      final token = KitchenRepository.getContextToken(kitchenId) ?? '';

      // Idempotency: send clientAttemptId for authenticated users and guests.
      // Backend binds the attempt to a phone-derived uid for guests and runs
      // the same atomic Firestore CAS — so a retry with the same attemptId
      // returns the existing order instead of creating a duplicate.
      final String? clientAttemptId;
      if (FirebaseAuth.instance.currentUser != null) {
        clientAttemptId = const Uuid().v4();
      } else {
        final prefs = sl<PreferencesService>();
        final existing = prefs.getCheckoutAttemptId();
        if (existing != null && existing.isNotEmpty) {
          clientAttemptId = existing;
        } else {
          clientAttemptId = const Uuid().v4();
          unawaited(prefs.setCheckoutAttemptId(clientAttemptId));
        }
        // A guest checkout request is now unresolved. Retain the attempt ID
        // until the order is confirmed and persisted locally; otherwise a
        // retry (network blip, timeout, ambiguous response) keeps the server's
        // atomic CAS from creating a duplicate order.
        _guestCheckoutInFlight = true;
      }

      final placePayload = {
        'restaurantId': kitchenId,
        'tenantId': kitchenId,
        'orderId': orderId,
        'requestId': requestToken,
        'clientAttemptId': clientAttemptId,
        'orderSource': 'ORDERBHOJAN',
        'orderType': 'delivery',
        'paymentMethod': _selectedPayment,
        'deliveryTimeSlot': _selectedSlot,
        'phone': customerPhone ?? '',
        'customerName': customerName,
        'lat': customerLat,
        'lng': customerLng,
        if (token.isNotEmpty) 'contextToken': token,
        'quoteExpiresAt': _serverQuote?['expiresAt'],
        'expectedAmountPaise': expectedAmountPaise,
        'lines': state.items
            .map((item) => {
                  'itemId': item.dishId,
                  'quantity': item.quantity,
                  'unitPrice': item.unitPrice,
                  'name': item.name,
                })
            .toList(),
        'deliveryAddress': {
          'displayLabel': _selectedAddress,
          'addressLine1': _selectedAddress,
          'city': 'Pune',
          'state': 'Maharashtra',
          'pincode': '411028',
          'lat': customerLat,
          'lng': customerLng,
        },
        'customer': {
          'id': FirebaseAuth.instance.currentUser?.uid,
          'phone': customerPhone ?? '',
          'name': customerName,
        },
        'tipAmount': _deliveryTip,
        'deliveryFee': state.deliveryFee,
        'totalAmount': _serverQuote != null
            ? (_serverQuote!['grandTotal'] as num?)?.toInt() ?? total
            : total,
      };

      final response = await dio.post(
        '/api/marketplace/checkout/place',
        data: placePayload,
        options: Options(receiveTimeout: const Duration(seconds: 4)),
      );

      if (response.statusCode == 200 && response.data is Map) {
        final data = response.data as Map<String, dynamic>;
        final returnedUpiUrl = data['upiUrl'] as String?;
        if (returnedUpiUrl != null && returnedUpiUrl.isNotEmpty) {
          upiUrl = returnedUpiUrl;
        }
        final backendOrderId = data['orderId'] as String?;
        if (backendOrderId != null && backendOrderId.isNotEmpty) {
          orderId = backendOrderId;
        }
        // Capture guest-tracking JWT for non-logged-in users.
        final token = data['guestTrackingToken'] as String?;
        if (token != null && token.isNotEmpty) {
          guestTrackingToken = token;
          debugPrint('[CheckoutScreen] Guest tracking token captured for orderId=$orderId');
        }
        // A 200 with a Map is a confirmed /place response. The canonical
        // order exists on the server; the attempt ID is now resolved and
        // cleared once the order is persisted locally below.
        _guestCheckoutConfirmed = true;
      }
    } catch (e) {
      debugPrint('[CheckoutScreen] Checkout place API notice: $e');
    }

    setState(() => _isPlacingOrder = false);

    // 2. Handle UPI Payment Flow — block if no backend-provided upiUrl
    if (_selectedPayment == 'upi') {
      if (upiUrl == null || upiUrl.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(
            'UPI configuration unavailable from server. '
            'Please contact support.',
          )),
        );
        return;
      }
      // Launch Android native UPI App Chooser
      try {
        await _platformChannel.invokeMethod('launchUpiIntent', {'upiUrl': upiUrl});
      } catch (e) {
        debugPrint('[CheckoutScreen] Native UPI intent launch note: $e');
      }

      if (!mounted) return;

      // Show authoritative UPI Payment Verification Sheet
      _showUpiVerificationSheet(
        context: context,
        orderId: orderId,
        total: total,
        upiUrl: upiUrl,
        kitchenId: kitchenIdNonNull,
        kitchenName: kitchenName!,
        kitchenAddress: kitchenAddress!,
        kitchen: kitchen,
        state: state,
        guestTrackingToken: guestTrackingToken,
      );
      return;
    }

    // 3. Handle Cash on Delivery (COD) Flow
    final customerOrder = CustomerOrder(
      id: orderId,
      kitchenId: kitchenIdNonNull,
      kitchenName: kitchenName!,
      kitchenAddress: kitchenAddress,
      items: state.items
          .map((item) => CustomerOrderItem(
                id: item.dishId,
                name: item.name,
                qty: item.quantity,
                price: item.unitPrice,
                isVeg: item.isVeg,
                portion: item.customizationSummary,
              ))
          .toList(),
      total: total,
      status: 'confirmed',
      statusStep: 1,
      eta: _selectedSlot == 'now'
          ? 'Arriving in ${kitchen.etaText}'
          : 'Scheduled: Tomorrow Lunch (12:30 PM)',
      paymentMode: 'Cash on Delivery (COD)',
      deliveryAddress: _selectedAddress,
      createdAt: DateTime.now(),
      customerId: FirebaseAuth.instance.currentUser?.uid,
      // Guest identity: use authenticated user's name if logged in, otherwise null
      customerName: FirebaseAuth.instance.currentUser?.displayName ?? null,
      customerPhone: FirebaseAuth.instance.currentUser?.phoneNumber,
      // Guest-tracking JWT — null for authenticated users, populated from /place response for guests
      guestTrackingToken: guestTrackingToken,
    );

    // Persist the canonical order and observe the actual completion of the
    // local save. The guest attempt ID is cleared only after this callback
    // reports success; a failed or ambiguous persistence keeps it for retry.
    context.read<CartBloc>().add(const ClearCartRequested());
    _placeOrderLocally(context, customerOrder, orderId, kitchenName);
  }

  Future<void> _placeOrderLocally(
    BuildContext context,
    CustomerOrder customerOrder,
    String orderId,
    String kitchenName, {
    bool isPendingPayment = false,
    PaymentClaimStatus? claimStatus,
  }) async {
    // Prevent repeated taps from dispatching duplicate persistence for the
    // same canonical order. A retry after a failed persistence reuses the
    // same order ID and is still allowed, because _placingOrderId is reset
    // in both terminal outcomes below.
    if (_placingOrderId == orderId) return;
    _placingOrderId = orderId;

    final completer = Completer<OrderPlaceResult>();
    if (mounted) {
      context.read<OrdersBloc>().add(
            OrderPlaceRequested(customerOrder, completer.complete),
          );
    }

    final result = await completer.future;

    if (!mounted) return;
    if (result.persisted) {
      // Local persistence confirmed. Only now is the guest attempt ID
      // resolved and safe to clear.
      if (_guestCheckoutConfirmed) {
        _guestCheckoutConfirmed = false;
        _guestCheckoutInFlight = false;
        unawaited(sl<PreferencesService>().clearCheckoutAttemptId());
      }
      _placingOrderId = null;
      _showOrderConfirmedDialog(
        context, orderId, kitchenName,
        isPendingPayment: isPendingPayment,
        claimStatus: claimStatus,
      );
    } else {
      // Persistence failed. Keep the attempt ID and the canonical backend
      // order ID so the customer can retry without creating a duplicate.
      _guestCheckoutConfirmed = false;
      _guestCheckoutInFlight = false;
      _placingOrderId = null;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Order saved on the server but not on this device. '
              'Your attempt ID is kept so retrying does not create a duplicate.'),
          duration: Duration(seconds: 4),
        ),
      );
    }
  }

  List<Map<String, dynamic>> _getAvailablePaymentMethods(String? kitchenId) {
    if (kitchenId != null && kitchenId.contains('pune')) {
      return _paymentMethods
          .where((m) => m['id'] == 'upi' || m['id'] == 'cod')
          .toList();
    }
    return _paymentMethods;
  }

  void _showUpiVerificationSheet({
    required BuildContext context,
    required String orderId,
    required int total,
    required String upiUrl,
    required String kitchenId,
    required String kitchenName,
    required String kitchenAddress,
    required Kitchen? kitchen,
    required CartState state,
    String? guestTrackingToken,
  }) {
    final utrController = TextEditingController();
    bool isVerifying = false;

    String payeeVpa = '';
    try {
      final uri = Uri.parse(upiUrl);
      if (uri.queryParameters.containsKey('pa') &&
          uri.queryParameters['pa']!.isNotEmpty) {
        payeeVpa = uri.queryParameters['pa']!;
      }
    } catch (_) {}
    // Block if no valid VPA from server — prevents using wrong tenant's payment
    if (payeeVpa.isEmpty) {
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: BhojanColors.scaffoldBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (bottomSheetCtx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            final bottomPadding = MediaQuery.of(ctx).viewInsets.bottom;
            final qrUrl =
                'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${Uri.encodeComponent(upiUrl)}';

            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 16,
                bottom: bottomPadding + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Sheet Handle
                    Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: BhojanColors.outlineVariant,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Header
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: BhojanColors.primaryContainer,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.account_balance_wallet,
                            color: BhojanColors.primary,
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Complete UPI Payment',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  color: BhojanColors.onSurface,
                                ),
                              ),
                              Text(
                                'Awaiting verification from banking gateway',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: BhojanColors.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, size: 20),
                          onPressed: () => Navigator.pop(bottomSheetCtx),
                        ),
                      ],
                    ),
                    const Divider(height: 24, color: BhojanColors.outline),

                    // Amount & Merchant Box
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: BhojanColors.surface,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                            color: BhojanColors.outline, width: 0.8),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                kitchenName,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: BhojanColors.onSurface,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Order Ref: $orderId',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: BhojanColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                          Text(
                            '₹$total',
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: BhojanColors.primaryDark,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // QR Code
                    Center(
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                              color: BhojanColors.outline, width: 1),
                          boxShadow: BhojanDimens.cardShadow,
                        ),
                        child: Image.network(
                          qrUrl,
                          width: 160,
                          height: 160,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => Container(
                            width: 160,
                            height: 160,
                            alignment: Alignment.center,
                            child: const Text(
                              'Scan UPI QR Code in your App',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 12),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Payee VPA with Copy Action
                    InkWell(
                      onTap: () {
                        Clipboard.setData(ClipboardData(text: payeeVpa));
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                                'UPI ID $payeeVpa copied to clipboard!'),
                            backgroundColor: BhojanColors.primary,
                            duration: const Duration(seconds: 2),
                          ),
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: BhojanColors.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'UPI ID: $payeeVpa',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: BhojanColors.primaryDark,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Icon(Icons.copy,
                                size: 13, color: BhojanColors.primary),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Launch UPI App Button
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.open_in_new, size: 18),
                        label: const Text('Open UPI App (GPay / PhonePe)'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: BhojanColors.primary,
                          side: const BorderSide(
                              color: BhojanColors.primary, width: 1.2),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onPressed: () async {
                          try {
                            await _platformChannel.invokeMethod(
                                'launchUpiIntent', {'upiUrl': upiUrl});
                          } catch (_) {}
                        },
                      ),
                    ),
                    const SizedBox(height: 14),

                    // UTR Reference Input
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: BhojanColors.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: BhojanColors.outline, width: 0.8),
                      ),
                      child: TextField(
                        controller: utrController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          hintText: 'Enter 12-digit UTR / UPI Ref (Optional)',
                          hintStyle: TextStyle(
                              fontSize: 12, color: BhojanColors.textMuted),
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Verify & Complete Button
                    BhojanButton(
                      label: isVerifying
                          ? 'Verifying with Bank...'
                          : 'I Have Paid • Confirm Order',
                      icon: Icons.check_circle_outline,
                      isLoading: isVerifying,
                      onPressed: () async {
                        setSheetState(() => isVerifying = true);

                        final customerPhone =
                            FirebaseAuth.instance.currentUser?.phoneNumber ?? '';

                        // Submit the payment claim through the OrdersBloc so the
                        // outcome is observed. A network failure is NOT a
                        // payment failure: the claim was never received, so the
                        // order stays pending and the customer can retry with the
                        // same order ID. Only a verified claim may show success.
                        final completer = Completer<PaymentClaimResult>();
                        if (context.mounted) {
                          context.read<OrdersBloc>().add(
                                OrderPaymentClaimRequested(
                                  orderId,
                                  customerPhone,
                                  utrController.text.trim().isEmpty
                                      ? null
                                      : utrController.text.trim(),
                                  completer.complete,
                                ),
                              );
                        }
                        final claim = await completer.future;

                        if (claim.status == PaymentClaimStatus.verified) {
                          // Claim recorded. Persist the canonical order locally
                          // with the guest-tracking token from /place and the
                          // claim outcome. This is the only path that may show
                          // payment success.
                          final customerOrder = CustomerOrder(
                            id: orderId,
                            kitchenId: kitchenId,
                            kitchenName: kitchenName,
                            kitchenAddress: kitchenAddress,
                            items: state.items
                                .map((item) => CustomerOrderItem(
                                      id: item.dishId,
                                      name: item.name,
                                      qty: item.quantity,
                                      price: item.unitPrice,
                                      isVeg: item.isVeg,
                                      portion: item.customizationSummary,
                                    ))
                                .toList(),
                            total: total,
                            status: 'pending',
                            statusStep: 0,
                            eta: _selectedSlot == 'now'
                                ? 'Arriving in ${kitchen?.etaText ?? '25-30 mins'}'
                                : 'Scheduled: Tomorrow Lunch (12:30 PM)',
                            paymentMode: 'UPI (Awaiting Verification)',
                            deliveryAddress: _selectedAddress,
                            createdAt: DateTime.now(),
                            customerId:
                                FirebaseAuth.instance.currentUser?.uid,
                            customerName:
                                FirebaseAuth.instance.currentUser?.displayName ??
                                    null,
                            customerPhone:
                                FirebaseAuth.instance.currentUser?.phoneNumber,
                            guestTrackingToken: guestTrackingToken,
                            paymentClaimStatus: claim.status,
                          );

                          if (context.mounted) {
                            context
                                .read<CartBloc>()
                                .add(const ClearCartRequested());
                            _placeOrderLocally(
                                context, customerOrder, orderId, kitchenName,
                                isPendingPayment: true,
                                claimStatus: claim.status,
                            );
                          }
                          if (mounted) {
                            Navigator.pop(bottomSheetCtx);
                          }
                        } else {
                          // Claim failed or was never sent. Keep the canonical
                          // order ID and tracking info; do not show success.
                          setSheetState(() {
                            isVerifying = false;
                          });
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(claim.message != null &&
                                        claim.message!.isNotEmpty
                                    ? 'Payment claim failed: ${claim.message}'
                                    : 'Payment claim failed. Your order ID is '
                                        'kept; retry payment verification from Orders.'),
                                duration: const Duration(seconds: 4),
                              ),
                            );
                          }
                        }
                      },
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showOrderConfirmedDialog(
      BuildContext context, String orderId, String kitchenName,
      {bool isPendingPayment = false, PaymentClaimStatus? claimStatus}) {
    // The canonical order has been persisted locally (OrdersBloc received
    // OrderPlaceRequested). Clear the guest attempt ID so the next guest
    // checkout mints a fresh UUID; the completed order is no longer tied to
    // this attempt.
    if (_guestCheckoutConfirmed) {
      _guestCheckoutConfirmed = false;
      _guestCheckoutInFlight = false;
      final prefs = sl<PreferencesService>();
      unawaited(prefs.clearCheckoutAttemptId());
    }
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: BhojanColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        content: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: isPendingPayment
                      ? BhojanColors.goldContainer
                      : BhojanColors.primaryContainer,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  isPendingPayment
                      ? Icons.hourglass_top_outlined
                      : Icons.check_circle_outline,
                  size: 38,
                  color: isPendingPayment
                      ? BhojanColors.goldDark
                      : BhojanColors.primary,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                isPendingPayment
                    ? 'Order Placed • Verification Pending'
                    : 'Order Placed Successfully!',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: BhojanColors.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                isPendingPayment
                    ? 'Your order from $kitchenName was placed with reference #$orderId. Your UPI payment is awaiting verification by the restaurant POS.'
                    : 'Your meal from $kitchenName is being prepared fresh.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 13,
                  color: BhojanColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 10),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: BhojanColors.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'Order ID: $orderId',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: BhojanColors.primaryDark,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              BhojanButton(
                label: 'Track Live Order',
                onPressed: () {
                  Navigator.pop(dialogCtx);
                  context.push('/tracking/$orderId');
                },
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () {
                  Navigator.pop(dialogCtx);
                  context.go(AppRoutes.home);
                },
                child: const Text(
                  'Back to Home',
                  style: TextStyle(
                    color: BhojanColors.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
