import '../entities/customer_order.dart';

abstract class OrdersRepository {
  Future<List<CustomerOrder>> getOrders();
  Future<CustomerOrder> placeOrder(CustomerOrder order);
  /// Persists [order] locally and returns the result of that persistence.
  ///
  /// Unlike [placeOrder], the caller observes the actual completion of
  /// `_saveLocalOrders` rather than assuming it from a fire-and-forget BLoC
  /// dispatch. [persisted] is true only when the canonical order was written to
  /// the device's local order cache.
  Future<OrderPlaceResult> placeOrderWithResult(CustomerOrder order);
  Future<void> updateOrderRating(String orderId, int rating);
  Future<CustomerOrder?> getOrderById(String orderId);
  Stream<CustomerOrder?> watchOrder(String orderId);
  /// Submit a customer-side UPI payment claim for [orderId].
  ///
  /// Returns the claim outcome without creating a new order. The authoritative
  /// payment decision still belongs to the POS/backend; this only reports what
  /// the claim call resolved to so the UI can distinguish pending from failed.
  Future<PaymentClaimResult> claimPayment(
    String orderId, {
    required String phone,
    String? upiReference,
  });
}

/// Result of a customer-side order persistence attempt.
class OrderPlaceResult {
  final CustomerOrder order;
  final bool persisted;

  const OrderPlaceResult(this.order, {this.persisted = true});

  bool get success => persisted;
}

/// Outcome of a customer-side UPI payment-claim request.
class PaymentClaimResult {
  final String orderId;
  final PaymentClaimStatus status;
  final String? message;

  const PaymentClaimResult(this.orderId, this.status, {this.message});
}
