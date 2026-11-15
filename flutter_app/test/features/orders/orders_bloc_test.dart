import 'package:flutter_test/flutter_test.dart';
import 'package:orderbhojan/features/orders/domain/entities/customer_order.dart';
import 'package:orderbhojan/features/orders/domain/repositories/orders_repository.dart';
import 'package:orderbhojan/features/orders/presentation/bloc/orders_bloc.dart';
import 'package:orderbhojan/features/orders/presentation/bloc/orders_event.dart';
import 'package:orderbhojan/features/orders/presentation/bloc/orders_state.dart';

class FakeOrdersRepository implements OrdersRepository {
  List<CustomerOrder> orders = [];

  @override
  Future<List<CustomerOrder>> getOrders() async {
    return List.from(orders);
  }

  @override
  Future<CustomerOrder> placeOrder(CustomerOrder order) async {
    orders.insert(0, order);
    return order;
  }

  @override
  Future<OrderPlaceResult> placeOrderWithResult(CustomerOrder order) async {
    final persistedOrder = await placeOrder(order);
    final persisted = orders.any((o) => o.id == persistedOrder.id);
    return OrderPlaceResult(persistedOrder, persisted: persisted);
  }

  @override
  Future<PaymentClaimResult> claimPayment(
    String orderId, {
    required String phone,
    String? upiReference,
  }) async {
    final existingIdx = orders.indexWhere((o) => o.id == orderId);
    if (existingIdx != -1) {
      orders[existingIdx] = orders[existingIdx].copyWith(
        paymentClaimStatus: PaymentClaimStatus.verified,
      );
    }
    return PaymentClaimResult(orderId, PaymentClaimStatus.verified);
  }

  @override
  Future<void> updateOrderRating(String orderId, int rating) async {
    final idx = orders.indexWhere((o) => o.id == orderId);
    if (idx != -1) {
      orders[idx] = orders[idx].copyWith(rating: rating);
    }
  }

  @override
  Future<CustomerOrder?> getOrderById(String orderId) async {
    try {
      return orders.firstWhere((o) => o.id == orderId);
    } catch (_) {
      return null;
    }
  }

  @override
  Stream<CustomerOrder?> watchOrder(String orderId) {
    try {
      final order = orders.firstWhere((o) => o.id == orderId);
      return Stream.value(order);
    } catch (_) {
      return Stream.value(null);
    }
  }
}

void main() {
  late FakeOrdersRepository fakeRepo;
  late OrdersBloc ordersBloc;

  final sampleOrder = CustomerOrder(
    id: 'ORD-TEST-001',
    kitchenId: 'ammachis-kerala-kitchen',
    kitchenName: "Ammachi's Authentic Kitchen",
    kitchenAddress: 'Indiranagar 12th Main',
    status: 'cooking',
    statusStep: 2,
    eta: '20 mins',
    total: 350,
    paymentMode: 'UPI (Google Pay)',
    deliveryAddress: 'Home, Indiranagar',
    createdAt: DateTime.now(),
    items: const [
      CustomerOrderItem(
        id: 'biryani-1',
        name: 'Royal Dum Biryani',
        qty: 1,
        price: 350,
        isVeg: false,
      ),
    ],
  );

  setUp(() {
    fakeRepo = FakeOrdersRepository();
    fakeRepo.orders = [sampleOrder];
    ordersBloc = OrdersBloc(ordersRepository: fakeRepo);
  });

  tearDown(() {
    ordersBloc.close();
  });

  group('OrdersBloc Tests', () {
    test('initial state has empty orders and not loading', () {
      expect(ordersBloc.state.orders, isEmpty);
      expect(ordersBloc.state.isLoading, false);
    });

    test('OrdersLoadRequested populates orders', () async {
      ordersBloc.add(const OrdersLoadRequested());
      await expectLater(
        ordersBloc.stream,
        emitsInOrder([
          const OrdersState(isLoading: true),
          OrdersState(orders: [sampleOrder], isLoading: false),
        ]),
      );
    });

    test('OrderPlaceRequested adds order to state', () async {
      final newOrder = sampleOrder.copyWith(status: 'confirmed');
      ordersBloc.add(OrderPlaceRequested(newOrder));

      await expectLater(
        ordersBloc.stream,
        emitsInOrder([
          const OrdersState(isLoading: true),
          OrdersState(
            orders: [newOrder],
            isLoading: false,
            lastPlacedOrder: newOrder,
          ),
        ]),
      );
      expect(fakeRepo.orders.length, 2);
    });

    test('OrderRateRequested updates rating in state and repository', () async {
      ordersBloc.add(const OrdersLoadRequested());
      await expectLater(
        ordersBloc.stream,
        emitsInOrder([
          const OrdersState(isLoading: true),
          OrdersState(orders: [sampleOrder], isLoading: false),
        ]),
      );

      ordersBloc.add(
        const OrderRateRequested(orderId: 'ORD-TEST-001', rating: 5),
      );

      await expectLater(
        ordersBloc.stream,
        emits(predicate<OrdersState>((s) =>
            s.orders.first.rating == 5 && s.orders.first.id == 'ORD-TEST-001')),
      );
      expect(fakeRepo.orders.first.rating, 5);
    });
  });
}
