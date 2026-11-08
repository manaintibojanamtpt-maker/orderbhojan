import 'package:equatable/equatable.dart';
import '../../../../features/checkout/domain/billing_config.dart';

class CartItem extends Equatable {
  final String id;
  final String dishId;
  final String name;
  final int unitPrice;
  final int quantity;
  final bool isVeg;
  final String? customizationSummary;
  final String kitchenId;
  final String kitchenName;
  final BillingConfig? billingConfig;

  const CartItem({
    required this.id,
    required this.dishId,
    required this.name,
    required this.unitPrice,
    this.quantity = 1,
    required this.isVeg,
    this.customizationSummary,
    required this.kitchenId,
    required this.kitchenName,
    this.billingConfig,
  });

  int get totalPrice => unitPrice * quantity;

  CartItem copyWith({
    int? quantity,
    BillingConfig? billingConfig,
  }) {
    return CartItem(
      id: id,
      dishId: dishId,
      name: name,
      unitPrice: unitPrice,
      quantity: quantity ?? this.quantity,
      isVeg: isVeg,
      customizationSummary: customizationSummary,
      kitchenId: kitchenId,
      kitchenName: kitchenName,
      billingConfig: billingConfig ?? this.billingConfig,
    );
  }

  @override
  List<Object?> get props => [
        id,
        dishId,
        name,
        unitPrice,
        quantity,
        isVeg,
        customizationSummary,
        kitchenId,
        kitchenName,
        billingConfig,
      ];
}
