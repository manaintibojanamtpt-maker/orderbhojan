import 'package:flutter/material.dart';

/// Design tokens for OrderBhojan Premium Brand Identity
/// Inspired by authentic home kitchens, traditional Indian hospitality, and culinary heritage.
abstract class BhojanColors {
  // Brand Primary & Accents (Heritage Indian Kitchen Aesthetic)
  static const Color primary = Color(0xFF173D32); // Heritage Green
  static const Color primaryDark =
      Color(0xFF102C24); // Deep Forest Heritage Green
  static const Color primaryContainer =
      Color(0xFFE7EFEA); // Soft Sage/Green Wash
  static const Color onPrimary = Color(0xFFFFFFFF); // Pure White on Primary

  // Luxury & Regional Accents
  static const Color goldAccent = Color(0xFFC69A4A); // Antique Gold
  static const Color goldContainer =
      Color(0xFFF9F3E5); // Soft Gold Tint Container
  static const Color goldDark = Color(0xFF9E7730); // Deep Antique Gold
  static const Color terracotta = Color(0xFFA84F32); // Warm Terracotta Clay
  static const Color terracottaContainer =
      Color(0xFFF8EDE8); // Soft Terracotta Tint

  // Dietary Indicators (FSSAI Aligned)
  static const Color vegGreen =
      Color(0xFF39734B); // Natural Heritage Green (Pure Veg)
  static const Color vegGreenContainer = Color(0xFFEAF4ED); // Light Veg Tint
  static const Color nonVegRed =
      Color(0xFFA84F32); // Terracotta Clay (Non-Veg Indicator)
  static const Color nonVegRedContainer =
      Color(0xFFF8EDE8); // Light Non-Veg Tint
  static const Color successGreen = Color(0xFF39734B); // Natural Green

  // Surfaces & Backgrounds
  static const Color scaffoldBackground = Color(0xFFFFF8EF); // Warm Ivory
  static const Color surface = Color(0xFFFFFFFF); // Pristine Surface White
  static const Color surfaceDim = Color(0xFFF4ECE1); // Soft Warm Ivory Dim
  static const Color surfaceContainerLow =
      Color(0xFFFAF3E8); // Light Warm Ivory Container
  static const Color surfaceContainer =
      Color(0xFFF2EAE0); // Pill & Inactive Input Container
  static const Color surfaceContainerHigh =
      Color(0xFFEADBCA); // Elevated Container
  static const Color outline = Color(0xFFE9DED0); // Warm Beige Border
  static const Color outlineVariant =
      Color(0xFFDDD0C0); // Subtle Border Variant

  // Typography Palette
  static const Color onSurface = Color(0xFF292722); // Dark Charcoal Text
  static const Color onSurfaceVariant =
      Color(0xFF81766A); // Muted Brown Secondary Text
  static const Color textMuted =
      Color(0xFFA0968B); // Muted Caption / Helper Text
  static const Color textDisabled = Color(0xFFC4B8AA); // Disabled Text

  // Backward compatibility alias (strictly mapped to new palette to prevent orange leak)
  static const Color earthBrown = Color(0xFF81766A);
}

/// Convenience alias aligned with existing screens
abstract class AppColors {
  static const Color primary = BhojanColors.primary;
  static const Color primaryDark = BhojanColors.primaryDark;
  static const Color primaryOrange =
      BhojanColors.primary; // Mapped to Heritage Green
  static const Color secondaryGreen = BhojanColors.vegGreen;
  static const Color accentGold = BhojanColors.goldAccent;
  static const Color accentTerracotta = BhojanColors.terracotta;
  static const Color background = BhojanColors.scaffoldBackground;
  static const Color surface = BhojanColors.surface;
  static const Color textPrimary = BhojanColors.onSurface;
  static const Color textSecondary = BhojanColors.onSurfaceVariant;
  static const Color divider = BhojanColors.outline;
  static const Color border = BhojanColors.outline;
  static const Color success = BhojanColors.successGreen;
}
