import 'package:flutter/material.dart';

abstract class BhojanDimens {
  // Spacing Scale (4pt / 8pt standard)
  static const double space2 = 2.0;
  static const double space4 = 4.0;
  static const double space8 = 8.0;
  static const double space12 = 12.0;
  static const double space16 = 16.0;
  static const double space20 = 20.0;
  static const double space24 = 24.0;
  static const double space32 = 32.0;
  static const double space40 = 40.0;
  static const double space48 = 48.0;

  // Corner Radii
  static const double radiusSmall = 8.0; // Buttons, inner badges
  static const double radiusMedium = 12.0; // Input fields, small tiles
  static const double radiusLarge = 16.0; // Standard cards (Dishes, Kitchens)
  static const double radiusSheet = 24.0; // Bottom sheets top radius
  static const double radiusPill = 999.0; // Filter chips, action steppers

  // Border Radii Helpers
  static final BorderRadius roundedCard = BorderRadius.circular(radiusLarge);
  static final BorderRadius roundedInput = BorderRadius.circular(radiusMedium);
  static final BorderRadius roundedPill = BorderRadius.circular(radiusPill);
  static const BorderRadius roundedSheet =
      BorderRadius.vertical(top: Radius.circular(radiusSheet));

  // Box Shadows (Subtle, warm, natural elevation)
  static const List<BoxShadow> cardShadow = [
    BoxShadow(
      color: Color(0x0A292722),
      blurRadius: 10.0,
      offset: Offset(0, 3),
    ),
  ];

  static const List<BoxShadow> subtleElevatedShadow = [
    BoxShadow(
      color: Color(0x0D173D32),
      blurRadius: 14.0,
      offset: Offset(0, 4),
    ),
  ];

  static const List<BoxShadow> floatingBarShadow = [
    BoxShadow(
      color: Color(0x14173D32),
      blurRadius: 18.0,
      offset: Offset(0, -4),
    ),
  ];
}

/// Convenience alias aligned with screens
abstract class AppDimens {
  static const double spacingXs = BhojanDimens.space4;
  static const double spacingSm = BhojanDimens.space8;
  static const double spacingMd = BhojanDimens.space16;
  static const double spacingLg = BhojanDimens.space24;
  static const double spacingXl = BhojanDimens.space32;

  static const double radiusSm = BhojanDimens.radiusSmall;
  static const double radiusMd = BhojanDimens.radiusMedium;
  static const double radiusLg = BhojanDimens.radiusLarge;
  static const double radiusPill = BhojanDimens.radiusPill;
}
