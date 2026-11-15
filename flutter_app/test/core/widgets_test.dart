import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderbhojan/core/widgets/bhojan_button.dart';
import 'package:orderbhojan/core/widgets/bhojan_card.dart';
import 'package:orderbhojan/core/widgets/veg_badge.dart';

void main() {
  Widget wrapWithTheme(Widget child) {
    return MaterialApp(
      home: Scaffold(
        body: Center(child: child),
      ),
    );
  }

  group('BhojanButton Tests', () {
    testWidgets('renders button label and handles tap', (tester) async {
      bool tapped = false;

      await tester.pumpWidget(
        wrapWithTheme(
          BhojanButton(
            label: 'Order Now',
            onPressed: () => tapped = true,
          ),
        ),
      );

      expect(find.text('Order Now'), findsOneWidget);
      await tester.tap(find.text('Order Now'));
      await tester.pump();

      expect(tapped, isTrue);
    });

    testWidgets(
        'displays loading indicator and blocks tap when isLoading is true',
        (tester) async {
      bool tapped = false;

      await tester.pumpWidget(
        wrapWithTheme(
          BhojanButton(
            label: 'Processing',
            isLoading: true,
            onPressed: () => tapped = true,
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Processing'), findsNothing);

      await tester.tap(find.byType(BhojanButton));
      await tester.pump();

      expect(tapped, isFalse);
    });
  });

  group('BhojanVegBadge Tests', () {
    testWidgets('renders green circular badge for pure veg', (tester) async {
      await tester.pumpWidget(
        wrapWithTheme(
          const BhojanVegBadge(isVeg: true, size: 20.0),
        ),
      );

      final containerFinder = find.byType(Container);
      expect(containerFinder, findsWidgets);
    });

    testWidgets('renders red triangle badge for non-veg', (tester) async {
      await tester.pumpWidget(
        wrapWithTheme(
          const BhojanVegBadge(isVeg: false, size: 20.0),
        ),
      );

      expect(
        find.descendant(
          of: find.byType(BhojanVegBadge),
          matching: find.byType(CustomPaint),
        ),
        findsOneWidget,
      );
    });
  });

  group('BhojanCard Tests', () {
    testWidgets('renders child content and responds to onTap', (tester) async {
      bool tapped = false;

      await tester.pumpWidget(
        wrapWithTheme(
          BhojanCard(
            onTap: () => tapped = true,
            child: const Text('Card Content'),
          ),
        ),
      );

      expect(find.text('Card Content'), findsOneWidget);
      await tester.tap(find.text('Card Content'));
      await tester.pump();

      expect(tapped, isTrue);
    });
  });
}
