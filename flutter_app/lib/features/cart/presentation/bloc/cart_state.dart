import 'package:equatable/equatable.dart';
import '../../domain/entities/cart_item.dart';
import '../../../../features/checkout/domain/billing_config.dart';

class CartState extends Equatable {
  final List<CartItem> items;
  final String? kitchenId;
  final String? kitchenName;
  final String? promoCode;
  final int discountAmount;
  final BillingConfig billingConfig;
  final double? distanceKm;

  const CartState({
    this.items = const [],
    this.kitchenId,
    this.kitchenName,
    this.promoCode = 'BHOJAN50',
    this.discountAmount = 100,
    this.billingConfig = const BillingConfig(),
    this.distanceKm,
  });

  bool get isEmpty => items.isEmpty;
  int get itemCount => items.fold(0, (sum, i) => sum + i.quantity);
  int get subtotal => items.fold(0, (sum, i) => sum + i.totalPrice);

  // Tenant-authoritative getters — delegate to BillingConfig so the
  // checkout display always matches the server's calculation policy.
  int get deliveryFee {
    if (subtotal == 0) return 0;
    final dist = distanceKm ?? 0.0;
    final fee = billingConfig.deliveryFeeForDistance(dist);
    return fee < 0 ? 0 : fee;
  }

  int get packagingFee => billingConfig.packagingFeeFor(subtotal);
  int get gstAmount => billingConfig.gstAmountOn(subtotal);

  int get effectiveDiscount => subtotal > 249 ? discountAmount : 0;

  /// Authoritative total from tenant billing config.
  /// This is what the checkout screen should display — no other code recalculates.
  int get grandTotal {
    if (subtotal == 0) return 0;
    final dist = distanceKm ?? 0.0;
    final fee = billingConfig.deliveryFeeForDistance(dist);
    if (fee < 0) return 0; // treat out-of-zone as zero until gate is shown
    return subtotal +
        fee +
        packagingFee +
        gstAmount -
        effectiveDiscount;
  }

  /// Authoritative total computed from tenant billing config.
  /// Returns null when the customer address is outside the tenant's delivery zone.
  int? authoritativeTotal() {
    if (subtotal == 0) return null;
    final dist = distanceKm ?? 0.0;
    final fee = billingConfig.deliveryFeeForDistance(dist);
    if (fee < 0) return null; // unserviceable
    return subtotal +
        fee +
        packagingFee +
        gstAmount -
        effectiveDiscount;
  }

  CartState copyWith({
    List<CartItem>? items,
    String? kitchenId,
    String? kitchenName,
    String? promoCode,
    int? discountAmount,
    BillingConfig? billingConfig,
    double? distanceKm,
  }) {
    return CartState(
      items: items ?? this.items,
      kitchenId: kitchenId ?? this.kitchenId,
      kitchenName: kitchenName ?? this.kitchenName,
      promoCode: promoCode ?? this.promoCode,
      discountAmount: discountAmount ?? this.discountAmount,
      billingConfig: billingConfig ?? this.billingConfig,
      distanceKm: distanceKm ?? this.distanceKm,
    );
  }

  @override
  List<Object?> get props => [
        items,
        kitchenId,
        kitchenName,
        promoCode,
        discountAmount,
        billingConfig,
        distanceKm,
      ];
}
