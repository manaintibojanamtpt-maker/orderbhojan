import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/services/preferences_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../data/repositories/kitchen_repository.dart';
import '../../domain/entities/kitchen.dart';

class KitchenDiscoveryScreen extends StatefulWidget {
  final String? initialCuisine;

  const KitchenDiscoveryScreen({super.key, this.initialCuisine});

  @override
  State<KitchenDiscoveryScreen> createState() => _KitchenDiscoveryScreenState();
}

class _KitchenDiscoveryScreenState extends State<KitchenDiscoveryScreen> {
  final KitchenRepository _kitchenRepository = sl<KitchenRepository>();
  List<Kitchen> _allKitchens = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _selectedFilter = 'All';
  bool _pureVegOnly = false;

  final List<String> _filters = [
    'All',
    'South Indian',
    'North Indian',
    'Homestyle Thali',
    'Biryani',
    'Snacks',
  ];

  @override
  void initState() {
    super.initState();
    _pureVegOnly = sl<PreferencesService>().isPureVeg();
    if (widget.initialCuisine != null) {
      _selectedFilter = widget.initialCuisine!;
    }
    _loadKitchens();
  }

  Future<void> _loadKitchens() async {
    setState(() => _isLoading = true);
    final coords = sl<PreferencesService>().getActiveCoordinates();
    final kitchens = await _kitchenRepository.getKitchens(
      userLat: coords?['lat'],
      userLng: coords?['lng'],
    );
    setState(() {
      _allKitchens = kitchens;
      _isLoading = false;
    });
  }

  List<Kitchen> get _filteredKitchens {
    return _allKitchens.where((k) {
      final query = _searchQuery.toLowerCase();
      final matchesSearch = _searchQuery.isEmpty ||
          k.name.toLowerCase().contains(query) ||
          (k.chefName != null && k.chefName!.toLowerCase().contains(query)) ||
          k.cuisines.any((c) => c.toLowerCase().contains(query));

      final matchesFilter = _selectedFilter == 'All' ||
          k.cuisines.any(
              (c) => c.toLowerCase().contains(_selectedFilter.toLowerCase())) ||
          (k.badgeText != null &&
              k.badgeText!
                  .toLowerCase()
                  .contains(_selectedFilter.toLowerCase()));

      final matchesVeg = !_pureVegOnly || k.isPureVeg;

      return matchesSearch && matchesFilter && matchesVeg;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BhojanColors.scaffoldBackground,
      appBar: AppBar(
        backgroundColor: BhojanColors.surface,
        elevation: 0.5,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: BhojanColors.onSurface),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/');
            }
          },
        ),
        title: const Text(
          'Explore Home Kitchens',
          style: TextStyle(
            color: BhojanColors.onSurface,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: Column(
        children: [
          // Search & Filter header
          Container(
            color: BhojanColors.surface,
            padding: const EdgeInsets.symmetric(
                horizontal: BhojanDimens.space16, vertical: 8),
            child: Column(
              children: [
                TextField(
                  onChanged: (val) => setState(() => _searchQuery = val),
                  decoration: InputDecoration(
                    hintText: 'Search home kitchens or regional dishes...',
                    hintStyle: const TextStyle(
                        fontSize: 13, color: BhojanColors.onSurfaceVariant),
                    prefixIcon: const Icon(Icons.search,
                        size: 20, color: BhojanColors.onSurfaceVariant),
                    suffixIcon: _searchQuery.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () => setState(() => _searchQuery = ''),
                          )
                        : null,
                    filled: true,
                    fillColor: BhojanColors.scaffoldBackground,
                    contentPadding: const EdgeInsets.symmetric(vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: BhojanColors.outline),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: BhojanColors.outline),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                // Filter row + Pure Veg Switch
                Row(
                  children: [
                    InkWell(
                      onTap: () => setState(() => _pureVegOnly = !_pureVegOnly),
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: _pureVegOnly
                              ? BhojanColors.vegGreen.withOpacity(0.15)
                              : BhojanColors.scaffoldBackground,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: _pureVegOnly
                                ? BhojanColors.vegGreen
                                : BhojanColors.outline,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              _pureVegOnly
                                  ? Icons.check_circle
                                  : Icons.circle_outlined,
                              size: 14,
                              color: _pureVegOnly
                                  ? BhojanColors.vegGreen
                                  : BhojanColors.onSurfaceVariant,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'Pure Veg',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: _pureVegOnly
                                    ? BhojanColors.vegGreen
                                    : BhojanColors.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: SizedBox(
                        height: 34,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: _filters.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 6),
                          itemBuilder: (context, idx) {
                            final filter = _filters[idx];
                            final isSelected = _selectedFilter == filter;
                            return ChoiceChip(
                              label: Text(
                                filter,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: isSelected
                                      ? FontWeight.bold
                                      : FontWeight.normal,
                                  color: isSelected
                                      ? BhojanColors.primary
                                      : BhojanColors.onSurface,
                                ),
                              ),
                              selected: isSelected,
                              selectedColor:
                                  BhojanColors.primary.withOpacity(0.12),
                              backgroundColor: BhojanColors.scaffoldBackground,
                              side: BorderSide(
                                color: isSelected
                                    ? BhojanColors.primary
                                    : BhojanColors.outline,
                              ),
                              onSelected: (_) =>
                                  setState(() => _selectedFilter = filter),
                            );
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Kitchen List
          Expanded(
            child: _isLoading
                ? const Center(
                    child:
                        CircularProgressIndicator(color: BhojanColors.primary))
                : _filteredKitchens.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.search_off,
                                size: 48, color: BhojanColors.onSurfaceVariant),
                            const SizedBox(height: 12),
                            const Text(
                              'No kitchens match your filter',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Try clearing filters or search terms',
                              style: TextStyle(
                                  fontSize: 13,
                                  color: BhojanColors.onSurfaceVariant),
                            ),
                            const SizedBox(height: 16),
                            TextButton(
                              onPressed: () {
                                setState(() {
                                  _searchQuery = '';
                                  _selectedFilter = 'All';
                                  _pureVegOnly = false;
                                });
                              },
                              child: const Text('Reset All Filters'),
                            ),
                          ],
                        ),
                      )
                    : LayoutBuilder(
                        builder: (context, constraints) {
                          if (constraints.maxWidth >= 600) {
                            final cols = constraints.maxWidth >= 900 ? 3 : 2;
                            return GridView.builder(
                              padding:
                                  const EdgeInsets.all(BhojanDimens.space16),
                              gridDelegate:
                                  SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: cols,
                                crossAxisSpacing: 16,
                                mainAxisSpacing: 16,
                                childAspectRatio: 0.85,
                              ),
                              itemCount: _filteredKitchens.length,
                              itemBuilder: (context, index) {
                                final kitchen = _filteredKitchens[index];
                                return _buildKitchenCard(kitchen);
                              },
                            );
                          }
                          return ListView.builder(
                            padding: const EdgeInsets.all(BhojanDimens.space16),
                            itemCount: _filteredKitchens.length,
                            itemBuilder: (context, index) {
                              final kitchen = _filteredKitchens[index];
                              return _buildKitchenCard(kitchen);
                            },
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildKitchenCard(Kitchen kitchen) {
    return Container(
      margin: const EdgeInsets.only(bottom: BhojanDimens.space16),
      decoration: BoxDecoration(
        color: BhojanColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: BhojanColors.outline.withOpacity(0.6)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: InkWell(
        onTap: () => context.push('/restaurant/${kitchen.id}'),
        borderRadius: BorderRadius.circular(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Image Stack
            Stack(
              children: [
                ClipRRect(
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(16)),
                  child: Image.network(
                    kitchen.imageUrl,
                    height: 150,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      height: 150,
                      color: BhojanColors.outline,
                      child: const Center(
                        child: Icon(Icons.restaurant,
                            size: 40, color: BhojanColors.onSurfaceVariant),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  top: 10,
                  left: 10,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.7),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.star, color: Colors.amber, size: 14),
                        const SizedBox(width: 4),
                        Text(
                          '${kitchen.rating} (${kitchen.ratingCount})',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  top: 10,
                  right: 10,
                  child: InkWell(
                    onTap: () async {
                      final isFav = await sl<PreferencesService>()
                          .toggleFavoriteKitchen(kitchen.id);
                      if (mounted) {
                        setState(() {});
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(isFav
                                ? 'Added ${kitchen.name} to favorites!'
                                : 'Removed from favorites'),
                            duration: const Duration(seconds: 1),
                            backgroundColor: BhojanColors.primary,
                          ),
                        );
                      }
                    },
                    borderRadius: BorderRadius.circular(18),
                    child: Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.9),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        sl<PreferencesService>().isKitchenFavorite(kitchen.id)
                            ? Icons.favorite
                            : Icons.favorite_border,
                        size: 18,
                        color: sl<PreferencesService>()
                                .isKitchenFavorite(kitchen.id)
                            ? BhojanColors.terracotta
                            : BhojanColors.onSurface,
                      ),
                    ),
                  ),
                ),
                Positioned(
                  bottom: 10,
                  right: 10,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.9),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      kitchen.etaText,
                      style: const TextStyle(
                        color: BhojanColors.onSurface,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(BhojanDimens.space16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          kitchen.name,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: BhojanColors.onSurface,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        '₹${kitchen.priceForTwo} for two',
                        style: const TextStyle(
                          fontSize: 12,
                          color: BhojanColors.onSurfaceVariant,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    kitchen.cuisines.join(' • '),
                    style: const TextStyle(
                        fontSize: 12, color: BhojanColors.onSurfaceVariant),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.verified,
                          size: 14, color: BhojanColors.vegGreen),
                      const SizedBox(width: 4),
                      Text(
                        'By Chef ${kitchen.chefName}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: BhojanColors.onSurface,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        '${kitchen.distanceKm} km away',
                        style: const TextStyle(
                            fontSize: 11, color: BhojanColors.onSurfaceVariant),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
