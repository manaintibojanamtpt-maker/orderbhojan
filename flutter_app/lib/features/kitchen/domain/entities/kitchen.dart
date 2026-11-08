import 'package:equatable/equatable.dart';

class Kitchen extends Equatable {
  final String id;
  final String name;
  final String slug;
  final String description;
  final double rating;
  final int ratingCount;
  final List<String> cuisines;
  final String etaText;
  final double distanceKm;
  final int priceForTwo;
  final int deliveryFee;
  final int minOrder;
  final bool isOpen;
  final bool isPureVeg;
  final bool isHomeKitchen;
  final String? chefName;
  final String? offer;
  final String imageUrl;
  final String? logoUrl;
  final List<String> gallery;
  final String todayHours;
  final bool fssaiCertified;
  final String? badgeText;
  final String? address;
  final double? lat;
  final double? lng;
  final int? gstPercent;
  final int? packagingFee;
  final int? baseDeliveryFee;
  final double? freeDeliveryRadiusKm;
  final double? baseDeliveryRadiusKm;
  final double? maxDeliveryRadiusKm;
  final int? additionalFeePerKm;
  final String? upiVpa;
  final String? upiPayeeName;

  const Kitchen({
    required this.id,
    required this.name,
    required this.slug,
    this.description =
        'Authentic homestyle Indian kitchen preparing meals with traditional hospitality and fresh ingredients.',
    required this.rating,
    required this.ratingCount,
    required this.cuisines,
    required this.etaText,
    required this.distanceKm,
    required this.priceForTwo,
    this.deliveryFee = 20,
    this.minOrder = 99,
    this.isOpen = true,
    this.isPureVeg = false,
    this.isHomeKitchen = true,
    this.chefName,
    this.offer,
    required this.imageUrl,
    this.logoUrl,
    this.gallery = const [],
    this.todayHours = '11:00 AM – 11:00 PM',
    this.fssaiCertified = true,
    this.badgeText,
    this.address,
    this.lat,
    this.lng,
    this.gstPercent,
    this.packagingFee,
    this.baseDeliveryFee,
    this.freeDeliveryRadiusKm,
    this.baseDeliveryRadiusKm,
    this.maxDeliveryRadiusKm,
    this.additionalFeePerKm,
    this.upiVpa,
    this.upiPayeeName,
  });

  factory Kitchen.fromFirestore(Map<String, dynamic> data, String id) {
    final rawStatus = data['openStatus'] as String? ??
        (data['isOpen'] == false ? 'closed' : 'open');
    final isOpen = rawStatus == 'open' || (data['isOpen'] as bool? ?? true);

    List<String> parseGallery(dynamic raw) {
      if (raw is List) {
        return raw
            .map((e) {
              if (e is Map) return e['url']?.toString() ?? '';
              return e.toString();
            })
            .where((url) => url.isNotEmpty)
            .toList();
      }
      return const [];
    }

    return Kitchen(
      id: id,
      name: data['displayName'] as String? ??
          data['name'] as String? ??
          'Home Kitchen',
      slug: data['restaurantSlug'] as String? ?? data['slug'] as String? ?? id,
      description: data['description'] as String? ??
          'Authentic homestyle Indian kitchen preparing meals with traditional hospitality and fresh ingredients.',
      rating: (data['rating'] as num?)?.toDouble() ?? 4.8,
      ratingCount: (data['ratingCount'] as num?)?.toInt() ?? 120,
      cuisines: (data['cuisines'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const ['Homestyle'],
      etaText: data['etaMinutes'] is Map
          ? '${(data['etaMinutes'] as Map)['min'] ?? 25}-${(data['etaMinutes'] as Map)['max'] ?? 35} min'
          : data['etaText'] as String? ?? '25-35 min',
      distanceKm: (data['distanceKm'] as num?)?.toDouble() ??
          (data['distance'] as num?)?.toDouble() ??
          1.8,
      priceForTwo: (data['priceForTwo'] as num?)?.toInt() ?? 350,
      deliveryFee: (data['deliveryFee'] as num?)?.toInt() ?? 20,
      minOrder: (data['minOrder'] as num?)?.toInt() ?? 99,
      isOpen: isOpen,
      isPureVeg: (data['badges'] as List<dynamic>?)?.contains('pure_veg') ??
          (data['veg'] as bool? ?? false),
      isHomeKitchen: data['kitchenFormat'] == 'home_kitchen' ||
          (data['kitchenFormat'] as String? ?? '').contains('home'),
      chefName: data['chefName'] as String?,
      offer: data['offer'] as String?,
      imageUrl: data['coverUrl'] as String? ??
          data['coverImage'] as String? ??
          data['imageUrl'] as String? ??
          'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1200&auto=format&fit=crop&q=85',
      logoUrl: data['logoUrl'] as String? ?? data['logo'] as String?,
      gallery: parseGallery(data['gallery']),
      todayHours: data['todayHours'] as String? ?? '11:00 AM – 11:00 PM',
      badgeText: data['badgeText'] as String?,
      address: data['address'] as String? ?? data['kitchenAddress'] as String?,
      lat: (data['lat'] as num?)?.toDouble() ??
          (data['latitude'] as num?)?.toDouble(),
      lng: (data['lng'] as num?)?.toDouble() ??
          (data['longitude'] as num?)?.toDouble(),
      gstPercent: (data['gstPercent'] as num?)?.toInt() ??
          (data['gst'] as num?)?.toInt(),
      packagingFee: (data['packagingFee'] as num?)?.toInt(),
      baseDeliveryFee: (data['baseDeliveryFee'] as num?)?.toInt(),
      freeDeliveryRadiusKm: (data['freeDeliveryRadiusKm'] as num?)?.toDouble(),
      baseDeliveryRadiusKm: (data['baseDeliveryRadiusKm'] as num?)?.toDouble(),
      maxDeliveryRadiusKm: (data['maxDeliveryRadiusKm'] as num?)?.toDouble(),
      additionalFeePerKm: (data['additionalFeePerKm'] as num?)?.toInt(),
      upiVpa: data['upiVpa'] as String? ?? data['paymentVpa'] as String?,
      upiPayeeName: data['upiPayeeName'] as String? ??
          data['payeeName'] as String?,
    );
  }

  bool get hasLocation => lat != null && lng != null;
  String? get canonicalAddress => address;
  String? get canonicalVpa => upiVpa;
  String? get canonicalPayeeName => upiPayeeName ?? name;
  bool isServiceableAtDistance(double distanceKm) {
    final r = maxDeliveryRadiusKm ?? 15.0;
    return distanceKm <= r;
  }

  @override
  List<Object?> get props => [
        id,
        name,
        slug,
        description,
        rating,
        ratingCount,
        cuisines,
        etaText,
        distanceKm,
        priceForTwo,
        deliveryFee,
        minOrder,
        isOpen,
        isPureVeg,
        isHomeKitchen,
        chefName,
        offer,
        imageUrl,
        logoUrl,
        gallery,
        todayHours,
      ];
}
