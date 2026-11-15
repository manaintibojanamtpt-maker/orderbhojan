import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

class BhojanCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final Color? backgroundColor;
  final Color? borderColor;
  final BorderRadius? borderRadius;
  final bool hasShadow;

  const BhojanCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.onTap,
    this.backgroundColor,
    this.borderColor,
    this.borderRadius,
    this.hasShadow = true,
  });

  @override
  Widget build(BuildContext context) {
    final effectiveRadius = borderRadius ?? BhojanDimens.roundedCard;
    final effectiveBg = backgroundColor ?? BhojanColors.surface;
    final effectiveBorder = borderColor ?? BhojanColors.outline;

    Widget content = Container(
      padding: padding ?? const EdgeInsets.all(BhojanDimens.space16),
      decoration: BoxDecoration(
        color: effectiveBg,
        borderRadius: effectiveRadius,
        border: Border.all(color: effectiveBorder, width: 0.8),
        boxShadow: hasShadow ? BhojanDimens.cardShadow : null,
      ),
      child: child,
    );

    if (onTap != null) {
      content = Material(
        color: Colors.transparent,
        borderRadius: effectiveRadius,
        child: InkWell(
          onTap: onTap,
          borderRadius: effectiveRadius,
          child: content,
        ),
      );
    }

    if (margin != null) {
      content = Padding(padding: margin!, child: content);
    }

    return content;
  }
}
