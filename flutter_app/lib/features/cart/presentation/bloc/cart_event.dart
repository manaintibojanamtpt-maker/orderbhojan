import 'package:equatable/equatable.dart';
import '../../domain/entities/cart_item.dart';

abstract class CartEvent extends Equatable {
  const CartEvent();

  @override
  List<Object?> get props => [];
}

class AddToCartRequested extends CartEvent {
  final CartItem item;

  const AddToCartRequested(this.item);

  @override
  List<Object?> get props => [item];
}

class UpdateQuantityRequested extends CartEvent {
  final String cartItemId;
  final int newQuantity;

  const UpdateQuantityRequested(this.cartItemId, this.newQuantity);

  @override
  List<Object?> get props => [cartItemId, newQuantity];
}

class RemoveFromCartRequested extends CartEvent {
  final String cartItemId;

  const RemoveFromCartRequested(this.cartItemId);

  @override
  List<Object?> get props => [cartItemId];
}

class ClearCartRequested extends CartEvent {
  const ClearCartRequested();
}
