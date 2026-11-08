import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/routes/app_router.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/services/preferences_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/widgets/veg_badge.dart';
import '../../../cart/domain/entities/cart_item.dart';
import '../../../../features/checkout/domain/billing_config.dart';
import '../../../cart/presentation/bloc/cart_bloc.dart';
import '../../../cart/presentation/bloc/cart_event.dart';
import '../../../cart/presentation/bloc/cart_state.dart';
import '../../data/models/dish_item.dart';
import '../../data/repositories/kitchen_repository.dart';
import '../../domain/entities/kitchen.dart';

class KitchenMenuScreen extends StatefulWidget {
  final String kitchenId;

  const KitchenMenuScreen({super.key, required this.kitchenId});

  @override
  State<KitchenMenuScreen> createState() => _KitchenMenuScreenState();
}

class _KitchenMenuScreenState extends State<KitchenMenuScreen> {
  final KitchenRepository _kitchenRepository = sl<KitchenRepository>();
  Kitchen? _kitchen;
  List<DishItem> _dishes = [];
  bool _isLoading = true;
  String _selectedCategory = 'ALL';
  bool _vegOnlyFilter = false;
  bool _isFavorite = false;
  StreamSubscription<Kitchen?>? _kitchenSub;
  StreamSubscription<List<DishItem>>? _dishesSub;

  List<String> get _categories {
    final list = <String>['ALL'];
    for (final d in _dishes) {
      final cat = d.category.trim();
      if (cat.isNotEmpty && !list.contains(cat)) {
        list.add(cat);
      }
    }
    return list;
  }

  @override
  void initState() {
    super.initState();
    _isFavorite = sl<PreferencesService>().isKitchenFavorite(widget.kitchenId);
    _loadData();
    _subscribeToLiveBhojanOs();
  }

  void _subscribeToLiveBhojanOs() {
    _kitchenSub = _kitchenRepository.watchKitchen(widget.kitchenId).listen((k) {
      if (mounted && k != null) {
        setState(() => _kitchen = k);
      }
    });

    _dishesSub = _kitchenRepository
        .watchDishesForKitchen(widget.kitchenId)
        .listen((dishes) {
      if (mounted && dishes.isNotEmpty) {
        setState(() => _dishes = dishes);
      }
    });
  }

  @override
  void dispose() {
    _kitchenSub?.cancel();
    _dishesSub?.cancel();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final kitchen = await _kitchenRepository.getKitchenById(widget.kitchenId);
    final dishes =
        await _kitchenRepository.getDishesForKitchen(widget.kitchenId);
    setState(() {
      _kitchen = kitchen;
      _dishes = dishes;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading || _kitchen == null) {
      return const Scaffold(
        backgroundColor: BhojanColors.scaffoldBackground,
        body: Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(BhojanColors.primary),
          ),
        ),
      );
    }

    final filteredDishes = _dishes.where((dish) {
      if (_vegOnlyFilter && !dish.isVeg) return false;
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: BhojanColors.scaffoldBackground,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: BhojanColors.onSurface),
          onPressed: () => context.pop(),
        ),
        title: Text(
          _kitchen!.name,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: BhojanColors.onSurface,
          ),
        ),
        actions: [
          IconButton(
            icon:
                const Icon(Icons.share_outlined, color: BhojanColors.onSurface),
            onPressed: () {
              Clipboard.setData(ClipboardData(
                  text:
                      'Order from ${_kitchen?.name ?? "Kitchen"} on OrderBhojan: https://orderbhojan.com/kitchen/${widget.kitchenId}'));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content:
                      Text('Kitchen link copied! Share with family & friends.'),
                  backgroundColor: BhojanColors.primary,
                ),
              );
            },
          ),
          IconButton(
            icon: Icon(
              _isFavorite ? Icons.favorite : Icons.favorite_border,
              color: _isFavorite
                  ? BhojanColors.terracotta
                  : BhojanColors.onSurface,
            ),
            onPressed: () async {
              final isFav = await sl<PreferencesService>()
                  .toggleFavoriteKitchen(widget.kitchenId);
              if (!mounted) return;
              setState(() => _isFavorite = isFav);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(isFav
                      ? 'Saved to your favorite kitchens'
                      : 'Removed from favorites'),
                  duration: const Duration(seconds: 1),
                  backgroundColor: BhojanColors.primary,
                ),
              );
            },
          ),
        ],
      ),
      bottomNavigationBar: BlocBuilder<CartBloc, CartState>(
        builder: (context, cartState) {
          if (cartState.isEmpty) return const SizedBox.shrink();
          return Container(
            color: Colors.transparent,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: BhojanColors.onSurface,
                borderRadius: BorderRadius.circular(30),
                boxShadow: BhojanDimens.floatingBarShadow,
              ),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: const BoxDecoration(
                      color: BhojanColors.primary,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.shopping_bag,
                        size: 18, color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${cartState.itemCount} ITEM • ₹${cartState.subtotal}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          'From ${_kitchen!.name}',
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.white.withOpacity(0.8),
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  ElevatedButton(
                    onPressed: () => context.go(AppRoutes.cart),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: BhojanColors.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                      ),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      elevation: 0,
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'View Cart',
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700),
                        ),
                        SizedBox(width: 4),
                        Icon(Icons.arrow_forward, size: 14),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Hero Cover Visual
            Stack(
              children: [
                Image.network(
                  _kitchen!.imageUrl,
                  height: 180,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    height: 180,
                    color: BhojanColors.surfaceContainerHigh,
                    child: const Center(
                      child: Icon(Icons.soup_kitchen,
                          size: 48, color: BhojanColors.primary),
                    ),
                  ),
                ),
                Positioned(
                  bottom: 12,
                  left: 16,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.95),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.verified,
                            size: 14, color: BhojanColors.vegGreen),
                        SizedBox(width: 4),
                        Text(
                          'Home Kitchen Verified',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: BhojanColors.onSurface,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),

            // Overview Card
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Container(
                padding: const EdgeInsets.all(BhojanDimens.space16),
                decoration: BoxDecoration(
                  color: BhojanColors.surface,
                  borderRadius: BhojanDimens.roundedCard,
                  border: Border.all(color: BhojanColors.outline, width: 0.8),
                  boxShadow: BhojanDimens.cardShadow,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _kitchen!.name,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: BhojanColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _kitchen!.cuisines.join(' • '),
                      style: const TextStyle(
                        fontSize: 13,
                        color: BhojanColors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Metrics Row
                    Row(
                      children: [
                        if (!_kitchen!.isOpen) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: Colors.red.shade700,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'CLOSED',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text('•',
                              style: TextStyle(color: BhojanColors.textMuted)),
                          const SizedBox(width: 8),
                          const Text(
                            'Opens at 9:00 AM',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.red,
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text('•',
                              style: TextStyle(color: BhojanColors.textMuted)),
                          const SizedBox(width: 8),
                        ],
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: BhojanColors.vegGreen,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _kitchen!.rating.toString(),
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(width: 2),
                              const Icon(Icons.star,
                                  size: 12, color: Colors.white),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text('•',
                            style: TextStyle(color: BhojanColors.textMuted)),
                        const SizedBox(width: 8),
                        const Icon(Icons.schedule,
                            size: 15, color: BhojanColors.primary),
                        const SizedBox(width: 4),
                        Text(_kitchen!.etaText,
                            style: const TextStyle(
                                fontSize: 12,
                                color: BhojanColors.onSurfaceVariant)),
                        const SizedBox(width: 8),
                        const Text('•',
                            style: TextStyle(color: BhojanColors.textMuted)),
                        const SizedBox(width: 8),
                        const Icon(Icons.near_me,
                            size: 15, color: BhojanColors.textMuted),
                        const SizedBox(width: 4),
                        Text('${_kitchen!.distanceKm} km',
                            style: const TextStyle(
                                fontSize: 12,
                                color: BhojanColors.onSurfaceVariant)),
                        const SizedBox(width: 8),
                        const Text('•',
                            style: TextStyle(color: BhojanColors.textMuted)),
                        const SizedBox(width: 8),
                        Text('₹${_kitchen!.priceForTwo} for two',
                            style: const TextStyle(
                                fontSize: 12,
                                color: BhojanColors.onSurfaceVariant)),
                      ],
                    ),

                    if (_kitchen!.offer != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: BhojanColors.primaryContainer.withOpacity(0.5),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.local_offer,
                                size: 16, color: BhojanColors.primaryDark),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _kitchen!.offer!,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: BhojanColors.primaryDark,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),

            // Search in Kitchen + Veg Toggle Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 42,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: BhojanColors.surface,
                        borderRadius: BorderRadius.circular(20),
                        border:
                            Border.all(color: BhojanColors.outline, width: 0.8),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.search,
                              size: 18, color: BhojanColors.textMuted),
                          SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Search dishes in kitchen...',
                              style: TextStyle(
                                  fontSize: 13, color: BhojanColors.textMuted),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilterChip(
                    avatar: const BhojanVegBadge(isVeg: true, size: 12),
                    label: const Text('Veg', style: TextStyle(fontSize: 12)),
                    selected: _vegOnlyFilter,
                    onSelected: (val) {
                      setState(() => _vegOnlyFilter = val);
                    },
                    selectedColor: BhojanColors.primaryContainer,
                    backgroundColor: BhojanColors.surface,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                      side: const BorderSide(
                          color: BhojanColors.outline, width: 0.8),
                    ),
                  ),
                ],
              ),
            ),

            // Category Tabs
            if (_categories.isNotEmpty)
              SizedBox(
                height: 48,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _categories.length,
                  itemBuilder: (context, index) {
                    final cat = _categories[index];
                    final isSelected = cat == _selectedCategory;
                    final count = cat == 'ALL'
                        ? filteredDishes.length
                        : filteredDishes
                            .where((d) => d.category.trim() == cat)
                            .length;
                    final label = '$cat · $count';
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(label),
                        selected: isSelected,
                        onSelected: (val) {
                          setState(() => _selectedCategory = cat);
                        },
                        selectedColor: BhojanColors.primary,
                        labelStyle: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: isSelected
                              ? Colors.white
                              : BhojanColors.onSurfaceVariant,
                        ),
                        backgroundColor: BhojanColors.surface,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                          side: BorderSide(
                            color: isSelected
                                ? BhojanColors.primary
                                : BhojanColors.outline,
                            width: 0.8,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),

            // Menu Items List
            Padding(
              padding: const EdgeInsets.all(BhojanDimens.space16),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  return Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 780),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (_selectedCategory == 'ALL') ...[
                            // Group dishes by category
                            for (final cat in _categories.where((c) => c != 'ALL')) ...[
                              if (filteredDishes.any((d) => d.category.trim() == cat)) ...[
                                Padding(
                                  padding: const EdgeInsets.only(top: 8, bottom: 12),
                                  child: Text(
                                    cat,
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w800,
                                      color: BhojanColors.onSurface,
                                    ),
                                  ),
                                ),
                                ...filteredDishes
                                    .where((d) => d.category.trim() == cat)
                                    .map((dish) => _buildDishCard(dish)),
                              ],
                            ],
                            // Any dishes without a specific category
                            if (filteredDishes.any((d) =>
                                d.category.trim().isEmpty ||
                                !_categories.contains(d.category.trim()))) ...[
                              ...filteredDishes
                                  .where((d) =>
                                      d.category.trim().isEmpty ||
                                      !_categories.contains(d.category.trim()))
                                  .map((dish) => _buildDishCard(dish)),
                            ],
                          ] else ...[
                            Padding(
                              padding: const EdgeInsets.only(top: 8, bottom: 12),
                              child: Text(
                                _selectedCategory,
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  color: BhojanColors.onSurface,
                                ),
                              ),
                            ),
                            ...filteredDishes
                                .where((d) => d.category.trim() == _selectedCategory)
                                .map((dish) => _buildDishCard(dish)),
                          ],
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }

  Widget _buildDishCard(DishItem dish) {
    return BlocBuilder<CartBloc, CartState>(
      builder: (context, cartState) {
        final existingInCart =
            cartState.items.where((i) => i.dishId == dish.id).toList();
        final currentQty = existingInCart.fold(0, (sum, i) => sum + i.quantity);

        return Container(
          margin: const EdgeInsets.only(bottom: BhojanDimens.space16),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: BhojanColors.surface,
            borderRadius: BhojanDimens.roundedCard,
            border: Border.all(color: BhojanColors.outline, width: 0.8),
            boxShadow: BhojanDimens.cardShadow,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Dish Info
              Expanded(
                child: InkWell(
                  onTap: () {
                    context.push('/dish/${dish.id}');
                  },
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          BhojanVegBadge(isVeg: dish.isVeg, size: 14),
                          if (dish.isBestseller) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: BhojanColors.goldContainer,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                'Bestseller',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: BhojanColors.goldDark,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        dish.name,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: BhojanColors.onSurface,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(
                            '₹${dish.price}',
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: BhojanColors.onSurface,
                            ),
                          ),
                          if (dish.originalPrice != null) ...[
                            const SizedBox(width: 6),
                            Text(
                              '₹${dish.originalPrice}',
                              style: const TextStyle(
                                fontSize: 13,
                                color: BhojanColors.textMuted,
                                decoration: TextDecoration.lineThrough,
                              ),
                            ),
                          ],
                        ],
                      ),
                      if (dish.description.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          dish.description,
                          style: const TextStyle(
                            fontSize: 12,
                            color: BhojanColors.onSurfaceVariant,
                            height: 1.3,
                          ),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              const SizedBox(width: 12),

              // Image + Add/Stepper button
              SizedBox(
                width: 90,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: _buildDishImageWidget(dish.imageUrl),
                    ),
                    const SizedBox(height: 6),
                  if (!dish.isAvailable)
                    Container(
                      height: 32,
                      width: 90,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: BhojanColors.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: BhojanColors.outline),
                      ),
                      child: const Text(
                        'OUT OF STOCK',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: BhojanColors.textMuted,
                        ),
                      ),
                    )
                  else if (_kitchen?.isOpen == false)
                    Container(
                      height: 32,
                      width: 90,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: BhojanColors.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'CLOSED',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: BhojanColors.textMuted,
                        ),
                      ),
                    )
                  else if (currentQty == 0)
                    SizedBox(
                      height: 32,
                      width: 90,
                      child: ElevatedButton(
                        onPressed: () {
                          if (dish.portionOptions.isNotEmpty) {
                            context.push('/dish/${dish.id}');
                          } else {
                            context.read<CartBloc>().add(
                                  AddToCartRequested(
                                    CartItem(
                                      id:
                                          '${dish.id}_${DateTime.now().millisecondsSinceEpoch}',
                                      dishId: dish.id,
                                      name: dish.name,
                                      unitPrice: dish.price,
                                      isVeg: dish.isVeg,
                                      kitchenId: _kitchen!.id,
                                      kitchenName: _kitchen!.name,
                                      billingConfig: const BillingConfig(
                                        gstPercent: 0,
                                        packagingFee: 10,
                                        baseDeliveryFee: 40,
                                        freeDeliveryRadiusKm: 2.0,
                                        baseDeliveryRadiusKm: 7.0,
                                        maxDeliveryRadiusKm: 15.0,
                                        additionalFeePerKm: 10,
                                      ),
                                    ),
                                  ),
                                );
                          }
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: BhojanColors.primary,
                          elevation: 1,
                          side: const BorderSide(
                              color: BhojanColors.primary, width: 1.2),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                          ),
                          minimumSize: const Size(90, 32),
                          padding: EdgeInsets.zero,
                          visualDensity: VisualDensity.compact,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text('ADD',
                                style: TextStyle(
                                    fontSize: 12, fontWeight: FontWeight.w800)),
                            SizedBox(width: 2),
                            Icon(Icons.add, size: 14),
                          ],
                        ),
                      ),
                    )
                  else
                    Container(
                      height: 32,
                      width: 90,
                      decoration: BoxDecoration(
                        color: BhojanColors.primary,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          InkWell(
                            onTap: () {
                              final item = existingInCart.first;
                              context.read<CartBloc>().add(
                                    UpdateQuantityRequested(
                                        item.id, item.quantity - 1),
                                  );
                            },
                            child: const Icon(Icons.remove,
                                size: 16, color: Colors.white),
                          ),
                          Text(
                            currentQty.toString(),
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                          InkWell(
                            onTap: () {
                              final item = existingInCart.first;
                              context.read<CartBloc>().add(
                                    UpdateQuantityRequested(
                                        item.id, item.quantity + 1),
                                  );
                            },
                            child: const Icon(Icons.add,
                                size: 16, color: Colors.white),
                          ),
                        ],
                      ),
                    ),
                  if (dish.portionOptions.isNotEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Text(
                        'Customisable',
                        style: TextStyle(
                            fontSize: 10, color: BhojanColors.textMuted),
                      ),
                    ),
                ],
              ),
            ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDishImageWidget(String imageUrl) {
    if (imageUrl.startsWith('data:image')) {
      try {
        final commaIdx = imageUrl.indexOf(',');
        if (commaIdx != -1) {
          final base64Str = imageUrl.substring(commaIdx + 1);
          final bytes = base64Decode(base64Str);
          return Image.memory(
            bytes,
            width: 90,
            height: 90,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _buildImagePlaceholder(),
          );
        }
      } catch (_) {}
    } else if (imageUrl.startsWith('http')) {
      return Image.network(
        imageUrl,
        width: 90,
        height: 90,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildImagePlaceholder(),
      );
    }
    return _buildImagePlaceholder();
  }

  Widget _buildImagePlaceholder() {
    return Container(
      width: 90,
      height: 90,
      decoration: BoxDecoration(
        color: BhojanColors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Icon(
        Icons.restaurant,
        color: BhojanColors.primary,
        size: 30,
      ),
    );
  }
}
