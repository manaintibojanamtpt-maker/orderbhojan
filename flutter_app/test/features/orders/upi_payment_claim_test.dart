import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderbhojan/features/orders/domain/entities/customer_order.dart';
import 'package:orderbhojan/features/orders/domain/repositories/orders_repository.dart';
import 'package:orderbhojan/features/orders/presentation/bloc/orders_bloc.dart';
import 'package:orderbhojan/features/orders/presentation/bloc/orders_event.dart';
import 'package:orderbhojan/features/orders/presentation/bloc/orders_state.dart';

class ClaimScenarioRepository implements OrdersRepository {
  final CustomerOrder? initialOrder;
  final PaymentClaimStatus claimResult;
  bool throwOnClaim = false;
  CustomerOrder? order;

  ClaimScenarioRepository({
    this.initialOrder,
    this.claimResult = PaymentClaimStatus.verified,
    this.throwOnClaim = false,
  }) : order = initialOrder;

  @override
  Future<List<CustomerOrder>> getOrders() async => order != null ? [order!] : [];

  @override
  Future<CustomerOrder> placeOrder(CustomerOrder raw) async {
    order = raw;
    return raw;
  }

  @override
  Future<OrderPlaceResult> placeOrderWithResult(CustomerOrder raw) async {
    final persistedOrder = await placeOrder(raw);
    return OrderPlaceResult(persistedOrder, persisted: true);
  }

  @override
  Future<PaymentClaimResult> claimPayment(
    String orderId, {
    required String phone,
    String? upiReference,
  }) async {
    if (throwOnClaim) throw Exception('network down');
    if (order != null && order!.id == orderId) {
      order = order!.copyWith(paymentClaimStatus: claimResult);
    } else if (order == null) {
      order = CustomerOrder(
        id: orderId,
        kitchenId: '',
        kitchenName: '',
        total: 0,
        status: 'pending',
        statusStep: 0,
        eta: '',
        paymentMode: 'UPI (Awaiting Verification)',
        createdAt: DateTime.now(),
        paymentClaimStatus: claimResult,
        items: const [],
      );
    }
    return PaymentClaimResult(orderId, claimResult);
  }

  @override
  Future<void> updateOrderRating(String orderId, int rating) async {}

  @override
  Future<CustomerOrder?> getOrderById(String orderId) async => order;

  @override
  Stream<CustomerOrder?> watchOrder(String orderId) => Stream.value(order);
}

void main() {
  late OrdersBloc bloc;

  final baseOrder = CustomerOrder(
    id: 'ORD-PAY-001',
    kitchenId: 'k1',
    kitchenName: 'Kitchen A',
    status: 'pending',
    statusStep: 0,
    eta: '30 mins',
    total: 75000,
    paymentMode: 'UPI (Awaiting Verification)',
    createdAt: DateTime.now(),
    items: const [],
  );

  group('P1 — UPI payment-claim handling', () {
    test('claim verified updates order in state and reports verified', () async {
      bloc = OrdersBloc(
        ordersRepository: ClaimScenarioRepository(
          initialOrder: baseOrder,
          claimResult: PaymentClaimStatus.verified,
        ),
      );
      bloc.add(const OrdersLoadRequested());
      await expectLater(
        bloc.stream,
        emitsInOrder([
          const OrdersState(isLoading: true),
          OrdersState(orders: [baseOrder], isLoading: false),
        ]),
      );
      bloc.add(const OrderPaymentClaimRequested('ORD-PAY-001', '+6281234567890', null));
      await expectLater(
        bloc.stream,
        emits(predicate<OrdersState>((s) =>
            s.orders.isNotEmpty &&
            s.orders.first.paymentClaimStatus == PaymentClaimStatus.verified)),
      );
      bloc.close();
    });

    test('claim pending leaves order with pending status', () async {
      bloc = OrdersBloc(
        ordersRepository: ClaimScenarioRepository(
          initialOrder: baseOrder,
          claimResult: PaymentClaimStatus.pending,
        ),
      );
      bloc.add(const OrdersLoadRequested());
      await expectLater(
        bloc.stream,
        emitsInOrder([
          const OrdersState(isLoading: true),
          OrdersState(orders: [baseOrder], isLoading: false),
        ]),
      );
      bloc.add(const OrderPaymentClaimRequested('ORD-PAY-001', '+6281234567890', null));
      await expectLater(
        bloc.stream,
        emits(predicate<OrdersState>((s) =>
            s.orders.isNotEmpty &&
            s.orders.first.paymentClaimStatus == PaymentClaimStatus.pending)),
      );
      bloc.close();
    });

    test('claim failed reports failed without swallowing the message', () async {
      bloc = OrdersBloc(
        ordersRepository: ClaimScenarioRepository(
          initialOrder: baseOrder,
          claimResult: PaymentClaimStatus.failed,
        ),
      );
      bloc.add(const OrdersLoadRequested());
      await expectLater(
        bloc.stream,
        emitsInOrder([
          const OrdersState(isLoading: true),
          OrdersState(orders: [baseOrder], isLoading: false),
        ]),
      );
      bloc.add(const OrderPaymentClaimRequested('ORD-PAY-001', '+6281234567890', null));
      await expectLater(
        bloc.stream,
        emits(predicate<OrdersState>((s) =>
            s.orders.isNotEmpty &&
            s.orders.first.paymentClaimStatus == PaymentClaimStatus.failed)),
      );
      bloc.close();
    });

    test('network failure during claim preserves pending + order ID (retry-safe)',
        () async {
      final repo = ClaimScenarioRepository(
        initialOrder: baseOrder,
        throwOnClaim: true,
      );
      bloc = OrdersBloc(ordersRepository: repo);
      bloc.add(const OrdersLoadRequested());
      await expectLater(
        bloc.stream,
        emitsInOrder([
          const OrdersState(isLoading: true),
          OrdersState(orders: [baseOrder], isLoading: false),
        ]),
      );

      // Fire the claim — it will throw; catch handler invokes onComplete with pending
      final completer = Completer<void>();
      bloc.add(OrderPaymentClaimRequested(
        'ORD-PAY-001',
        '+6281234567890',
        null,
        (_) => completer.complete(),
      ));
      await completer.future;

      // Catch handler does not emit a new state — verify via repo side-effects
      expect(repo.order!.id, 'ORD-PAY-001');
      expect(repo.order!.paymentClaimStatus, isNull);
      bloc.close();
    });

    test('claim without pre-existing order creates minimal order record',
        () async {
      final repo = ClaimScenarioRepository(
        initialOrder: null,
        claimResult: PaymentClaimStatus.verified,
      );
      bloc = OrdersBloc(ordersRepository: repo);
      // Load returns empty list since repo has no order yet
      bloc.add(const OrdersLoadRequested());
      await expectLater(
        bloc.stream,
        emitsInOrder([
          const OrdersState(isLoading: true),
          const OrdersState(orders: [], isLoading: false),
        ]),
      );

      // Claim on missing order — repo creates placeholder, callback fires
      final completer = Completer<void>();
      bloc.add(OrderPaymentClaimRequested(
        'ORD-PAY-001',
        '+6281234567890',
        null,
        (_) => completer.complete(),
      ));
      await completer.future;

      // State stays empty (BLoC can't update absent order), but repo created it
      expect(bloc.state.orders, isEmpty);
      expect(repo.order!.id, 'ORD-PAY-001');
      expect(repo.order!.paymentClaimStatus, PaymentClaimStatus.verified);
      bloc.close();
    });
  });
}
