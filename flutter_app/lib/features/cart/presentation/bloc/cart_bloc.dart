import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/cart_item.dart';
import 'cart_event.dart';
import 'cart_state.dart';

class CartBloc extends Bloc<CartEvent, CartState> {
  CartBloc() : super(const CartState()) {
    on<AddToCartRequested>(_onAddToCartRequested);
    on<UpdateQuantityRequested>(_onUpdateQuantityRequested);
    on<RemoveFromCartRequested>(_onRemoveFromCartRequested);
    on<ClearCartRequested>(_onClearCartRequested);
  }

  void _onAddToCartRequested(
    AddToCartRequested event,
    Emitter<CartState> emit,
  ) {
    final newItem = event.item;
    // If cart is from another kitchen, prompt/replace
    final isNewKitchen =
        state.kitchenId != null && state.kitchenId != newItem.kitchenId;
    final currentList =
        isNewKitchen ? <CartItem>[] : List<CartItem>.from(state.items);

    final existingIndex = currentList.indexWhere((i) =>
        i.dishId == newItem.dishId &&
        i.customizationSummary == newItem.customizationSummary);

    if (existingIndex >= 0) {
      final existing = currentList[existingIndex];
      currentList[existingIndex] = existing.copyWith(
        quantity: existing.quantity + newItem.quantity,
      );
    } else {
      currentList.add(newItem);
    }

    emit(state.copyWith(
      items: currentList,
      kitchenId: newItem.kitchenId,
      kitchenName: newItem.kitchenName,
      billingConfig: newItem.billingConfig,
    ));
  }

  void _onUpdateQuantityRequested(
    UpdateQuantityRequested event,
    Emitter<CartState> emit,
  ) {
    final currentList = List<CartItem>.from(state.items);
    final index = currentList.indexWhere((i) => i.id == event.cartItemId);
    if (index >= 0) {
      if (event.newQuantity <= 0) {
        currentList.removeAt(index);
      } else {
        currentList[index] =
            currentList[index].copyWith(quantity: event.newQuantity);
      }
    }

    if (currentList.isEmpty) {
      emit(const CartState());
    } else {
      emit(state.copyWith(items: currentList));
    }
  }

  void _onRemoveFromCartRequested(
    RemoveFromCartRequested event,
    Emitter<CartState> emit,
  ) {
    final currentList = List<CartItem>.from(state.items);
    currentList.removeWhere((i) => i.id == event.cartItemId);

    if (currentList.isEmpty) {
      emit(const CartState());
    } else {
      emit(state.copyWith(items: currentList));
    }
  }

  void _onClearCartRequested(
    ClearCartRequested event,
    Emitter<CartState> emit,
  ) {
    emit(const CartState());
  }
}
