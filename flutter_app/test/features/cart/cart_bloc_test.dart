import 'package:flutter_test/flutter_test.dart';
import 'package:orderbhojan/features/cart/domain/entities/cart_item.dart';
import 'package:orderbhojan/features/cart/presentation/bloc/cart_bloc.dart';
import 'package:orderbhojan/features/cart/presentation/bloc/cart_event.dart';
import 'package:orderbhojan/features/cart/presentation/bloc/cart_state.dart';

void main() {
  group('CartBloc Tests', () {
    late CartBloc cartBloc;

    const testItem = CartItem(
      id: 'cart-1',
      dishId: 'dish-biryani-1',
      name: 'Royal Malabar Dum Chicken Biryani',
      unitPrice: 418,
      quantity: 1,
      isVeg: false,
      kitchenId: 'ammachis-kerala-kitchen',
      kitchenName: "Ammachi's Authentic Kitchen",
      customizationSummary: 'Regular • Kaima Rice • Extra Boiled Egg',
    );

    setUp(() {
      cartBloc = CartBloc();
    });

    tearDown(() {
      cartBloc.close();
    });

    test('initial state has empty items list', () {
      expect(cartBloc.state, const CartState());
      expect(cartBloc.state.isEmpty, isTrue);
      expect(cartBloc.state.itemCount, 0);
      expect(cartBloc.state.subtotal, 0);
      expect(cartBloc.state.grandTotal, 0);
    });

    test('adding an item updates items, count, and subtotal', () async {
      cartBloc.add(const AddToCartRequested(testItem));
      await expectLater(
        cartBloc.stream,
        emits(
          predicate<CartState>((state) {
            return state.items.length == 1 &&
                state.itemCount == 1 &&
                state.subtotal == 418 &&
                state.kitchenId == 'ammachis-kerala-kitchen' &&
                state.effectiveDiscount == 100;
          }),
        ),
      );
    });

    test('updating quantity changes total correctly', () async {
      cartBloc.add(const AddToCartRequested(testItem));
      await expectLater(
        cartBloc.stream,
        emits(predicate<CartState>((s) => s.items.length == 1)),
      );

      cartBloc.add(const UpdateQuantityRequested('cart-1', 2));
      await expectLater(
        cartBloc.stream,
        emits(
          predicate<CartState>((state) {
            return state.itemCount == 2 && state.subtotal == 836;
          }),
        ),
      );
    });

    test('removing item resets cart when last item is removed', () async {
      cartBloc.add(const AddToCartRequested(testItem));
      await expectLater(
        cartBloc.stream,
        emits(predicate<CartState>((s) => s.items.length == 1)),
      );

      cartBloc.add(const RemoveFromCartRequested('cart-1'));
      await expectLater(
        cartBloc.stream,
        emits(
          predicate<CartState>((state) {
            return state.isEmpty && state.subtotal == 0;
          }),
        ),
      );
    });

    test('clearing cart resets to initial empty state', () async {
      cartBloc.add(const AddToCartRequested(testItem));
      await expectLater(
        cartBloc.stream,
        emits(predicate<CartState>((s) => s.items.length == 1)),
      );

      cartBloc.add(const ClearCartRequested());
      await expectLater(
        cartBloc.stream,
        emits(const CartState()),
      );
    });
  });
}
