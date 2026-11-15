import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/routes/app_router.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/services/preferences_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/widgets/bhojan_button.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../auth/presentation/bloc/auth_event.dart';
import '../../../auth/presentation/bloc/auth_state.dart';
import '../../../home/presentation/widgets/location_selector_sheet.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _pureVegFilter = false;
  String _selectedLanguage = 'English';

  @override
  void initState() {
    super.initState();
    _pureVegFilter = sl<PreferencesService>().isPureVeg();
    _selectedLanguage = sl<PreferencesService>().getLanguage();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BhojanColors.scaffoldBackground,
      appBar: AppBar(
        backgroundColor: BhojanColors.surface,
        elevation: 0,
        title: const Text(
          'Profile & Settings',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: BhojanColors.onSurface,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: BhojanColors.outline, height: 0.8),
        ),
      ),
      body: BlocBuilder<AuthBloc, AuthState>(
        builder: (context, authState) {
          final user = authState is Authenticated ? authState.user : null;
          final isGuest = user == null || user.isAnonymous;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(BhojanDimens.space16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // User Profile Hero Card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: BhojanColors.surface,
                    borderRadius: BhojanDimens.roundedCard,
                    border: Border.all(color: BhojanColors.outline, width: 0.8),
                    boxShadow: BhojanDimens.cardShadow,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: BhojanColors.primary,
                          shape: BoxShape.circle,
                          border: Border.all(
                              color: BhojanColors.goldAccent, width: 2),
                        ),
                        child: Center(
                          child: Text(
                            isGuest
                                ? 'G'
                                : (user.displayName?.isNotEmpty == true
                                    ? user.displayName![0].toUpperCase()
                                    : 'U'),
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    isGuest
                                        ? 'Guest Connoisseur'
                                        : (user.displayName ?? 'Customer'),
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                      color: BhojanColors.onSurface,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 5, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: BhojanColors.goldContainer,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.workspace_premium,
                                          size: 10,
                                          color: BhojanColors.goldDark),
                                      SizedBox(width: 2),
                                      Text(
                                        'CLUB',
                                        style: TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w800,
                                          color: BhojanColors.goldDark,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 3),
                            Text(
                              isGuest
                                  ? 'Browse Mode • Sign in to save'
                                  : (user.email ??
                                      user.phoneNumber ??
                                      'Logged in'),
                              style: const TextStyle(
                                fontSize: 11,
                                color: BhojanColors.onSurfaceVariant,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      if (isGuest)
                        ElevatedButton(
                          onPressed: () => context.push(AppRoutes.onboarding),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: BhojanColors.primary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 8),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20)),
                            elevation: 0,
                          ),
                          child: const Text('Sign In',
                              style: TextStyle(fontSize: 12)),
                        ),
                    ],
                  ),
                ),

                const SizedBox(height: 20),

                // Account & Preferences Section
                _buildSectionTitle('FOOD & DINING PREFERENCES'),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: BhojanColors.surface,
                    borderRadius: BhojanDimens.roundedCard,
                    border: Border.all(color: BhojanColors.outline, width: 0.8),
                    boxShadow: BhojanDimens.cardShadow,
                  ),
                  child: Column(
                    children: [
                      SwitchListTile(
                        value: _pureVegFilter,
                        onChanged: (val) {
                          setState(() => _pureVegFilter = val);
                          sl<PreferencesService>().setPureVeg(val);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(val
                                  ? 'Strict Pure Veg Mode Enabled across OrderBhojan'
                                  : 'Strict Pure Veg Mode Disabled'),
                              duration: const Duration(seconds: 1),
                              backgroundColor: BhojanColors.primary,
                            ),
                          );
                        },
                        activeColor: BhojanColors.primary,
                        title: const Text(
                          'Strict Pure Veg Mode',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                        subtitle: const Text(
                          'Filter out all non-veg kitchens and dishes across the app',
                          style: TextStyle(
                              fontSize: 12,
                              color: BhojanColors.onSurfaceVariant),
                        ),
                        secondary: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: const BoxDecoration(
                            color: BhojanColors.vegGreenContainer,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.eco,
                              size: 18, color: BhojanColors.vegGreen),
                        ),
                      ),
                      const Divider(height: 1, color: BhojanColors.outline),
                      ListTile(
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: const BoxDecoration(
                            color: BhojanColors.surfaceContainerLow,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.language,
                              size: 18, color: BhojanColors.primary),
                        ),
                        title: const Text(
                          'App Language',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                        subtitle: Text(
                          _selectedLanguage,
                          style: const TextStyle(
                              fontSize: 12,
                              color: BhojanColors.onSurfaceVariant),
                        ),
                        trailing: const Icon(Icons.chevron_right,
                            size: 20, color: BhojanColors.onSurfaceVariant),
                        onTap: () => _showLanguageDialog(),
                      ),
                      const Divider(height: 1, color: BhojanColors.outline),
                      ListTile(
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: const BoxDecoration(
                            color: BhojanColors.surfaceContainerLow,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.location_on_outlined,
                              size: 18, color: BhojanColors.primary),
                        ),
                        title: const Text(
                          'Manage Saved Addresses',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                        subtitle: const Text(
                          'Home, Work, Parent’s house',
                          style: TextStyle(
                              fontSize: 12,
                              color: BhojanColors.onSurfaceVariant),
                        ),
                        trailing: const Icon(Icons.chevron_right,
                            size: 20, color: BhojanColors.onSurfaceVariant),
                        onTap: () {
                          LocationSelectorSheet.show(
                            context,
                            currentAddress:
                                sl<PreferencesService>().getActiveAddress(),
                            onAddressSelected: (newAddr) {
                              sl<PreferencesService>()
                                  .setActiveAddress(newAddr);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content:
                                      Text('Delivery address set to: $newAddr'),
                                  backgroundColor: BhojanColors.primary,
                                ),
                              );
                            },
                          );
                        },
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 20),

                // Community & Kitchen Partnership
                _buildSectionTitle('COMMUNITY & PARTNERS'),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: BhojanColors.surface,
                    borderRadius: BhojanDimens.roundedCard,
                    border: Border.all(color: BhojanColors.outline, width: 0.8),
                    boxShadow: BhojanDimens.cardShadow,
                  ),
                  child: Column(
                    children: [
                      ListTile(
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: const BoxDecoration(
                            color: BhojanColors.primaryContainer,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.soup_kitchen_outlined,
                              size: 18, color: BhojanColors.primary),
                        ),
                        title: const Text(
                          'Register as a Home Chef',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                        subtitle: const Text(
                          'Cook ancestral recipes from your home kitchen with OrderBhojan',
                          style: TextStyle(
                              fontSize: 12,
                              color: BhojanColors.onSurfaceVariant),
                        ),
                        trailing: const Icon(Icons.chevron_right,
                            size: 20, color: BhojanColors.onSurfaceVariant),
                        onTap: () => _showRegisterChefDialog(context),
                      ),
                      const Divider(height: 1, color: BhojanColors.outline),
                      ListTile(
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: const BoxDecoration(
                            color: BhojanColors.surfaceContainerLow,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.headset_mic_outlined,
                              size: 18, color: BhojanColors.primary),
                        ),
                        title: const Text(
                          'Help Center & Support',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                        subtitle: const Text(
                          '24/7 dedicated customer care & live kitchen tracking assistance',
                          style: TextStyle(
                              fontSize: 12,
                              color: BhojanColors.onSurfaceVariant),
                        ),
                        trailing: const Icon(Icons.chevron_right,
                            size: 20, color: BhojanColors.onSurfaceVariant),
                        onTap: () => _showHelpSupportSheet(context),
                      ),
                      const Divider(height: 1, color: BhojanColors.outline),
                      ListTile(
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: const BoxDecoration(
                            color: BhojanColors.surfaceContainerLow,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.security,
                              size: 18, color: BhojanColors.primary),
                        ),
                        title: const Text(
                          'FSSAI & Kitchen Safety Norms',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                        subtitle: const Text(
                          'Strict hygiene and kitchen verification standards',
                          style: TextStyle(
                              fontSize: 12,
                              color: BhojanColors.onSurfaceVariant),
                        ),
                        trailing: const Icon(Icons.chevron_right,
                            size: 20, color: BhojanColors.onSurfaceVariant),
                        onTap: () => _showSafetyNormsDialog(context),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Sign Out or Sign In Action
                if (!isGuest)
                  BhojanButton(
                    label: 'Sign Out',
                    type: BhojanButtonType.outline,
                    onPressed: () {
                      context
                          .read<AuthBloc>()
                          .add(const AuthSignOutRequested());
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Signed out successfully'),
                          backgroundColor: BhojanColors.primary,
                        ),
                      );
                    },
                  )
                else
                  BhojanButton(
                    label: 'Sign In / Register',
                    onPressed: () => context.push(AppRoutes.onboarding),
                  ),

                const SizedBox(height: 24),

                // Version Info
                const Center(
                  child: Text(
                    'OrderBhojan Customer App v2.1.0 • Crafted with ❤️ in India',
                    style: TextStyle(
                      fontSize: 11,
                      color: BhojanColors.textMuted,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        color: BhojanColors.onSurfaceVariant,
        letterSpacing: 0.8,
      ),
    );
  }

  void _showLanguageDialog() {
    final languages = [
      'English',
      'Telugu (తెలుగు)',
      'Tamil (தமிழ்)',
      'Hindi (हिंदी)',
      'Kannada (ಕನ್ನಡ)'
    ];
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: BhojanColors.surface,
        title: const Text(
          'Select Language',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: languages.map((lang) {
            final key = lang.split(' ')[0];
            return RadioListTile<String>(
              value: key,
              groupValue: _selectedLanguage,
              title: Text(lang, style: const TextStyle(fontSize: 14)),
              activeColor: BhojanColors.primary,
              onChanged: (val) {
                if (val != null) {
                  setState(() => _selectedLanguage = val);
                  sl<PreferencesService>().setLanguage(val);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('App language changed to $val'),
                      duration: const Duration(seconds: 1),
                      backgroundColor: BhojanColors.primary,
                    ),
                  );
                }
                Navigator.pop(ctx);
              },
            );
          }).toList(),
        ),
      ),
    );
  }

  void _showRegisterChefDialog(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: BhojanColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: BhojanColors.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              const Icon(Icons.soup_kitchen,
                  size: 40, color: BhojanColors.primary),
              const SizedBox(height: 12),
              const Text(
                'Join as an OrderBhojan Home Chef',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: BhojanColors.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Turn your authentic family recipes into a flourishing home business. We provide packaging, insulated pickup, FSSAI verification, and direct customer reach.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  color: BhojanColors.onSurfaceVariant,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 20),
              BhojanButton(
                label: 'Apply for Chef Onboarding',
                onPressed: () {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                          'Application opened! Our culinary partner team will contact you within 24 hours.'),
                      backgroundColor: BhojanColors.primary,
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showHelpSupportSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: BhojanColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: BhojanColors.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'OrderBhojan Care 24/7',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: BhojanColors.onSurface,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Dedicated support for your food orders and home kitchens.',
                style: TextStyle(
                  fontSize: 12,
                  color: BhojanColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.phone_in_talk,
                    color: BhojanColors.primary),
                title: const Text('Call Customer Care'),
                subtitle: const Text('1800-BHOJAN-CARE (Toll Free)'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Connecting to OrderBhojan Care line...'),
                      backgroundColor: BhojanColors.primary,
                    ),
                  );
                },
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.chat_bubble_outline,
                    color: BhojanColors.primary),
                title: const Text('WhatsApp Assistant'),
                subtitle: const Text('+91 99880 12345'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Opening WhatsApp Support...'),
                      backgroundColor: BhojanColors.primary,
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSafetyNormsDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: BhojanColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.verified, color: BhojanColors.vegGreen),
            SizedBox(width: 8),
            Text(
              'Kitchen Verification',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
            ),
          ],
        ),
        content: const SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Our 5-Point Kitchen Safety Audit:',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
              ),
              SizedBox(height: 8),
              Text('• 100% FSSAI Registration & Hygiene Certification.',
                  style: TextStyle(fontSize: 12, height: 1.4)),
              Text('• Daily temperature & ingredient freshness log.',
                  style: TextStyle(fontSize: 12, height: 1.4)),
              Text('• Tamper-evident, food-grade thermal containers.',
                  style: TextStyle(fontSize: 12, height: 1.4)),
              Text('• Zero artificial colors, zero commercial MSG.',
                  style: TextStyle(fontSize: 12, height: 1.4)),
              Text('• Periodic surprise health & sanitation inspections.',
                  style: TextStyle(fontSize: 12, height: 1.4)),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Understood'),
          ),
        ],
      ),
    );
  }
}
