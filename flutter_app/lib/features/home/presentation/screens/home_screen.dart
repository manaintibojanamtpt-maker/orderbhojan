import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/routes/app_router.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/services/preferences_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/widgets/bhojan_button.dart';
import '../../../../core/widgets/veg_badge.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../auth/presentation/bloc/auth_state.dart';
import '../../../kitchen/data/repositories/kitchen_repository.dart';
import '../../../kitchen/domain/entities/kitchen.dart';
import '../../../assistant/presentation/widgets/voice_assistant_sheet.dart';
import '../widgets/location_selector_sheet.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final KitchenRepository _kitchenRepository = sl<KitchenRepository>();
  List<Kitchen> _kitchens = [];
  bool _isLoading = true;
  String _selectedCategory = 'Biryani';
  bool _isPureVegSelected = false;
  String? _activeQuickFilter;
  String _currentAddress = '';
  bool _showAiPill = true;

  final List<Map<String, String>> _categories = [
    {
      'name': 'Biryani',
      'image':
          'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300&auto=format&fit=crop&q=80',
    },
    {
      'name': 'South Indian',
      'image':
          'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=300&auto=format&fit=crop&q=80',
    },
    {
      'name': 'Royal Thali',
      'image':
          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300&auto=format&fit=crop&q=80',
    },
    {
      'name': 'Curries',
      'image':
          'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=300&auto=format&fit=crop&q=80',
    },
    {
      'name': 'Snacks & Chai',
      'image':
          'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=300&auto=format&fit=crop&q=80',
    },
    {
      'name': 'Ghar Ka Khana',
      'image':
          'https://images.unsplash.com/photo-1505253758473-96b3015f240a?w=300&auto=format&fit=crop&q=80',
    },
  ];

  @override
  void initState() {
    super.initState();
    final saved = sl<PreferencesService>().getActiveAddress();
    _currentAddress = saved.isNotEmpty ? saved : 'Set Delivery Location';
    _isPureVegSelected = sl<PreferencesService>().isPureVeg();
    _loadKitchens();
  }

  Future<void> _loadKitchens() async {
    setState(() => _isLoading = true);
    final coords = sl<PreferencesService>().getActiveCoordinates();
    final list = await _kitchenRepository.getKitchens(
      vegOnly: _isPureVegSelected ? true : null,
      userLat: coords?['lat'],
      userLng: coords?['lng'],
    );
    setState(() {
      _kitchens = list;
      _isLoading = false;
    });
  }

  List<Kitchen> get _filteredKitchens {
    return _kitchens.where((k) {
      if (_isPureVegSelected && !k.isPureVeg) return false;
      if (_activeQuickFilter == 'Rating 4.0+' && k.rating < 4.0) return false;
      if (_activeQuickFilter == 'Home Kitchens' && !k.isHomeKitchen)
        return false;
      if (_activeQuickFilter == 'Under 30 Mins' && k.distanceKm > 1.5)
        return false;
      if (_activeQuickFilter == 'Great Offers' && k.offer == null) return false;
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BhojanColors.scaffoldBackground,
      appBar: AppBar(
        backgroundColor: BhojanColors.surface,
        elevation: 0,
        scrolledUnderElevation: 1,
        titleSpacing: BhojanDimens.space16,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: BhojanColors.outline, height: 0.8),
        ),
        title: Row(
          children: [
            // Brand Logo & Title
            Container(
              width: 32,
              height: 32,
              decoration: const BoxDecoration(
                color: BhojanColors.primary,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Icon(Icons.soup_kitchen, size: 18, color: Colors.white),
              ),
            ),
            const SizedBox(width: 8),
            RichText(
              text: const TextSpan(
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: BhojanColors.onSurface,
                  letterSpacing: -0.3,
                ),
                children: [
                  TextSpan(text: 'Order'),
                  TextSpan(
                    text: 'Bhojan',
                    style: TextStyle(color: BhojanColors.primary),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),

            // Location Dropdown Pill (Opens Interactive Location Selector)
            Expanded(
              child: InkWell(
                onTap: () {
                  LocationSelectorSheet.show(
                    context,
                    currentAddress: _currentAddress,
                    onAddressSelected: (selected) {
                      setState(() => _currentAddress = selected);
                      sl<PreferencesService>().setActiveAddress(selected);
                      _loadKitchens();
                    },
                  );
                },
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: BhojanColors.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: BhojanColors.outline, width: 0.8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.location_on,
                          size: 15, color: BhojanColors.primary),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          _currentAddress,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: BhojanColors.onSurface,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const Icon(Icons.keyboard_arrow_down,
                          size: 16, color: BhojanColors.onSurfaceVariant),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
        actions: [
          BlocBuilder<AuthBloc, AuthState>(
            builder: (context, state) {
              if (state is Authenticated && !state.user.isAnonymous) {
                return Padding(
                  padding: const EdgeInsets.only(right: BhojanDimens.space16),
                  child: CircleAvatar(
                    radius: 16,
                    backgroundColor: BhojanColors.primaryContainer,
                    child: Text(
                      state.user.displayName?.substring(0, 1).toUpperCase() ??
                          'U',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: BhojanColors.primaryDark,
                      ),
                    ),
                  ),
                );
              }
              return IconButton(
                icon: const Icon(Icons.person_outline,
                    color: BhojanColors.onSurface),
                onPressed: () => context.push(AppRoutes.onboarding),
              );
            },
          ),
        ],
      ),
      body: Stack(
        children: [
          RefreshIndicator(
            onRefresh: _loadKitchens,
            color: BhojanColors.primary,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
              // Search & Filter Pill Bar
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  BhojanDimens.space16,
                  BhojanDimens.space12,
                  BhojanDimens.space16,
                  BhojanDimens.space8,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => context.go(AppRoutes.search),
                        child: Container(
                          height: 48,
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          decoration: BoxDecoration(
                            color: BhojanColors.surface,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                                color: BhojanColors.outline, width: 0.8),
                            boxShadow: BhojanDimens.cardShadow,
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.search,
                                  size: 22, color: BhojanColors.primary),
                              const SizedBox(width: 8),
                              const Expanded(
                                child: Text(
                                  'Search thalis, biryani, kitchens...',
                                  style: TextStyle(
                                    fontSize: 14,
                                    color: BhojanColors.textMuted,
                                  ),
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.mic,
                                    size: 20,
                                    color: BhojanColors.onSurfaceVariant),
                                onPressed: () =>
                                    _showVoiceAssistantSheet(context),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      height: 48,
                      width: 48,
                      decoration: BoxDecoration(
                        color: BhojanColors.surfaceContainerLow,
                        borderRadius: BorderRadius.circular(16),
                        border:
                            Border.all(color: BhojanColors.outline, width: 0.8),
                      ),
                      child: IconButton(
                        icon: const Icon(Icons.tune,
                            size: 20, color: BhojanColors.onSurface),
                        onPressed: () => context.go(AppRoutes.search),
                      ),
                    ),
                  ],
                ),
              ),

              // Promotional Hero Heritage Card (Replaces Swiggy Orange)
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: BhojanDimens.space16,
                  vertical: BhojanDimens.space8,
                ),
                child: InkWell(
                  onTap: () {
                    Clipboard.setData(const ClipboardData(text: 'HERITAGE35'));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                            'Coupon HERITAGE35 copied to clipboard! Enjoy 35% OFF.'),
                        backgroundColor: BhojanColors.primary,
                      ),
                    );
                  },
                  borderRadius: BorderRadius.circular(18),
                  child: Container(
                    padding: const EdgeInsets.all(BhojanDimens.space16),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [
                          BhojanColors.primary,
                          BhojanColors.primaryDark,
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: [
                        BoxShadow(
                          color: BhojanColors.primary.withValues(alpha: 0.25),
                          blurRadius: 14,
                          offset: const Offset(0, 5),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: BhojanColors.goldAccent
                                      .withValues(alpha: 0.25),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: BhojanColors.goldAccent
                                        .withValues(alpha: 0.5),
                                    width: 0.8,
                                  ),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.workspace_premium,
                                        size: 13,
                                        color: BhojanColors.goldAccent),
                                    SizedBox(width: 4),
                                    Text(
                                      "Dadi's Kitchen Festival",
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: BhojanColors.goldAccent,
                                        letterSpacing: 0.3,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'FLAT 35% OFF',
                                style: TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  height: 1.1,
                                ),
                              ),
                              const SizedBox(height: 4),
                              const Text(
                                'Small-batch, Slow-simmered • Free delivery',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Color(0xFFE7EFEA),
                                  height: 1.2,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: BhojanColors.goldAccent,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'CODE: HERITAGE35',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: BhojanColors.primaryDark,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: Container(
                            decoration: BoxDecoration(
                              border: Border.all(
                                color: BhojanColors.goldAccent
                                    .withValues(alpha: 0.4),
                                width: 1.2,
                              ),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(13),
                              child: Image.network(
                                'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300&auto=format&fit=crop&q=80',
                                width: 100,
                                height: 100,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // AI Voice Ordering Card (Exact Match with Production Web App)
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: BhojanDimens.space16,
                  vertical: BhojanDimens.space8,
                ),
                child: Container(
                  padding: const EdgeInsets.all(BhojanDimens.space16),
                  decoration: BoxDecoration(
                    color: BhojanColors.surface,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: BhojanColors.goldAccent.withValues(alpha: 0.6),
                      width: 1.0,
                    ),
                    boxShadow: BhojanDimens.cardShadow,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header Row
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: BhojanColors.terracotta,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 6),
                              const Text(
                                'AI Voice Ordering',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: BhojanColors.terracotta,
                                ),
                              ),
                              const SizedBox(width: 6),
                              const Text(
                                '•  తెలుగు • हिंदी • English',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: BhojanColors.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                          const Text(
                            'Auto-detecting',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: BhojanColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),

                      // Title & Subtitle
                      const Text(
                        'What would you like to eat today?',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: BhojanColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Just speak naturally in your language — tell me your favorite dish or kitchen.',
                        style: TextStyle(
                          fontSize: 12,
                          color: BhojanColors.onSurfaceVariant,
                          height: 1.3,
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Prompt Samples & Tap to Order Action
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: [
                          _buildVoiceSampleChip('2 Masala Dosa add cheyi'),
                          _buildVoiceSampleChip('Chicken Biryani'),
                          _buildVoiceSampleChip('2 Idli plate dalo'),
                          _buildVoiceSampleChip('Andhra Veg Thali'),
                        ],
                      ),
                      const SizedBox(height: 14),

                      // Action Button
                      InkWell(
                        onTap: () => _showVoiceAssistantSheet(context),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [
                                BhojanColors.terracotta,
                                Color(0xFFC85A32),
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: [
                              BoxShadow(
                                color: BhojanColors.terracotta
                                    .withValues(alpha: 0.3),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.mic, color: Colors.white, size: 20),
                              SizedBox(width: 8),
                              Text(
                                'Tap to speak & order',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                  letterSpacing: 0.3,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Categories Horizontal Rail
              Padding(
                padding: const EdgeInsets.fromLTRB(
                    BhojanDimens.space16, 12, BhojanDimens.space16, 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Explore Craving',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: BhojanColors.onSurface,
                      ),
                    ),
                    Text(
                      'Swipe →',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: BhojanColors.primaryDark,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                height: 100,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                      horizontal: BhojanDimens.space16),
                  itemCount: _categories.length,
                  itemBuilder: (context, index) {
                    final cat = _categories[index];
                    final isSelected = cat['name'] == _selectedCategory;
                    return Padding(
                      padding: const EdgeInsets.only(right: 14),
                      child: InkWell(
                        onTap: () {
                          setState(() => _selectedCategory = cat['name']!);
                        },
                        borderRadius: BorderRadius.circular(35),
                        child: Column(
                          children: [
                            Container(
                              width: 62,
                              height: 62,
                              padding: const EdgeInsets.all(2),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: isSelected
                                      ? BhojanColors.primary
                                      : Colors.transparent,
                                  width: 2,
                                ),
                              ),
                              child: ClipOval(
                                child: Image.network(
                                  cat['image']!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(
                                    color: BhojanColors.surfaceContainerHigh,
                                    child: const Icon(
                                      Icons.fastfood,
                                      size: 24,
                                      color: BhojanColors.primary,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              cat['name']!,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: isSelected
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                                color: isSelected
                                    ? BhojanColors.primary
                                    : BhojanColors.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),

              // Quick Filter Bar
              Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: BhojanDimens.space16, vertical: 6),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      // Pure Veg Switch Chip
                      FilterChip(
                        avatar: const BhojanVegBadge(isVeg: true, size: 14),
                        label: const Text('Pure Veg'),
                        selected: _isPureVegSelected,
                        onSelected: (val) {
                          setState(() => _isPureVegSelected = val);
                          _loadKitchens();
                        },
                        selectedColor: BhojanColors.primaryContainer,
                        backgroundColor: BhojanColors.surface,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                          side: const BorderSide(
                              color: BhojanColors.outline, width: 0.8),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _buildQuickFilterChip('Rating 4.0+', Icons.star),
                      const SizedBox(width: 8),
                      _buildQuickFilterChip('Home Kitchens', Icons.cottage),
                      const SizedBox(width: 8),
                      _buildQuickFilterChip('Under 30 Mins', Icons.schedule),
                      const SizedBox(width: 8),
                      _buildQuickFilterChip('Great Offers', Icons.local_offer),
                    ],
                  ),
                ),
              ),

              // Featured Home Kitchens Section
              Padding(
                padding: const EdgeInsets.fromLTRB(
                    BhojanDimens.space16, 16, BhojanDimens.space16, 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.soup_kitchen,
                            size: 20, color: BhojanColors.primary),
                        SizedBox(width: 6),
                        Text(
                          'Featured Home Kitchens',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: BhojanColors.onSurface,
                          ),
                        ),
                      ],
                    ),
                    TextButton(
                      onPressed: () => context.go(AppRoutes.search),
                      child: const Row(
                        children: [
                          Text(
                            'See All',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: BhojanColors.primary,
                            ),
                          ),
                          Icon(Icons.chevron_right,
                              size: 16, color: BhojanColors.primary),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // Kitchen Cards List
              if (_isLoading)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: CircularProgressIndicator(
                      valueColor:
                          AlwaysStoppedAnimation<Color>(BhojanColors.primary),
                    ),
                  ),
                )
              else if (_filteredKitchens.isEmpty)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      children: [
                        const Icon(Icons.search_off,
                            size: 40, color: BhojanColors.onSurfaceVariant),
                        const SizedBox(height: 8),
                        const Text(
                          'No kitchens match this filter',
                          style: TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 4),
                        TextButton(
                          onPressed: () {
                            setState(() {
                              _activeQuickFilter = null;
                              _isPureVegSelected = false;
                            });
                          },
                          child: const Text('Clear Filters'),
                        ),
                      ],
                    ),
                  ),
                )
              else
                LayoutBuilder(
                  builder: (context, constraints) {
                    if (constraints.maxWidth >= 600) {
                      final cols = constraints.maxWidth >= 900 ? 3 : 2;
                      return GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        padding: const EdgeInsets.symmetric(
                            horizontal: BhojanDimens.space16),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
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
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      padding: const EdgeInsets.symmetric(
                          horizontal: BhojanDimens.space16),
                      itemCount: _filteredKitchens.length,
                      itemBuilder: (context, index) {
                        final kitchen = _filteredKitchens[index];
                        return _buildKitchenCard(kitchen);
                      },
                    );
                  },
                ),

              const SizedBox(height: 100),
            ],
          ),
        ),
      ),
      if (_showAiPill)
        Positioned(
          bottom: 16,
          left: 16,
          right: 84,
          child: Material(
            elevation: 8,
            borderRadius: BorderRadius.circular(16),
            color: const Color(0xFF1E1A17),
            child: InkWell(
              onTap: () => _showVoiceAssistantSheet(context),
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(7),
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: BhojanColors.terracotta,
                      ),
                      child:
                          const Icon(Icons.mic, color: Colors.white, size: 18),
                    ),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'OrderBhojan AI • Voice-first assistant',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: BhojanColors.goldAccent,
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Welcome back to OrderBhojan! Tap to speak in Telugu, Hindi, or English.',
                            style: TextStyle(
                              fontSize: 10.5,
                              color: Colors.white,
                              height: 1.25,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close,
                          size: 16, color: Colors.white54),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => setState(() => _showAiPill = false),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
    ],
  ),
  floatingActionButton: FloatingActionButton(
    onPressed: () => _showVoiceAssistantSheet(context),
    backgroundColor: BhojanColors.terracotta,
    elevation: 6,
    child: const Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.graphic_eq, color: Colors.white, size: 22),
        Text(
          'AI',
          style: TextStyle(
            color: Colors.white,
            fontSize: 10,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  ),
);
}

  Widget _buildVoiceSampleChip(String text) {
    return InkWell(
      onTap: () => _showVoiceAssistantSheet(context),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: BhojanColors.surfaceContainerLow,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: BhojanColors.outline, width: 0.8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.record_voice_over,
                size: 13, color: BhojanColors.terracotta),
            const SizedBox(width: 5),
            Text(
              '"$text"',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: BhojanColors.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickFilterChip(String label, IconData icon) {
    final isSelected = _activeQuickFilter == label;
    return FilterChip(
      avatar: Icon(icon,
          size: 14,
          color: isSelected ? BhojanColors.primaryDark : BhojanColors.primary),
      label: Text(label),
      selected: isSelected,
      onSelected: (val) {
        setState(() {
          _activeQuickFilter = val ? label : null;
        });
      },
      selectedColor: BhojanColors.primaryContainer,
      backgroundColor: BhojanColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(
          color: isSelected ? BhojanColors.primary : BhojanColors.outline,
          width: 0.8,
        ),
      ),
    );
  }

  Widget _buildKitchenCard(Kitchen kitchen) {
    final isFavorite = sl<PreferencesService>().isKitchenFavorite(kitchen.id);
    return Container(
      margin: const EdgeInsets.only(bottom: BhojanDimens.space16),
      decoration: BoxDecoration(
        color: BhojanColors.surface,
        borderRadius: BhojanDimens.roundedCard,
        border: Border.all(color: BhojanColors.outline, width: 0.8),
        boxShadow: BhojanDimens.cardShadow,
      ),
      child: InkWell(
        onTap: () {
          context.push('/restaurant/${kitchen.id}');
        },
        borderRadius: BhojanDimens.roundedCard,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Image Stack
            Stack(
              children: [
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(BhojanDimens.radiusLarge),
                  ),
                  child: Image.network(
                    kitchen.imageUrl,
                    height: 160,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      height: 160,
                      color: BhojanColors.surfaceContainerHigh,
                    ),
                  ),
                ),
                // Favorite Button
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
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.9),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        isFavorite ? Icons.favorite : Icons.favorite_border,
                        size: 20,
                        color: isFavorite
                            ? BhojanColors.terracotta
                            : BhojanColors.onSurface,
                      ),
                    ),
                  ),
                ),
                // Badges overlay
                Positioned(
                  bottom: 10,
                  left: 10,
                  child: Row(
                    children: [
                      if (kitchen.chefName != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.75),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            kitchen.chefName!,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      if (kitchen.badgeText != null) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: BhojanColors.vegGreen.withOpacity(0.9),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            kitchen.badgeText!,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),

            // Card Body Info
            Padding(
              padding: const EdgeInsets.all(BhojanDimens.space12),
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
                            fontWeight: FontWeight.w700,
                            color: BhojanColors.onSurface,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (!kitchen.isOpen)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.red.shade700,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text(
                            'Closed',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        )
                      else
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
                              const Icon(Icons.star,
                                  size: 12, color: Colors.white),
                              const SizedBox(width: 2),
                              Text(
                                kitchen.rating.toString(),
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    kitchen.cuisines.join(' • '),
                    style: const TextStyle(
                      fontSize: 13,
                      color: BhojanColors.onSurfaceVariant,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      if (!kitchen.isOpen) ...[
                        const Icon(Icons.schedule,
                            size: 15, color: Colors.red),
                        const SizedBox(width: 4),
                        const Text(
                          'Currently closed • Opens at 9:00 AM',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Colors.red,
                          ),
                        ),
                      ] else ...[
                        const Icon(Icons.schedule,
                            size: 15, color: BhojanColors.primary),
                        const SizedBox(width: 4),
                        Text(
                          kitchen.etaText,
                          style: const TextStyle(
                            fontSize: 12,
                            color: BhojanColors.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text('•',
                            style:
                                TextStyle(color: BhojanColors.onSurfaceVariant)),
                        const SizedBox(width: 8),
                        const Icon(Icons.near_me,
                            size: 15, color: BhojanColors.textMuted),
                        const SizedBox(width: 4),
                        Text(
                          '${kitchen.distanceKm} km',
                          style: const TextStyle(
                            fontSize: 12,
                            color: BhojanColors.onSurfaceVariant,
                          ),
                        ),
                      ],
                      const SizedBox(width: 8),
                      const Text('•',
                          style:
                              TextStyle(color: BhojanColors.onSurfaceVariant)),
                      const SizedBox(width: 8),
                      BhojanVegBadge(isVeg: kitchen.isPureVeg, size: 14),
                    ],
                  ),
                  if (kitchen.offer != null) ...[
                    const Divider(height: 16, color: BhojanColors.outline),
                    Text(
                      kitchen.offer!,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: BhojanColors.vegGreen,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showVoiceAssistantSheet(BuildContext context) {
    VoiceAssistantSheet.show(context);
  }
}
