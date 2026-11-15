import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/routes/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/auth_event.dart';
import '../bloc/auth_state.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;
  Timer? _timer;

  final List<Map<String, String>> _slides = [
    {
      'badge': '100% Home Cooked',
      'title': 'Authentic Regional Home Kitchens',
      'subtitle':
          'Verified culinary grandmothers and home chefs crafting slow-simmered, small-batch ancestral delicacies daily.',
      'tag': 'Authentic Recipes',
      'image':
          'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&auto=format&fit=crop&q=80',
    },
    {
      'badge': 'Hot & Steam-Locked',
      'title': 'Live Kitchen-to-Door Precision',
      'subtitle':
          'Sub-minute GPS tracking with insulated temperature-lock assurance, so your roti reaches soft and piping hot.',
      'tag': 'Smart Dispatch',
      'image':
          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop&q=80',
    },
    {
      'badge': 'తెలుగు • हिंदी • English',
      'title': 'OrderBhojan Voice Assistant',
      'subtitle':
          'Speak in your mother tongue for instant home-cooked thalis and tiffins — Powered by Sarvam AI.',
      'tag': 'Mother Tongue Voice AI',
      'image':
          'https://images.unsplash.com/photo-1589254065878-42c9da997008?w=800&auto=format&fit=crop&q=80',
    },
  ];

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 4), (timer) {
      if (_pageController.hasClients) {
        final nextPage = (_currentPage + 1) % _slides.length;
        _pageController.animateToPage(
          nextPage,
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeInOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthBloc, AuthState>(
      listener: (context, state) {
        if (state is Authenticated) {
          context.go(AppRoutes.home);
        } else if (state is AuthFailureState) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              backgroundColor: BhojanColors.nonVegRed,
            ),
          );
        }
      },
      child: Scaffold(
        backgroundColor: BhojanColors.scaffoldBackground,
        appBar: AppBar(
          backgroundColor: BhojanColors.scaffoldBackground,
          elevation: 0,
          leadingWidth: 150,
          leading: Padding(
            padding: const EdgeInsets.only(left: BhojanDimens.space16),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: const BoxDecoration(
                    color: BhojanColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.restaurant,
                      size: 18,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                const Text(
                  'OrderBhojan',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: BhojanColors.primary,
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton.icon(
              onPressed: () {
                context.read<AuthBloc>().add(AuthGuestAccessRequested());
              },
              icon: const Text(
                'Skip as Guest',
                style: TextStyle(
                  color: BhojanColors.primaryDark,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
              label: const Icon(
                Icons.arrow_forward,
                size: 16,
                color: BhojanColors.primaryDark,
              ),
            ),
            const SizedBox(width: BhojanDimens.space8),
          ],
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Fast login security pill
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BhojanDimens.space16,
                    vertical: BhojanDimens.space8,
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: BhojanColors.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: BhojanColors.vegGreen,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Text(
                              'FAST LOGIN • FIREBASE SECURE',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: BhojanColors.onSurfaceVariant,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // Carousel Slides
                SizedBox(
                  height: 340,
                  child: PageView.builder(
                    controller: _pageController,
                    onPageChanged: (index) {
                      setState(() => _currentPage = index);
                    },
                    itemCount: _slides.length,
                    itemBuilder: (context, index) {
                      final slide = _slides[index];
                      return Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: BhojanDimens.space16,
                          vertical: BhojanDimens.space4,
                        ),
                        child: Container(
                          decoration: BoxDecoration(
                            color: BhojanColors.surface,
                            borderRadius: BhojanDimens.roundedCard,
                            border: Border.all(
                              color: BhojanColors.outline,
                              width: 0.8,
                            ),
                            boxShadow: BhojanDimens.cardShadow,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Hero Image
                              ClipRRect(
                                borderRadius: const BorderRadius.vertical(
                                  top:
                                      Radius.circular(BhojanDimens.radiusLarge),
                                ),
                                child: Stack(
                                  children: [
                                    Image.network(
                                      slide['image']!,
                                      height: 180,
                                      width: double.infinity,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => Container(
                                        height: 180,
                                        color:
                                            BhojanColors.surfaceContainerHigh,
                                        child: const Center(
                                          child: Icon(
                                            Icons.restaurant_menu,
                                            size: 48,
                                            color: BhojanColors.primary,
                                          ),
                                        ),
                                      ),
                                    ),
                                    Positioned(
                                      bottom: 12,
                                      left: 12,
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10,
                                          vertical: 4,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.white.withOpacity(0.92),
                                          borderRadius:
                                              BorderRadius.circular(20),
                                        ),
                                        child: Text(
                                          slide['badge']!,
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                            color: BhojanColors.onSurface,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Padding(
                                padding:
                                    const EdgeInsets.all(BhojanDimens.space16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        const Icon(
                                          Icons.verified,
                                          size: 16,
                                          color: BhojanColors.primary,
                                        ),
                                        const SizedBox(width: 4),
                                        Text(
                                          slide['tag']!.toUpperCase(),
                                          style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                            color: BhojanColors.primary,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      slide['title']!,
                                      style: const TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.w700,
                                        color: BhojanColors.onSurface,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      slide['subtitle']!,
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: BhojanColors.onSurfaceVariant,
                                        height: 1.3,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),

                // Carousel Dots
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(_slides.length, (index) {
                    final isActive = _currentPage == index;
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 300),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      height: 6,
                      width: isActive ? 24 : 6,
                      decoration: BoxDecoration(
                        color: isActive
                            ? BhojanColors.primary
                            : BhojanColors.outline,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    );
                  }),
                ),

                const SizedBox(height: BhojanDimens.space24),

                // Auth Action Box
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BhojanDimens.space16,
                  ),
                  child: Container(
                    padding: const EdgeInsets.all(BhojanDimens.space20),
                    decoration: BoxDecoration(
                      color: BhojanColors.surface,
                      borderRadius: BhojanDimens.roundedCard,
                      border: Border.all(
                        color: BhojanColors.outline,
                        width: 0.8,
                      ),
                      boxShadow: BhojanDimens.cardShadow,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Welcome to OrderBhojan',
                          style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w700,
                            color: BhojanColors.onSurface,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Sign in with your Google Account to access your saved addresses, dietary preferences, and order history.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 13,
                            color: BhojanColors.onSurfaceVariant,
                            height: 1.3,
                          ),
                        ),
                        const SizedBox(height: BhojanDimens.space20),

                        // Google Sign-In Button
                        BlocBuilder<AuthBloc, AuthState>(
                          builder: (context, state) {
                            final isLoading = state is AuthLoading;
                            return SizedBox(
                              height: 52,
                              child: ElevatedButton(
                                onPressed: isLoading
                                    ? null
                                    : () {
                                        context
                                            .read<AuthBloc>()
                                            .add(AuthGoogleSignInRequested());
                                      },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: BhojanColors.primary,
                                  foregroundColor: BhojanColors.onPrimary,
                                  elevation: 0,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BhojanDimens.roundedPill,
                                  ),
                                ),
                                child: isLoading
                                    ? const SizedBox(
                                        height: 22,
                                        width: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.5,
                                          valueColor:
                                              AlwaysStoppedAnimation<Color>(
                                                  Colors.white),
                                        ),
                                      )
                                    : const Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Icon(
                                            Icons.login,
                                            size: 20,
                                            color: Colors.white,
                                          ),
                                          SizedBox(width: 10),
                                          Text(
                                            'Continue with Google',
                                            style: TextStyle(
                                              fontSize: 15,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ],
                                      ),
                              ),
                            );
                          },
                        ),

                        const SizedBox(height: BhojanDimens.space12),

                        // Guest Mode Button
                        SizedBox(
                          height: 50,
                          child: OutlinedButton(
                            onPressed: () {
                              context
                                  .read<AuthBloc>()
                                  .add(AuthGuestAccessRequested());
                            },
                            style: OutlinedButton.styleFrom(
                              foregroundColor: BhojanColors.onSurface,
                              side: const BorderSide(
                                color: BhojanColors.outline,
                                width: 1.0,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BhojanDimens.roundedPill,
                              ),
                            ),
                            child: const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.explore_outlined,
                                  size: 18,
                                  color: BhojanColors.primaryDark,
                                ),
                                SizedBox(width: 8),
                                Text(
                                  'Explore App as Guest',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
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

                const SizedBox(height: BhojanDimens.space24),

                // 3 Assurance Badges
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BhojanDimens.space16,
                  ),
                  child: Row(
                    children: [
                      _buildAssuranceBadge(
                        icon: Icons.local_fire_department,
                        color: BhojanColors.primary,
                        title: 'Freshly Tempered',
                      ),
                      const SizedBox(width: 8),
                      _buildAssuranceBadge(
                        icon: Icons.health_and_safety,
                        color: BhojanColors.vegGreen,
                        title: 'Pure Ghee & Oil',
                      ),
                      const SizedBox(width: 8),
                      _buildAssuranceBadge(
                        icon: Icons.soup_kitchen,
                        color: BhojanColors.earthBrown,
                        title: 'No Preservatives',
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: BhojanDimens.space32),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAssuranceBadge({
    required IconData icon,
    required Color color,
    required String title,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(
          color: BhojanColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: BhojanColors.outline, width: 0.8),
        ),
        child: Column(
          children: [
            Icon(icon, size: 20, color: color),
            const SizedBox(height: 4),
            Text(
              title,
              textAlign: TextAlign.center,
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
}
