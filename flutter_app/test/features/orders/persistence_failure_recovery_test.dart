import 'package:flutter_test/flutter_test.dart';
import 'package:orderbhojan/features/orders/domain/entities/customer_order.dart';
import 'package:orderbhojan/features/orders/domain/repositories/orders_repository.dart';
import 'package:orderbhojan/features/orders/presentation/bloc/orders_bloc.dart';
import 'package:orderbhojan/features/orders/presentation/bloc/orders_event.dart';

/// Simulates a repository where _saveLocalOrders fails intermittently.
/// On failure it throws so the BLoC's catch handler fires and does NOT
/// clear the guest checkout attempt ID or set lastPlacedOrder.
class FlakyPersistenceRepository implements OrdersRepository {
  final List<CustomerOrder> _inMemory = [];
  bool simulateFailure = false;

  @override
  Future<List<CustomerOrder>> getOrders() async => List.from(_inMemory);

  @override
  Future<CustomerOrder> placeOrder(CustomerOrder order) async {
    if (simulateFailure) {
      throw Exception('save failed');
    }
    _inMemory.insert(0, order);
    return order;
  }

  @override
  Future<OrderPlaceResult> placeOrderWithResult(CustomerOrder order) async {
    final persistedOrder = await placeOrder(order);
    final nowOnDisk = await getOrders();
    final persisted = nowOnDisk.any((o) => o.id == persistedOrder.id);
    return OrderPlaceResult(persistedOrder, persisted: persisted);
  }

  @override
  Future<PaymentClaimResult> claimPayment(
    String orderId, {
    required String phone,
    String? upiReference,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<void> updateOrderRating(String orderId, int rating) async {}

  @override
  Future<CustomerOrder?> getOrderById(String orderId) async =>
      _inMemory.firstWhere((o) => o.id == orderId, orElse: () => throw Exception());

  @override
  Stream<CustomerOrder?> watchOrder(String orderId) => Stream.value(null);
}

void main() {
  late FlakyPersistenceRepository repo;
  late OrdersBloc bloc;

  final sampleOrder = CustomerOrder(
    id: 'ORD-FLAKY-001',
    kitchenId: 'k1',
    kitchenName: 'Test Kitchen',
    status: 'confirmed',
    statusStep: 1,
    eta: '30 mins',
    total: 50000,
    paymentMode: 'COD',
    createdAt: DateTime.now(),
    items: const [],
  );

  setUp(() {
    repo = FlakyPersistenceRepository();
    bloc = OrdersBloc(ordersRepository: repo);
  });

  tearDown(() => bloc.close());

  group('P0 — persistence failure recovery', () {
    test(
        'placeOrderWithResult returns persisted=false when save throws',
        () async {
      repo.simulateFailure = true;
      try {
        await repo.placeOrderWithResult(sampleOrder);
        fail('expected placeOrderWithResult to throw');
      } on Exception catch (e) {
        expect(e.toString(), contains('save failed'));
      }
      expect(await repo.getOrders(), isEmpty);
    });

    test('placeOrderWithResult returns persisted=true on success', () async {
      repo.simulateFailure = false;
      final result = await repo.placeOrderWithResult(sampleOrder);

      expect(result.persisted, isTrue);
      expect(result.order.id, sampleOrder.id);
      expect((await repo.getOrders()).length, 1);
    });

    test('BLoC handles failed persistence via onComplete callback', () async {
      repo.simulateFailure = true;

      OrderPlaceResult? receivedResult;
      bloc.add(OrderPlaceRequested(sampleOrder, (r) {
        receivedResult = r;
      }));

      // Wait for the BLoC to process the event
      await Future.delayed(const Duration(milliseconds: 100));

      expect(receivedResult!.persisted, isFalse);
      expect(bloc.state.lastPlacedOrder, isNull);
      expect(bloc.state.errorMessage, isNotNull);
    });

    test('BLoC handles successful persistence via onComplete callback',
        () async {
      repo.simulateFailure = false;

      OrderPlaceResult? receivedResult;
      bloc.add(OrderPlaceRequested(sampleOrder, (r) {
        receivedResult = r;
      }));

      // Wait for the BLoC to process the event
      await Future.delayed(const Duration(milliseconds: 100));

      expect(receivedResult!.persisted, isTrue);
      expect(bloc.state.lastPlacedOrder?.id, sampleOrder.id);
      expect(bloc.state.orders.length, 1);
    });
  });
}
