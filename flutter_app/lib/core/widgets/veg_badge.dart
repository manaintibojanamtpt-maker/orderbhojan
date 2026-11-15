import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class BhojanVegBadge extends StatelessWidget {
  final bool isVeg;
  final double size;

  const BhojanVegBadge({
    super.key,
    required this.isVeg,
    this.size = 16.0,
  });

  @override
  Widget build(BuildContext context) {
    final color = isVeg ? BhojanColors.vegGreen : BhojanColors.nonVegRed;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: color, width: 1.2),
        borderRadius: BorderRadius.circular(4.0),
      ),
      padding: EdgeInsets.all(size * 0.2),
      child: Center(
        child: isVeg
            ? Container(
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              )
            : CustomPaint(
                size: Size(size * 0.6, size * 0.6),
                painter: _TrianglePainter(color: color),
              ),
      ),
    );
  }
}

/// Convenience alias
typedef VegBadge = BhojanVegBadge;

class _TrianglePainter extends CustomPainter {
  final Color color;
  const _TrianglePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    final path = Path()
      ..moveTo(size.width / 2, 0)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
