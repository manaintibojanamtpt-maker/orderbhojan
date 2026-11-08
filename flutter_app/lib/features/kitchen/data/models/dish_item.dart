import 'package:equatable/equatable.dart';

class CustomizationOption extends Equatable {
  final String id;
  final String name;
  final String? subtitle;
  final int extraPrice;

  const CustomizationOption({
    required this.id,
    required this.name,
    this.subtitle,
    this.extraPrice = 0,
  });

  factory CustomizationOption.fromMap(Map<String, dynamic> map) {
    return CustomizationOption(
      id: map['id'] as String? ?? '',
      name: map['name'] as String? ?? '',
      subtitle: map['subtitle'] as String?,
      extraPrice: (map['extraPrice'] as num?)?.toInt() ?? 0,
    );
  }

  @override
  List<Object?> get props => [id, name, subtitle, extraPrice];
}

class DishItem extends Equatable {
  final String id;
  final String kitchenId;
  final String name;
  final String description;
  final int price;
  final int? originalPrice;
  final bool isVeg;
  final String imageUrl;
  final bool isBestseller;
  final bool isAvailable;
  final int inStock;
  final int prepTimeMinutes;
  final String category;
  final List<CustomizationOption> portionOptions;
  final List<CustomizationOption> riceOptions;
  final List<CustomizationOption> addOnOptions;

  const DishItem({
    required this.id,
    required this.kitchenId,
    required this.name,
    required this.description,
    required this.price,
    this.originalPrice,
    required this.isVeg,
    required this.imageUrl,
    this.isBestseller = false,
    this.isAvailable = true,
    this.inStock = 999,
    this.prepTimeMinutes = 20,
    required this.category,
    this.portionOptions = const [],
    this.riceOptions = const [],
    this.addOnOptions = const [],
  });

  factory DishItem.fromFirestore(
      Map<String, dynamic> data, String id, String kitchenId) {
    List<CustomizationOption> parseOptions(dynamic rawList) {
      if (rawList is List) {
        return rawList
            .whereType<Map<String, dynamic>>()
            .map(CustomizationOption.fromMap)
            .toList();
      }
      return const [];
    }

    return DishItem(
      id: id,
      kitchenId: kitchenId,
      name: data['name'] as String? ?? 'Special Dish',
      description: data['description'] as String? ?? '',
      price: (data['price'] as num?)?.toInt() ?? 199,
      originalPrice: (data['originalPrice'] as num?)?.toInt(),
      isVeg: data['isVeg'] as bool? ?? true,
      imageUrl: data['imageUrl'] as String? ??
          'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&auto=format&fit=crop&q=80',
      isBestseller: data['isBestseller'] as bool? ?? false,
      isAvailable:
          data['isAvailable'] as bool? ?? data['available'] as bool? ?? true,
      inStock: (data['inStock'] as num?)?.toInt() ??
          (data['stock'] as num?)?.toInt() ??
          999,
      prepTimeMinutes: (data['prepTimeMinutes'] as num?)?.toInt() ?? 20,
      category: data['category'] as String? ?? 'Main Course',
      portionOptions: parseOptions(data['portionOptions']),
      riceOptions: parseOptions(data['riceOptions']),
      addOnOptions: parseOptions(data['addOnOptions']),
    );
  }

  @override
  List<Object?> get props => [
        id,
        kitchenId,
        name,
        description,
        price,
        originalPrice,
        isVeg,
        imageUrl,
        isBestseller,
        isAvailable,
        inStock,
        prepTimeMinutes,
        category,
        portionOptions,
        riceOptions,
        addOnOptions,
      ];
}
