import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/customer_order.dart';
import '../../domain/repositories/orders_repository.dart';
import 'orders_event.dart';
import 'orders_state.dart';

class OrdersBloc extends Bloc<OrdersEvent, OrdersState> {
  final OrdersRepository _ordersRepository;

  OrdersBloc({required OrdersRepository ordersRepository})
      : _ordersRepository = ordersRepository,
        super(const OrdersState()) {
    on<OrdersLoadRequested>(_onLoadRequested);
    on<OrderPlaceRequested>(_onPlaceRequested);
    on<OrderPaymentClaimRequested>(_onClaimRequested);
    on<OrderRateRequested>(_onRateRequested);
  }

  Future<void> _onLoadRequested(
    OrdersLoadRequested event,
    Emitter<OrdersState> emit,
  ) async {
    emit(state.copyWith(isLoading: true, errorMessage: null));
    try {
      final orders = await _ordersRepository.getOrders();
      emit(state.copyWith(orders: orders, isLoading: false));
    } catch (e) {
      emit(state.copyWith(
        isLoading: false,
        errorMessage: 'Unable to load orders: $e',
      ));
    }
  }

  Future<void> _onPlaceRequested(
    OrderPlaceRequested event,
    Emitter<OrdersState> emit,
  ) async {
    emit(state.copyWith(isLoading: true));
    try {
      // Observe the actual persistence result instead of assuming it from a
      // fire-and-forget dispatch. A failed local save must not clear the
      // guest checkout attempt ID or mark the order as locally confirmed.
      final result = await _ordersRepository.placeOrderWithResult(event.order);
      final placed = result.order;
      final updatedOrders = [placed, ...state.orders];
      emit(state.copyWith(
        orders: updatedOrders,
        isLoading: false,
        lastPlacedOrder: placed,
      ));
      event.onComplete?.call(result);
    } catch (e) {
      emit(state.copyWith(
        isLoading: false,
        errorMessage: 'Failed to place order: $e',
      ));
      // On failure, do NOT set lastPlacedOrder — caller should not treat this as success.
      event.onComplete?.call(OrderPlaceResult(
        CustomerOrder(
          id: '',
          kitchenId: '',
          kitchenName: '',
          total: 0,
          status: 'pending',
          statusStep: 0,
          eta: '',
          paymentMode: '',
          items: const [],
          createdAt: DateTime.now(),
        ),
        persisted: false,
      ));
    }
  }

  Future<void> _onClaimRequested(
    OrderPaymentClaimRequested event,
    Emitter<OrdersState> emit,
  ) async {
    try {
      final result = await _ordersRepository.claimPayment(
        event.orderId,
        phone: event.phone,
        upiReference: event.upiReference,
      );
      final updated = state.orders.map((o) {
        if (o.id == event.orderId) {
          return o.copyWith(paymentClaimStatus: result.status);
        }
        return o;
      }).toList();
      emit(state.copyWith(orders: updated));
      event.onComplete?.call(result);
    } catch (e) {
      event.onComplete?.call(PaymentClaimResult(
        event.orderId,
        PaymentClaimStatus.pending,
        message: 'Payment claim not sent: $e',
      ));
    }
  }

  Future<void> _onRateRequested(
    OrderRateRequested event,
    Emitter<OrdersState> emit,
  ) async {
    try {
      await _ordersRepository.updateOrderRating(event.orderId, event.rating);
      final updated = state.orders.map((o) {
        if (o.id == event.orderId) {
          return o.copyWith(rating: event.rating);
        }
        return o;
      }).toList();
      emit(state.copyWith(orders: updated));
    } catch (e) {
      emit(state.copyWith(errorMessage: 'Failed to submit rating: $e'));
    }
  }
}