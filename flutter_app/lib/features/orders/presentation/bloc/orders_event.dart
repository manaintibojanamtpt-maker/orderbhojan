import 'package:equatable/equatable.dart';
import '../../domain/entities/customer_order.dart';
import '../../domain/repositories/orders_repository.dart';

abstract class OrdersEvent extends Equatable {
  const OrdersEvent();

  @override
  List<Object?> get props => [];
}

class OrdersLoadRequested extends OrdersEvent {
  const OrdersLoadRequested();
}

/// Dispatching this event is still fire-and-forget — `Bloc.add` returns void.
/// The optional [onComplete] callback is invoked from inside the BLoC handler
/// after the repository's persistence call has actually completed, so the
/// checkout screen can observe success/failure instead of guessing from an
/// HTTP status code. It is excluded from [props] because closures are not
/// meaningful event identity.
class OrderPlaceRequested extends OrdersEvent {
  final CustomerOrder order;
  final void Function(OrderPlaceResult)? onComplete;

  const OrderPlaceRequested(this.order, [this.onComplete]);

  @override
  List<Object?> get props => [order];
}

/// Customer-side UPI payment claim. The authoritative payment decision still
/// belongs to the POS/backend; this event only reports the claim outcome back
/// to the caller via [onComplete]. It never creates a new order.
class OrderPaymentClaimRequested extends OrdersEvent {
  final String orderId;
  final String phone;
  final String? upiReference;
  final void Function(PaymentClaimResult)? onComplete;

  const OrderPaymentClaimRequested(
    this.orderId,
    this.phone, [
    this.upiReference,
    this.onComplete,
  ]);

  @override
  List<Object?> get props => [orderId, phone, upiReference];
}

/// Submit a rating for [orderId]. The rating is persisted locally and
/// forwarded to Firestore / the feedback endpoint by the repository.
class OrderRateRequested extends OrdersEvent {
  final String orderId;
  final int rating;

  const OrderRateRequested({required this.orderId, required this.rating});

  @override
  List<Object?> get props => [orderId, rating];
}