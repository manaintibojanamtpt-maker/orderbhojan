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
import '../../../cart/presentation/bloc/cart_bloc.dart';
import '../../../cart/presentation/bloc/cart_event.dart';
import '../../data/models/dish_item.dart';
import '../../data/repositories/kitchen_repository.dart';

class FoodDetailsScreen extends StatefulWidget {
  final String dishId;

  const FoodDetailsScreen({super.key, required this.dishId});

  @override
  State<FoodDetailsScreen> createState() => _FoodDetailsScreenState();
}

class _FoodDetailsScreenState extends State<FoodDetailsScreen> {
  final KitchenRepository _kitchenRepository = sl<KitchenRepository>();
  DishItem? _dish;
  bool _isLoading = true;
  bool _isFavorite = false;

  int _quantity = 1;
  CustomizationOption? _selectedPortion;
  CustomizationOption? _selectedRice;
  final Set<CustomizationOption> _selectedAddons = {};
  String _selectedSpice = 'Medium 🔥';
  final TextEditingController _notesController = TextEditingController();

  final List<String> _quickInstructions = [
    'No Onion/Garlic',
    'Extra Raita',
    'Cutlery not needed',
  ];

  @override
  void initState() {
    super.initState();
    _isFavorite = sl<PreferencesService>().isDishFavorite(widget.dishId);
    _loadDish();
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadDish() async {
    setState(() => _isLoading = true);
    final dish = await _kitchenRepository.getDishById(widget.dishId);
    setState(() {
      _dish = dish;
      if (dish != null) {
        if (dish.portionOptions.isNotEmpty) {
          _selectedPortion = dish.portionOptions.first;
        }
        if (dish.riceOptions.isNotEmpty) {
          _selectedRice = dish.riceOptions.first;
        }
      }
      _isLoading = false;
    });
  }

  int get _calculatedUnitPrice {
    if (_dish == null) return 0;
    int total = _dish!.price;
    if (_selectedPortion != null) {
      total += _selectedPortion!.extraPrice;
    }
    if (_selectedRice != null) {
      total += _selectedRice!.extraPrice;
    }
    for (final addon in _selectedAddons) {
      total += addon.extraPrice;
    }
    return total;
  }

  int get _calculatedTotalPrice => _calculatedUnitPrice * _quantity;

  String get _customizationSummary {
    final list = <String>[];
    if (_selectedPortion != null) list.add(_selectedPortion!.name);
    if (_selectedRice != null) list.add(_selectedRice!.name);
    if (_selectedAddons.isNotEmpty) {
      list.add(_selectedAddons.map((a) => a.name).join(', '));
    }
    list.add(_selectedSpice);
    if (_notesController.text.trim().isNotEmpty) {
      list.add('Note: ${_notesController.text.trim()}');
    }
    return list.join(' • ');
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading || _dish == null) {
      return const Scaffold(
        backgroundColor: BhojanColors.scaffoldBackground,
        body: Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(BhojanColors.primary),
          ),
        ),
      );
    }

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
        title: const Text(
          'Customize Dish',
          style: TextStyle(
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
                      'Order delicious ${_dish?.name ?? "dish"} on OrderBhojan: https://orderbhojan.com/dish/${widget.dishId}'));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content:
                      Text('Dish link copied! Share with family & friends.'),
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
                  .toggleFavoriteDish(widget.dishId);
              if (mounted) {
                setState(() => _isFavorite = isFav);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(isFav
                        ? 'Added to your favorites'
                        : 'Removed from favorites'),
                    duration: const Duration(seconds: 1),
                    backgroundColor: BhojanColors.primary,
                  ),
                );
              }
            },
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Row(
            children: [
              // Stepper Pill
              Container(
                height: 48,
                decoration: BoxDecoration(
                  color: BhojanColors.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: BhojanColors.outline, width: 0.8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.remove, size: 16),
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      constraints:
                          const BoxConstraints(minWidth: 32, minHeight: 48),
                      onPressed: _quantity > 1
                          ? () => setState(() => _quantity--)
                          : null,
                    ),
                    Text(
                      _quantity.toString(),
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: BhojanColors.onSurface,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.add, size: 16),
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      constraints:
                          const BoxConstraints(minWidth: 32, minHeight: 48),
                      onPressed: () => setState(() => _quantity++),
                    ),
                  ],
                ),
              ),

              const SizedBox(width: 10),

              // Add To Cart CTA
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: () {
                      context.read<CartBloc>().add(
                            AddToCartRequested(
                              CartItem(
                                id: '${_dish!.id}_${DateTime.now().millisecondsSinceEpoch}',
                                dishId: _dish!.id,
                                name: _dish!.name,
                                unitPrice: _calculatedUnitPrice,
                                quantity: _quantity,
                                isVeg: _dish!.isVeg,
                                customizationSummary: _customizationSummary,
                                kitchenId: _dish!.kitchenId,
                                kitchenName: "Ammachi's Authentic Kitchen",
                              ),
                            ),
                          );

                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('${_dish!.name} added to cart!'),
                          backgroundColor: BhojanColors.primaryDark,
                          duration: const Duration(seconds: 2),
                          action: SnackBarAction(
                            label: 'VIEW CART',
                            textColor: Colors.white,
                            onPressed: () => context.go(AppRoutes.cart),
                          ),
                        ),
                      );

                      context.pop();
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: BhojanColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                      elevation: 0,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'TOTAL PAYABLE',
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                color: Colors.white70,
                                letterSpacing: 0.5,
                              ),
                            ),
                            Text(
                              '₹$_calculatedTotalPrice',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                        const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'Add to Cart',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(width: 4),
                            Icon(Icons.arrow_forward, size: 16),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Hero Photo
            Stack(
              children: [
                Image.network(
                  _dish!.imageUrl,
                  height: 240,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    height: 240,
                    color: BhojanColors.surfaceContainerHigh,
                    child: const Center(
                      child: Icon(Icons.restaurant,
                          size: 56, color: BhojanColors.primary),
                    ),
                  ),
                ),
                Positioned(
                  top: 14,
                  left: 16,
                  child: Row(
                    children: [
                      BhojanVegBadge(isVeg: _dish!.isVeg, size: 18),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.92),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.star,
                                size: 14, color: Color(0xFFD97706)),
                            SizedBox(width: 4),
                            Text(
                              '4.9 (420+)',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: BhojanColors.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  bottom: 12,
                  left: 16,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.92),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Text(
                      '20 mins prep • Serves 1-2',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: BhojanColors.onSurface,
                      ),
                    ),
                  ),
                ),
              ],
            ),

            // Main Info Block
            Padding(
              padding: const EdgeInsets.all(BhojanDimens.space16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _dish!.name,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: BhojanColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text(
                        '₹${_dish!.price}',
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: BhojanColors.primary,
                        ),
                      ),
                      if (_dish!.originalPrice != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          '₹${_dish!.originalPrice}',
                          style: const TextStyle(
                            fontSize: 15,
                            color: BhojanColors.textMuted,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: BhojanColors.goldContainer,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            '15% OFF',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: BhojanColors.goldDark,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    _dish!.description,
                    style: const TextStyle(
                      fontSize: 14,
                      color: BhojanColors.onSurfaceVariant,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Healthy Cooking Note
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: BhojanColors.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.eco, size: 18, color: BhojanColors.vegGreen),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Cooked in pure farm ghee & cold-pressed coconut oil. No artificial colors or MSG.',
                            style: TextStyle(
                              fontSize: 12,
                              color: BhojanColors.onSurface,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Section 1: Portion Size (Required)
            if (_dish!.portionOptions.isNotEmpty)
              _buildSectionCard(
                title: 'Choose Portion Size',
                subtitle: 'Select 1 option',
                tag: 'REQUIRED',
                child: Column(
                  children: _dish!.portionOptions.map((opt) {
                    final isSelected = _selectedPortion == opt;
                    return InkWell(
                      onTap: () {
                        setState(() => _selectedPortion = opt);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? BhojanColors.primaryContainer.withOpacity(0.3)
                              : BhojanColors.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isSelected
                                ? BhojanColors.primary
                                : Colors.transparent,
                            width: 1.2,
                          ),
                        ),
                        child: Row(
                          children: [
                            Radio<CustomizationOption>(
                              value: opt,
                              groupValue: _selectedPortion,
                              onChanged: (val) {
                                setState(() => _selectedPortion = val);
                              },
                              activeColor: BhojanColors.primary,
                            ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    opt.name,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: BhojanColors.onSurface,
                                    ),
                                  ),
                                  if (opt.subtitle != null)
                                    Text(
                                      opt.subtitle!,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: BhojanColors.onSurfaceVariant,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            Text(
                              opt.extraPrice == 0
                                  ? 'Included'
                                  : '+₹${opt.extraPrice}',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: opt.extraPrice == 0
                                    ? BhojanColors.primaryDark
                                    : BhojanColors.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),

            // Section 2: Rice Style (Optional)
            if (_dish!.riceOptions.isNotEmpty)
              _buildSectionCard(
                title: 'Choice of Rice Style',
                subtitle: 'Select cooking tradition',
                tag: 'OPTIONAL',
                child: Column(
                  children: _dish!.riceOptions.map((opt) {
                    final isSelected = _selectedRice == opt;
                    return InkWell(
                      onTap: () {
                        setState(() => _selectedRice = opt);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? BhojanColors.primaryContainer.withOpacity(0.3)
                              : BhojanColors.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isSelected
                                ? BhojanColors.primary
                                : Colors.transparent,
                            width: 1.2,
                          ),
                        ),
                        child: Row(
                          children: [
                            Radio<CustomizationOption>(
                              value: opt,
                              groupValue: _selectedRice,
                              onChanged: (val) {
                                setState(() => _selectedRice = val);
                              },
                              activeColor: BhojanColors.primary,
                            ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    opt.name,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: BhojanColors.onSurface,
                                    ),
                                  ),
                                  if (opt.subtitle != null)
                                    Text(
                                      opt.subtitle!,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: BhojanColors.onSurfaceVariant,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            Text(
                              opt.extraPrice == 0
                                  ? 'Free'
                                  : '+₹${opt.extraPrice}',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: opt.extraPrice == 0
                                    ? BhojanColors.primaryDark
                                    : BhojanColors.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),

            // Section 3: Add-Ons (Checkbox Multi-select)
            if (_dish!.addOnOptions.isNotEmpty)
              _buildSectionCard(
                title: 'Delicious Add-Ons',
                subtitle: 'Elevate your meal',
                tag: 'MULTI-SELECT',
                child: Column(
                  children: _dish!.addOnOptions.map((opt) {
                    final isChecked = _selectedAddons.contains(opt);
                    return InkWell(
                      onTap: () {
                        setState(() {
                          if (isChecked) {
                            _selectedAddons.remove(opt);
                          } else {
                            _selectedAddons.add(opt);
                          }
                        });
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(
                          color: isChecked
                              ? BhojanColors.primaryContainer.withOpacity(0.3)
                              : BhojanColors.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isChecked
                                ? BhojanColors.primary
                                : Colors.transparent,
                            width: 1.2,
                          ),
                        ),
                        child: Row(
                          children: [
                            Checkbox(
                              value: isChecked,
                              onChanged: (val) {
                                setState(() {
                                  if (val == true) {
                                    _selectedAddons.add(opt);
                                  } else {
                                    _selectedAddons.remove(opt);
                                  }
                                });
                              },
                              activeColor: BhojanColors.primary,
                            ),
                            Expanded(
                              child: Text(
                                opt.name,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: BhojanColors.onSurface,
                                ),
                              ),
                            ),
                            Text(
                              '+₹${opt.extraPrice}',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: BhojanColors.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),

            // Section 4: Spice Level
            _buildSectionCard(
              title: 'Spice Level Preference',
              subtitle: 'Adjust heat to your palate',
              tag: '',
              child: Row(
                children: ['Mild', 'Medium 🔥', 'Spicy 🔥🔥'].map((spice) {
                  final isSelected = _selectedSpice == spice;
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: ChoiceChip(
                        label: Text(spice),
                        selected: isSelected,
                        onSelected: (val) {
                          setState(() => _selectedSpice = spice);
                        },
                        selectedColor: BhojanColors.primary,
                        backgroundColor: BhojanColors.surfaceContainerLow,
                        labelStyle: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: isSelected
                              ? Colors.white
                              : BhojanColors.onSurface,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),

            // Section 5: Cooking Notes
            _buildSectionCard(
              title: 'Cooking & Allergy Notes',
              subtitle: 'Special requests for the home chef',
              tag: '',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: _quickInstructions.map((inst) {
                      return ActionChip(
                        label: Text('+ $inst'),
                        labelStyle: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: BhojanColors.onSurface,
                        ),
                        backgroundColor: BhojanColors.surfaceContainerLow,
                        onPressed: () {
                          if (_notesController.text.isEmpty) {
                            _notesController.text = inst;
                          } else if (!_notesController.text.contains(inst)) {
                            _notesController.text =
                                '${_notesController.text}, $inst';
                          }
                        },
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _notesController,
                    maxLines: 2,
                    decoration: InputDecoration(
                      hintText: 'e.g. Less oil, extra onions...',
                      hintStyle: const TextStyle(
                          fontSize: 13, color: BhojanColors.textMuted),
                      filled: true,
                      fillColor: BhojanColors.surfaceContainerLow,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.all(12),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required String subtitle,
    required String tag,
    required Widget child,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
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
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: BhojanColors.onSurface,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        color: BhojanColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
                if (tag.isNotEmpty)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: BhojanColors.primaryContainer.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      tag,
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: BhojanColors.primaryDark,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            child,
          ],
        ),
      ),
    );
  }
}
