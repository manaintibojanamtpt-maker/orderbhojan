import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

enum BhojanButtonType { primary, secondary, outline }

class BhojanButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final Widget? leadingIcon;
  final Widget? trailingIcon;
  final BhojanButtonType type;
  final double? width;

  BhojanButton({
    super.key,
    String? label,
    String? text,
    required this.onPressed,
    this.isLoading = false,
    Widget? leadingIcon,
    this.trailingIcon,
    IconData? icon,
    this.type = BhojanButtonType.primary,
    this.width,
  })  : label = label ?? text ?? '',
        leadingIcon = leadingIcon ??
            (icon != null
                ? Icon(
                    icon,
                    size: 18,
                    color: type == BhojanButtonType.primary
                        ? BhojanColors.onPrimary
                        : BhojanColors.primaryDark,
                  )
                : null);

  @override
  Widget build(BuildContext context) {
    Color bgColor;
    Color fgColor;
    BorderSide borderSide = BorderSide.none;

    switch (type) {
      case BhojanButtonType.primary:
        bgColor = BhojanColors.primary;
        fgColor = BhojanColors.onPrimary;
        break;
      case BhojanButtonType.secondary:
        bgColor = BhojanColors.primaryContainer;
        fgColor = BhojanColors.primaryDark;
        break;
      case BhojanButtonType.outline:
        bgColor = Colors.transparent;
        fgColor = BhojanColors.onSurface;
        borderSide = const BorderSide(color: BhojanColors.outline, width: 1.0);
        break;
    }

    return SizedBox(
      width: width ?? double.infinity,
      height: 52.0,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: bgColor,
          foregroundColor: fgColor,
          disabledBackgroundColor: BhojanColors.surfaceDim,
          elevation: 0,
          shadowColor: Colors.transparent,
          side: borderSide,
          shape: RoundedRectangleBorder(borderRadius: BhojanDimens.roundedPill),
          padding: const EdgeInsets.symmetric(horizontal: BhojanDimens.space24),
        ),
        child: isLoading
            ? SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  valueColor: AlwaysStoppedAnimation<Color>(fgColor),
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (leadingIcon != null) ...[
                    leadingIcon!,
                    const SizedBox(width: BhojanDimens.space8),
                  ],
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: fgColor,
                    ),
                  ),
                  if (trailingIcon != null) ...[
                    const SizedBox(width: BhojanDimens.space8),
                    trailingIcon!,
                  ],
                ],
              ),
      ),
    );
  }
}
