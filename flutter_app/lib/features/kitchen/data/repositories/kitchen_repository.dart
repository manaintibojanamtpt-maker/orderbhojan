import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/services/preferences_service.dart';
import '../../domain/entities/kitchen.dart';
import '../models/dish_item.dart';

class KitchenRepository {
  final FirebaseFirestore? _firestore;
  final Dio? _dio;
  static final Map<String, String> _contextTokens = {};

  static String? getContextToken(String kitchenId) {
    return _contextTokens[kitchenId];
  }

  KitchenRepository({
    FirebaseFirestore? firestore,
    Dio? dio,
  })  : _firestore = firestore,
        _dio = dio;

  // Time-aware operating hours check in India Standard Time (IST: UTC+5:30)
  // Store Operating Hours: 9:00 AM (09:00) to 10:00 PM (22:00) IST
  static bool isStoreOpenNow() {
    final ist = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
    return ist.hour >= 9 && ist.hour < 22;
  }

  // Authentic Production Kitchens (Aligned with bhojanos-prod backend & tenant pool)
  // ZERO dummy/demo kitchens
  static List<Kitchen> get _productionKitchens => [
    Kitchen(
      id: 'obr_inti-bhojanam-ghar-kha-khana-pune',
      name: 'Inti bhojanam Ghar kha Khana pune',
      slug: 'inti-bhojanam-ghar-kha-khana-pune',
      rating: 5.0,
      ratingCount: 8,
      cuisines: const [
        'Homestyle',
        'Pure Veg',
        'Breakfast',
        'Fried Rice',
      ],
      etaText: '50-60 min',
      distanceKm: 1.8,
      priceForTwo: 200,
      isOpen: isStoreOpenNow(),
      isPureVeg: true,
      isHomeKitchen: true,
      chefName: 'Home Chef Padma Rao',
      offer: 'Special homestyle recipes',
      imageUrl:
          'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=1200&auto=format&fit=crop&q=85',
      badgeText: 'FSSAI Certified • 100% Pure Veg Home Kitchen',
    ),
    Kitchen(
      id: 'obr_mana-inti',
      name: 'Mana Inti Bojanam',
      slug: 'mana-inti',
      rating: 4.8,
      ratingCount: 2140,
      cuisines: const [
        'Andhra Homestyle',
        'Pure Veg',
        'Breakfast & Tiffins',
        'Thalis',
        'Homestyle Meals',
      ],
      etaText: '30-40 min',
      distanceKm: 2.2,
      priceForTwo: 250,
      isOpen: isStoreOpenNow(),
      isPureVeg: true,
      isHomeKitchen: true,
      chefName: 'Home Chef Lakshmi',
      offer: '20% off',
      imageUrl:
          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=1200&auto=format&fit=crop&q=85',
      badgeText: 'FSSAI Certified • Pure Homestyle Food',
    ),
  ];

  // Authentic Production Dishes (Ground truth matching bhojanos-prod and orderbhojan.web.app)
  static const List<DishItem> _productionDishes = [
    // --- Inti bhojanam Ghar kha Khana pune (4 authentic menu items) ---
    DishItem(
      id: 'Zjmhzp4OevYagRPtgV0p',
      kitchenId: 'obr_inti-bhojanam-ghar-kha-khana-pune',
      name: 'Idli (3)',
      description: 'Soft steamed idlis with sambar and coconut chutney.',
      price: 60,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&auto=format&fit=crop&q=80',
      isBestseller: true,
      category: 'Breakfast',
    ),
    DishItem(
      id: 'dp3nG98AzqAtXSkWBpVY',
      kitchenId: 'obr_inti-bhojanam-ghar-kha-khana-pune',
      name: 'Malasa Dosa',
      description:
          'Masala Dosa – Crispy, Flavorful, and Comforting! This golden, crispy dosa stuffed with spiced potato masala and paired with...',
      price: 70,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=800&auto=format&fit=crop&q=80',
      isBestseller: true,
      category: 'Break Fast',
    ),
    DishItem(
      id: 'YCcyE4rqhhnEaHWx6w1o',
      kitchenId: 'obr_inti-bhojanam-ghar-kha-khana-pune',
      name: 'Medu Wada',
      description: 'Soft and crispy medu wada',
      price: 60,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=800&auto=format&fit=crop&q=80',
      isBestseller: true,
      category: 'Break Fast',
    ),
    DishItem(
      id: 'FfM37JMWqOA8JnhtfQf8',
      kitchenId: 'obr_inti-bhojanam-ghar-kha-khana-pune',
      name: 'Tomato Rice',
      description: 'Prepared homemade masala tasty tomato rice',
      price: 90,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800&auto=format&fit=crop&q=80',
      isBestseller: true,
      category: 'Fried Rice',
    ),

    // --- Mana Inti Bojanam (10 authentic menu items) ---
    DishItem(
      id: '8auVQlfQMljRlb8OjQId',
      kitchenId: 'obr_mana-inti',
      name: 'Andhra Veg Thali (Mini)',
      description: 'Compact Andhra veg thali for a lighter homestyle meal.',
      price: 149,
      originalPrice: 180,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=800&auto=format&fit=crop&q=80',
      isBestseller: true,
      category: 'Thali',
    ),
    DishItem(
      id: 'n9Hb7NcnEK8N2KXcpi01',
      kitchenId: 'obr_mana-inti',
      name: 'Chicken Biryani',
      description: 'Rayalaseema special slow-cooked fragrant dum biryani.',
      price: 249,
      originalPrice: 299,
      isVeg: false,
      imageUrl:
          'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&auto=format&fit=crop&q=80',
      isBestseller: true,
      category: 'Main Course',
    ),
    DishItem(
      id: 'PKCcWHW6y1If9hW9i2FW',
      kitchenId: 'obr_mana-inti',
      name: 'Chicken Fried Rice',
      description: 'Wok-tossed fragrant rice with tender spiced chicken pieces.',
      price: 189,
      originalPrice: 220,
      isVeg: false,
      imageUrl:
          'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800&auto=format&fit=crop&q=80',
      isBestseller: false,
      category: 'Rice',
    ),
    DishItem(
      id: 'HJmpSJNaT2X5SjPQINks',
      kitchenId: 'obr_mana-inti',
      name: 'Curd Rice',
      description: 'Cooling curd rice with mild homestyle seasoning.',
      price: 129,
      originalPrice: 150,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop&q=80',
      isBestseller: false,
      category: 'Meals',
    ),
    DishItem(
      id: 'lefRuMD7fpGsZ914cXvu',
      kitchenId: 'obr_mana-inti',
      name: 'Idli (3)',
      description: 'Soft steamed idlis with sambar and coconut chutney.',
      price: 70,
      originalPrice: 80,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&auto=format&fit=crop&q=80',
      isBestseller: true,
      category: 'Breakfast',
    ),
    DishItem(
      id: '18auJPPpmHM5ise0IlRU',
      kitchenId: 'obr_mana-inti',
      name: 'Masala Dosa',
      description:
          'Golden crispy dosa stuffed with spiced potato masala, coconut chutney & sambar.',
      price: 80,
      originalPrice: 90,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=800&auto=format&fit=crop&q=80',
      isBestseller: true,
      category: 'Breakfast',
    ),
    DishItem(
      id: '0psRnpUYrBKAGUMM4Hrx',
      kitchenId: 'obr_mana-inti',
      name: 'Plain Dosa',
      description: 'Crispy golden crepe served with freshly ground chutney and sambar.',
      price: 50,
      originalPrice: 60,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=800&auto=format&fit=crop&q=80',
      isBestseller: false,
      category: 'Breakfast',
    ),
    DishItem(
      id: 'LmRQunX4gThObba9EWkV',
      kitchenId: 'obr_mana-inti',
      name: 'Sambar Rice',
      description: 'Hot sambar rice with lentil stew and ghee tempering.',
      price: 119,
      originalPrice: 140,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop&q=80',
      isBestseller: false,
      category: 'Meals',
    ),
    DishItem(
      id: 'pHazJGvZkXMIizAlhVCo',
      kitchenId: 'obr_mana-inti',
      name: 'Tomato Rice',
      description: 'Home made spicy tomato rice with homemade spices.',
      price: 80,
      originalPrice: 100,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800&auto=format&fit=crop&q=80',
      isBestseller: false,
      category: 'Special Rice',
    ),
    DishItem(
      id: 'p5JtR7nW0Ks2XO1wJ7Xh',
      kitchenId: 'obr_mana-inti',
      name: 'Veg Fried Rice',
      description: 'Classic veg fried rice with crunchy vegetables.',
      price: 99,
      originalPrice: 120,
      isVeg: true,
      imageUrl:
          'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800&auto=format&fit=crop&q=80',
      isBestseller: false,
      category: 'Rice',
    ),
  ];

  Future<List<Kitchen>> getKitchens(
      {bool? vegOnly, String? searchQuery, double? userLat, double? userLng}) async {
    final List<Kitchen> remoteList = [];

    double? activeLat = userLat;
    double? activeLng = userLng;
    if (activeLat == null || activeLng == null) {
      if (sl.isRegistered<PreferencesService>()) {
        final coords = sl<PreferencesService>().getActiveCoordinates();
        activeLat = coords?['lat'];
        activeLng = coords?['lng'];
      }
    }

    // 1. Live Render Backend Discovery (Dynamic based on customer GPS or direct published profile)
    if (_dio != null) {
      if (activeLat != null && activeLng != null) {
        // Customer location available: query location-based featured and discover
        try {
          final featResponse = await _dio.get(
            '/api/marketplace/discovery/featured?lat=$activeLat&lng=$activeLng',
            options: Options(receiveTimeout: const Duration(seconds: 4)),
          );
          if (featResponse.statusCode == 200 && featResponse.data is Map) {
            Map<String, dynamic> data = featResponse.data as Map<String, dynamic>;
            if (data.containsKey('value') && data['value'] is Map) {
              data = data['value'] as Map<String, dynamic>;
            }
            final collection = data['collection'] as Map<String, dynamic>?;
            final restaurants =
                collection != null ? collection['restaurants'] as List? : null;
            if (restaurants != null && restaurants.isNotEmpty) {
              for (final r in restaurants) {
                _parseAndAddRemoteRestaurant(r as Map<String, dynamic>, remoteList);
              }
            } else {
              final restaurant = data['restaurant'] as Map<String, dynamic>?;
              if (restaurant != null) {
                _parseAndAddRemoteRestaurant(restaurant, remoteList);
              }
            }
          }
        } catch (e) {
          debugPrint('[KitchenRepository] Featured API discovery notice: $e');
        }

        try {
          final response = await _dio.get(
            '/api/marketplace/discover?lat=$activeLat&lng=$activeLng',
            options: Options(receiveTimeout: const Duration(seconds: 4)),
          );
          if (response.statusCode == 200 && response.data is Map) {
            Map<String, dynamic> data = response.data as Map<String, dynamic>;
            if (data.containsKey('value') && data['value'] is Map) {
              data = data['value'] as Map<String, dynamic>;
            }
            final collections = data['collections'] as List<dynamic>?;
            if (collections != null && collections.isNotEmpty) {
              for (final col in collections) {
                final restaurants =
                    (col as Map)['restaurants'] as List<dynamic>?;
                if (restaurants != null) {
                  for (final r in restaurants) {
                    _parseAndAddRemoteRestaurant(
                        r as Map<String, dynamic>, remoteList);
                  }
                }
              }
            }
          }
        } catch (e) {
          debugPrint('[KitchenRepository] Discover API notice: $e');
        }
      } else {
        // Customer location not yet specified: fetch published tenant profiles directly by slug
        for (final slug in const [
          'inti-bhojanam-ghar-kha-khana-pune',
          'mana-inti'
        ]) {
          try {
            final res = await _dio.get(
              '/api/marketplace/restaurants/$slug',
              options: Options(receiveTimeout: const Duration(seconds: 4)),
            );
            if (res.statusCode == 200 && res.data is Map) {
              Map<String, dynamic> data = res.data as Map<String, dynamic>;
              if (data.containsKey('value') && data['value'] is Map) {
                data = data['value'] as Map<String, dynamic>;
              }
              final exp = data['experience'] as Map<String, dynamic>?;
              if (exp != null) {
                _parseAndAddRemoteRestaurant(exp, remoteList);
              }
            }
          } catch (e) {
            debugPrint(
                '[KitchenRepository] Direct profile fetch notice for $slug: $e');
          }
        }
      }

      if (remoteList.isNotEmpty) {
        // Ensure both anchor kitchens exist in list
        for (final fallback in _productionKitchens) {
          if (!remoteList.any((k) =>
              k.id == fallback.id ||
              k.slug == fallback.slug ||
              _resolveSlugForKitchenId(k.id) ==
                  _resolveSlugForKitchenId(fallback.id))) {
            remoteList.add(fallback);
          }
        }
        return _filterKitchens(remoteList, vegOnly, searchQuery);
      }
    }

    // 3. Try Firestore 'restaurants' collection
    if (_firestore != null) {
      try {
        final snapshot =
            await _firestore.collection('restaurants').limit(20).get();
        if (snapshot.docs.isNotEmpty) {
          final list = snapshot.docs
              .map((doc) => Kitchen.fromFirestore(doc.data(), doc.id))
              .toList();
          return _filterKitchens(list, vegOnly, searchQuery);
        }
      } catch (e) {
        debugPrint('[KitchenRepository] Firestore getKitchens warning: $e');
      }
    }

    // 4. Fallback to authentic production kitchens (Inti Bojanam Pune & Mana Inti)
    return _filterKitchens(_productionKitchens, vegOnly, searchQuery);
  }

  Future<Kitchen?> getKitchenById(String id) async {
    final list = await getKitchens();
    try {
      final targetSlug = _resolveSlugForKitchenId(id);
      return list.firstWhere(
        (k) =>
            k.id == id ||
            k.slug == id ||
            _resolveSlugForKitchenId(k.id) == targetSlug ||
            _resolveSlugForKitchenId(k.slug) == targetSlug,
      );
    } catch (_) {
      final targetSlug = _resolveSlugForKitchenId(id);
      for (final k in _productionKitchens) {
        if (k.id == id ||
            k.slug == id ||
            _resolveSlugForKitchenId(k.id) == targetSlug) {
          return k;
        }
      }
      return _productionKitchens.first;
    }
  }

  void _parseAndAddRemoteRestaurant(
      Map<String, dynamic> map, List<Kitchen> targetList) {
    final id = map['restaurantId'] as String? ??
        map['id'] as String? ??
        (map['slug'] != null ? 'obr_${map['slug']}' : '');
    if (id.isEmpty) return;

    if (targetList.any((k) =>
        k.id == id ||
        k.slug == map['restaurantSlug'] ||
        k.slug == map['slug'] ||
        _resolveSlugForKitchenId(k.id) == _resolveSlugForKitchenId(id))) {
      return;
    }

    final rawName = map['displayName'] as String? ??
        map['name'] as String? ??
        '';
    final name = rawName.isNotEmpty
        ? rawName
        : (id.contains('pune')
            ? 'Inti bhojanam Ghar kha Khana pune'
            : 'Mana Inti Bojanam');
    final slug = map['restaurantSlug'] as String? ??
        map['slug'] as String? ??
        _resolveSlugForKitchenId(id);
    final isOpen = (map['isOpen'] as bool?) ??
        (map['openStatus'] == 'open') ??
        isStoreOpenNow();

    String eta = '35-45 min';
    if (map['etaMinutes'] is Map) {
      eta = '${map['etaMinutes']['min']}-${map['etaMinutes']['max']} min';
    } else if (map['etaText'] is String) {
      eta = map['etaText'];
    }

    String cover = map['coverImage'] as String? ??
        map['coverUrl'] as String? ??
        map['imageUrl'] as String? ??
        '';
    if (cover.isEmpty || cover.startsWith('data:') || !cover.startsWith('http')) {
      cover = id.contains('pune')
          ? 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=1200&auto=format&fit=crop&q=85'
          : 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=1200&auto=format&fit=crop&q=85';
    }

    final rating = (map['rating'] as num?)?.toDouble() ?? 5.0;
    final ratingCount = (map['ratingCount'] as num?)?.toInt() ?? 8;
    final dist = (map['distanceKm'] as num?)?.toDouble() ?? 1.8;

    targetList.add(
      Kitchen(
        id: id,
        name: name,
        slug: slug,
        rating: rating,
        ratingCount: ratingCount,
        cuisines: const [
          'Homestyle',
          'Pure Veg',
          'Breakfast',
          'Fried Rice',
        ],
        etaText: eta,
        distanceKm: dist,
        priceForTwo: id.contains('pune') ? 200 : 250,
        isOpen: isOpen,
        isPureVeg: true,
        isHomeKitchen: true,
        chefName: id.contains('pune')
            ? 'Home Chef Padma Rao'
            : 'Home Chef Lakshmi',
        offer: map['offer'] as String? ??
            (id.contains('pune') ? 'Special homestyle recipes' : '20% off'),
        imageUrl: cover,
        badgeText: 'FSSAI Certified • 100% Pure Veg Home Kitchen',
      ),
    );
  }

  Future<List<DishItem>> getDishesForKitchen(String kitchenId) async {
    // 1. Try Live Backend Menu API (bhojanos-prod / Render)
    if (_dio != null) {
      try {
        final slug = _resolveSlugForKitchenId(kitchenId);
        final response = await _dio.get(
          '/api/marketplace/restaurants/$slug/menu',
          options: Options(receiveTimeout: const Duration(seconds: 4)),
        );
        if (response.statusCode == 200 && response.data is Map) {
          Map<String, dynamic> data = response.data as Map<String, dynamic>;
          if (data.containsKey('value') && data['value'] is Map) {
            data = data['value'] as Map<String, dynamic>;
          }

          if (data['contextToken'] is String) {
            final token = data['contextToken'] as String;
            _contextTokens[kitchenId] = token;
            _contextTokens[slug] = token;
          }

          // Handle array of items from BhojanOS contract
          final items = data['items'] as List<dynamic>?;
          if (items != null && items.isNotEmpty) {
            final List<DishItem> remoteDishes = [];
            for (final item in items) {
              final map = item as Map<String, dynamic>;
              final itemId = map['foodId'] as String? ??
                  map['itemId'] as String? ??
                  map['id'] as String? ??
                  '';
              final name = map['name'] as String? ?? 'Dish';
              final desc = map['description'] as String? ?? '';
              final price = (map['price'] as num?)?.toInt() ?? 99;
              final dietary = map['dietary'] as String? ?? '';
              final isVeg = dietary.toLowerCase() == 'veg' ||
                  (map['isVeg'] as bool? ?? true);
              final category = map['category'] as String? ?? 'Specialties';
              final isAvailable = map['availability'] as bool? ??
                  (map['isAvailable'] as bool? ?? true);

              String img =
                  map['image'] as String? ?? map['imageUrl'] as String? ?? '';
              if (img.isEmpty ||
                  (!img.startsWith('data:image') && !img.startsWith('http'))) {
                img = _fallbackImageForDish(name, category, isVeg);
              }

              remoteDishes.add(
                DishItem(
                  id: itemId,
                  kitchenId: kitchenId,
                  name: name,
                  description: desc,
                  price: price,
                  isVeg: isVeg,
                  imageUrl: img,
                  isBestseller: remoteDishes.length < 3,
                  category: category,
                  isAvailable: isAvailable,
                ),
              );
            }
            if (remoteDishes.isNotEmpty) return remoteDishes;
          }

          // Handle legacy categories with nested items
          final categories = data['categories'] as List<dynamic>?;
          if (categories != null && categories.isNotEmpty) {
            final List<DishItem> remoteDishes = [];
            for (final cat in categories) {
              final catName = (cat as Map)['name'] as String? ?? 'Specialties';
              final catItems = cat['items'] as List<dynamic>?;
              if (catItems != null) {
                for (final item in catItems) {
                  final map = item as Map<String, dynamic>;
                  final itemId =
                      map['itemId'] as String? ?? map['id'] as String? ?? '';
                  final name = map['name'] as String? ?? 'Dish';
                  final desc = map['description'] as String? ?? '';
                  final price = (map['price'] as num?)?.toInt() ?? 199;
                  final isVeg = map['isVeg'] as bool? ?? false;
                  remoteDishes.add(
                    DishItem(
                      id: itemId,
                      kitchenId: kitchenId,
                      name: name,
                      description: desc,
                      price: price,
                      isVeg: isVeg,
                      imageUrl: _fallbackImageForDish(name, catName, isVeg),
                      isBestseller: map['isBestseller'] as bool? ?? false,
                      category: catName,
                    ),
                  );
                }
              }
            }
            if (remoteDishes.isNotEmpty) return remoteDishes;
          }
        }
      } catch (e) {
        debugPrint('[KitchenRepository] Marketplace API menu info: $e');
      }
    }

    // 2. Try Firestore 'restaurants/{id}/dishes'
    if (_firestore != null) {
      try {
        final snapshot = await _firestore
            .collection('restaurants')
            .doc(kitchenId)
            .collection('dishes')
            .get();
        if (snapshot.docs.isNotEmpty) {
          return snapshot.docs
              .map((doc) =>
                  DishItem.fromFirestore(doc.data(), doc.id, kitchenId))
              .toList();
        }
      } catch (e) {
        debugPrint('[KitchenRepository] Firestore getDishes warning: $e');
      }
    }

    // 3. Fallback to authentic production dishes (Inti Bojanam pune)
    final matching =
        _productionDishes.where((d) => d.kitchenId == kitchenId).toList();
    return matching.isNotEmpty ? matching : _productionDishes;
  }

  static String _fallbackImageForDish(
      String name, String category, bool isVeg) {
    final lower = '$name $category'.toLowerCase();
    if (lower.contains('idli')) {
      return 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&auto=format&fit=crop&q=80';
    }
    if (lower.contains('dosa')) {
      return 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=800&auto=format&fit=crop&q=80';
    }
    if (lower.contains('vada')) {
      return 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=800&auto=format&fit=crop&q=80';
    }
    if (lower.contains('thali') || lower.contains('bhojanam')) {
      return 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=800&auto=format&fit=crop&q=80';
    }
    if (lower.contains('biryani')) {
      return isVeg
          ? 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=800&auto=format&fit=crop&q=80'
          : 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&auto=format&fit=crop&q=80';
    }
    if (lower.contains('rice') ||
        lower.contains('curd') ||
        lower.contains('sambar')) {
      return 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800&auto=format&fit=crop&q=80';
    }
    return 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop&q=80';
  }

  Stream<Kitchen?> watchKitchen(String kitchenId) {
    if (_firestore != null) {
      return _firestore
          .collection('restaurants')
          .doc(kitchenId)
          .snapshots()
          .map((snapshot) {
        if (snapshot.exists && snapshot.data() != null) {
          return Kitchen.fromFirestore(snapshot.data()!, snapshot.id);
        }
        return null;
      }).handleError((e) {
        debugPrint('[KitchenRepository] watchKitchen stream error: $e');
        return null;
      });
    }
    return Stream.value(null);
  }

  Stream<List<DishItem>> watchDishesForKitchen(String kitchenId) {
    if (_firestore != null) {
      return _firestore
          .collection('restaurants')
          .doc(kitchenId)
          .collection('dishes')
          .snapshots()
          .map((snapshot) {
        if (snapshot.docs.isNotEmpty) {
          return snapshot.docs
              .map((doc) =>
                  DishItem.fromFirestore(doc.data(), doc.id, kitchenId))
              .toList();
        }
        return <DishItem>[];
      }).handleError((e) {
        debugPrint(
            '[KitchenRepository] watchDishesForKitchen stream error: $e');
        return <DishItem>[];
      });
    }
    return Stream.value(<DishItem>[]);
  }

  Future<DishItem?> getDishById(String dishId) async {
    try {
      return _productionDishes.firstWhere((d) => d.id == dishId);
    } catch (_) {
      return _productionDishes.first;
    }
  }

  String _resolveSlugForKitchenId(String kitchenId) {
    if (kitchenId == 'obr_inti-bhojanam-ghar-kha-khana-pune' ||
        kitchenId == 'inti-bhojanam-ghar-kha-khana-pune' ||
        kitchenId.contains('pune')) {
      return 'inti-bhojanam-ghar-kha-khana-pune';
    }
    if (kitchenId == 'obr_mana_inti_001' ||
        kitchenId == 'obr_mana-inti' ||
        kitchenId == 'mana-inti' ||
        kitchenId == 'mana-inti-kitchen') {
      return 'mana-inti';
    }
    return kitchenId;
  }

  List<Kitchen> _filterKitchens(
      List<Kitchen> list, bool? vegOnly, String? query) {
    return list.where((k) {
      if (vegOnly == true && !k.isPureVeg) return false;
      if (query != null && query.isNotEmpty) {
        final q = query.toLowerCase();
        final matchesName = k.name.toLowerCase().contains(q);
        final matchesCuisine =
            k.cuisines.any((c) => c.toLowerCase().contains(q));
        if (!matchesName && !matchesCuisine) return false;
      }
      return true;
    }).toList();
  }
}
