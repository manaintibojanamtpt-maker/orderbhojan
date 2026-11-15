import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:orderbhojan/core/theme/app_colors.dart';
import 'package:orderbhojan/core/theme/app_dimens.dart';
import 'package:orderbhojan/core/theme/app_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  group('BhojanColors Design Tokens', () {
    test('Primary and accent brand tokens match Heritage Indian specs', () {
      expect(BhojanColors.primary, const Color(0xFF173D32));
      expect(BhojanColors.primaryContainer, const Color(0xFFE7EFEA));
      expect(BhojanColors.primaryDark, const Color(0xFF102C24));
      expect(BhojanColors.onPrimary, const Color(0xFFFFFFFF));
      expect(BhojanColors.goldAccent, const Color(0xFFC69A4A));
      expect(BhojanColors.terracotta, const Color(0xFFA84F32));
    });

    test('Surface and background tokens match Warm Ivory specs', () {
      expect(BhojanColors.scaffoldBackground, const Color(0xFFFFF8EF));
      expect(BhojanColors.surface, const Color(0xFFFFFFFF));
      expect(BhojanColors.surfaceContainerLow, const Color(0xFFFAF3E8));
      expect(BhojanColors.onSurface, const Color(0xFF292722));
      expect(BhojanColors.outline, const Color(0xFFE9DED0));
    });

    test('Dietary indicator tokens match FSSAI color standards', () {
      expect(BhojanColors.vegGreen, const Color(0xFF39734B));
      expect(BhojanColors.nonVegRed, const Color(0xFFA84F32));
    });
  });

  group('BhojanDimens Scale', () {
    test('Corner radii match Stitch specifications', () {
      expect(BhojanDimens.radiusSmall, 8.0);
      expect(BhojanDimens.radiusMedium, 12.0);
      expect(BhojanDimens.radiusLarge, 16.0);
      expect(BhojanDimens.radiusSheet, 24.0);
      expect(BhojanDimens.radiusPill, 999.0);
    });

    test('Spacing 4pt/8pt scale invariants', () {
      expect(BhojanDimens.space4, 4.0);
      expect(BhojanDimens.space8, 8.0);
      expect(BhojanDimens.space16, 16.0);
      expect(BhojanDimens.space24, 24.0);
      expect(BhojanDimens.space32, 32.0);
    });
  });

  group('BhojanTheme Configuration', () {
    test('LightTheme configuration matches Material 3 specs', () {
      final theme = BhojanTheme.lightTheme;
      expect(theme.useMaterial3, true);
      expect(theme.scaffoldBackgroundColor, BhojanColors.scaffoldBackground);
      expect(theme.colorScheme.brightness, Brightness.light);
      expect(theme.colorScheme.primary, BhojanColors.primary);
      expect(theme.colorScheme.surface, BhojanColors.surface);
      expect(theme.colorScheme.onSurface, BhojanColors.onSurface);
      expect(theme.colorScheme.outline, BhojanColors.outline);
    });
  });
}
