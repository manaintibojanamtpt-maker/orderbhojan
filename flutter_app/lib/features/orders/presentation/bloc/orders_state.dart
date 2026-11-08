import 'package:equatable/equatable.dart';
import '../../domain/entities/customer_order.dart';

class OrdersState extends Equatable {
  final List<CustomerOrder> orders;
  final bool isLoading;
  final String? errorMessage;
  final CustomerOrder? lastPlacedOrder;

  const OrdersState({
    this.orders = const [],
    this.isLoading = false,
    this.errorMessage,
    this.lastPlacedOrder,
  });

  List<CustomerOrder> get activeOrders =>
      orders.where((o) => o.isActive).toList();

  List<CustomerOrder> get pastOrders =>
      orders.where((o) => !o.isActive).toList();

  OrdersState copyWith({
    List<CustomerOrder>? orders,
    bool? isLoading,
    String? errorMessage,
    CustomerOrder? lastPlacedOrder,
  }) {
    return OrdersState(
      orders: orders ?? this.orders,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
      lastPlacedOrder: lastPlacedOrder ?? this.lastPlacedOrder,
    );
  }

  @override
  List<Object?> get props => [orders, isLoading, errorMessage, lastPlacedOrder];
}
