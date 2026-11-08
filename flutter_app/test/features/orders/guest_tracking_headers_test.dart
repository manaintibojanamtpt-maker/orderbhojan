import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderbhojan/features/orders/domain/entities/customer_order.dart';
import 'package:orderbhojan/features/orders/domain/repositories/orders_repository.dart';
import 'package:orderbhojan/features/orders/presentation/bloc/orders_bloc.dart';
import 'package:orderbhojan/features/orders/presentation/bloc/orders_event.dart';

/// Repository that records every request made via its store for assertion.
class RecordingRepository implements OrdersRepository {
  final List<Map<String, dynamic>> placed = [];
  final List<Map<String, dynamic>> claimed = [];
  final Map<String, Map<String, dynamic>> localOrders = {};

  @override
  Future<List<CustomerOrder>> getOrders() async =>
      localOrders.values.map((v) => CustomerOrder.fromJson(v)).toList();

  @override
  Future<CustomerOrder> placeOrder(CustomerOrder order) async {
    placed.add({
      'orderId': order.id,
      'guestTrackingToken': order.guestTrackingToken,
      'paymentMode': order.paymentMode,
    });
    localOrders[order.id] = order.toJson();
    return order;
  }

  @override
  Future<OrderPlaceResult> placeOrderWithResult(CustomerOrder order) async {
    final persistedOrder = await placeOrder(order);
    return OrderPlaceResult(persistedOrder, persisted: true);
  }

  @override
  Future<PaymentClaimResult> claimPayment(
    String orderId, {
    required String phone,
    String? upiReference,
  }) async {
    claimed.add({'orderId': orderId, 'phone': phone});
    return PaymentClaimResult(orderId, PaymentClaimStatus.verified);
  }

  @override
  Future<void> updateOrderRating(String orderId, int rating) async {}

  @override
  Future<CustomerOrder?> getOrderById(String orderId) async =>
      localOrders.containsKey(orderId)
          ? CustomerOrder.fromJson(localOrders[orderId]!)
          : null;

  @override
  Stream<CustomerOrder?> watchOrder(String orderId) => Stream.value(null);
}

void main() {
  late RecordingRepository repo;
  late OrdersBloc bloc;

  setUp(() {
    repo = RecordingRepository();
    bloc = OrdersBloc(ordersRepository: repo);
  });

  tearDown(() => bloc.close());

  group('P1 — guest COD and UPI tracking token preservation', () {
    test('guest COD order carries guestTrackingToken into local store',
        () async {
      final order = CustomerOrder(
        id: 'ORD-GUEST-COD',
        kitchenId: 'k1',
        kitchenName: 'Guest Kitchen',
        status: 'confirmed',
        statusStep: 1,
        eta: '30 mins',
        total: 45000,
        paymentMode: 'Cash on Delivery',
        createdAt: DateTime.now(),
        guestTrackingToken: 'guest-jwt-token-abc',
        items: const [],
      );

      OrderPlaceResult? receivedResult;
      bloc.add(OrderPlaceRequested(order, (r) {
        receivedResult = r;
      }));

      // Wait for the BLoC to process the event
      await Future.delayed(const Duration(milliseconds: 100));

      expect(receivedResult!.persisted, isTrue);
      expect(repo.placed.first['orderId'], 'ORD-GUEST-COD');
      expect(repo.placed.first['guestTrackingToken'], 'guest-jwt-token-abc');
    });

    test('guest UPI order also carries guestTrackingToken', () async {
      final order = CustomerOrder(
        id: 'ORD-GUEST-UPI',
        kitchenId: 'k1',
        kitchenName: 'Guest Kitchen',
        status: 'pending',
        statusStep: 0,
        eta: '30 mins',
        total: 60000,
        paymentMode: 'UPI (Awaiting Verification)',
        createdAt: DateTime.now(),
        guestTrackingToken: 'guest-jwt-token-upi',
        paymentClaimStatus: PaymentClaimStatus.pending,
        items: const [],
      );

      OrderPlaceResult? receivedResult;
      bloc.add(OrderPlaceRequested(order, (r) {
        receivedResult = r;
      }));

      await Future.delayed(const Duration(milliseconds: 100));

      expect(receivedResult!.persisted, isTrue);
      final placedRecord =
          repo.placed.firstWhere((p) => p['orderId'] == 'ORD-GUEST-UPI');
      expect(placedRecord['guestTrackingToken'], 'guest-jwt-token-upi');
    });

    test('authenticated user order has null guestTrackingToken', () async {
      final order = CustomerOrder(
        id: 'ORD-AUTH',
        kitchenId: 'k1',
        kitchenName: 'Auth Kitchen',
        status: 'confirmed',
        statusStep: 1,
        eta: '25 mins',
        total: 30000,
        paymentMode: 'Credit Card',
        createdAt: DateTime.now(),
        customerId: 'user-123',
        customerName: 'Alice',
        items: const [],
      );

      OrderPlaceResult? receivedResult;
      bloc.add(OrderPlaceRequested(order, (r) {
        receivedResult = r;
      }));

      await Future.delayed(const Duration(milliseconds: 100));

      expect(receivedResult!.persisted, isTrue);
      expect(repo.placed.first['guestTrackingToken'], isNull);
    });
  });
}
