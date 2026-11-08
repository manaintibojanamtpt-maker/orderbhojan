import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_colors.dart';
import 'app_dimens.dart';
import 'app_typography.dart';

class BhojanTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: BhojanColors.scaffoldBackground,
      colorScheme: const ColorScheme(
        brightness: Brightness.light,
        primary: BhojanColors.primary,
        onPrimary: BhojanColors.onPrimary,
        primaryContainer: BhojanColors.primaryContainer,
        onPrimaryContainer: BhojanColors.primaryDark,
        secondary: BhojanColors.goldAccent,
        onSecondary: Colors.white,
        secondaryContainer: BhojanColors.goldContainer,
        onSecondaryContainer: BhojanColors.goldDark,
        tertiary: BhojanColors.terracotta,
        onTertiary: Colors.white,
        tertiaryContainer: BhojanColors.terracottaContainer,
        onTertiaryContainer: BhojanColors.terracotta,
        error: BhojanColors.nonVegRed,
        onError: Colors.white,
        surface: BhojanColors.surface,
        onSurface: BhojanColors.onSurface,
        onSurfaceVariant: BhojanColors.onSurfaceVariant,
        outline: BhojanColors.outline,
        outlineVariant: BhojanColors.outlineVariant,
      ),
      textTheme: BhojanTypography.textTheme,
      appBarTheme: const AppBarTheme(
        backgroundColor: BhojanColors.scaffoldBackground,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: BhojanColors.onSurface),
        titleTextStyle: TextStyle(
          color: BhojanColors.onSurface,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
        ),
      ),
      cardTheme: CardThemeData(
        color: BhojanColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BhojanDimens.roundedCard,
          side: const BorderSide(color: BhojanColors.outline, width: 0.8),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: BhojanColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BhojanDimens.roundedSheet,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: BhojanColors.primary,
          foregroundColor: BhojanColors.onPrimary,
          shape: RoundedRectangleBorder(
            borderRadius: BhojanDimens.roundedPill,
          ),
          elevation: 0,
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: BhojanColors.primary,
          side: const BorderSide(color: BhojanColors.outline, width: 1.0),
          shape: RoundedRectangleBorder(
            borderRadius: BhojanDimens.roundedPill,
          ),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: BhojanColors.surface,
        selectedColor: BhojanColors.primaryContainer,
        disabledColor: BhojanColors.surfaceDim,
        labelStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: BhojanColors.onSurface,
        ),
        secondaryLabelStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: BhojanColors.primaryDark,
        ),
        side: const BorderSide(color: BhojanColors.outline, width: 0.8),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BhojanColors.surface,
        hintStyle: const TextStyle(
          fontSize: 14,
          color: BhojanColors.textMuted,
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BhojanDimens.roundedInput,
          borderSide: const BorderSide(color: BhojanColors.outline, width: 0.8),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BhojanDimens.roundedInput,
          borderSide: const BorderSide(color: BhojanColors.outline, width: 0.8),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BhojanDimens.roundedInput,
          borderSide: const BorderSide(color: BhojanColors.primary, width: 1.5),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: BhojanColors.outline,
        thickness: 0.8,
        space: 16,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: BhojanColors.surface,
        indicatorColor: BhojanColors.primaryContainer,
        elevation: 0,
        height: 64.0,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: BhojanColors.primary,
            );
          }
          return const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: BhojanColors.onSurfaceVariant,
          );
        }),
      ),
    );
  }
}
