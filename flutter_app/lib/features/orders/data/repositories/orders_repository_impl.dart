import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../domain/entities/customer_order.dart';
import '../../domain/repositories/orders_repository.dart';

class OrdersRepositoryImpl implements OrdersRepository {
  final FirebaseFirestore? _firestore;
  final SharedPreferences _prefs;
  final Dio? _dio;

  static const String _keyOrders = 'ob_customer_orders_v3';

  OrdersRepositoryImpl({
    FirebaseFirestore? firestore,
    required SharedPreferences prefs,
    Dio? dio,
  })  : _firestore = firestore,
        _prefs = prefs,
        _dio = dio;

  @override
  Future<List<CustomerOrder>> getOrders() async {
    // 1. Load local persistent orders (purged of dummy seed orders)
    final List<CustomerOrder> localOrders = _loadLocalOrders();

    // 2. Fetch scoped orders from Firestore for the authenticated customer
    final currentUser = FirebaseAuth.instance.currentUser;
    if (_firestore != null && currentUser != null) {
      try {
        final snapshot = await _firestore
            .collection('orders')
            .where('customerId', isEqualTo: currentUser.uid)
            .orderBy('createdAt', descending: true)
            .limit(20)
            .get();

        if (snapshot.docs.isNotEmpty) {
          final remoteOrders = snapshot.docs.map((doc) {
            final data = doc.data();
            data['id'] = doc.id;
            return CustomerOrder.fromJson(data);
          }).toList();

          final Map<String, CustomerOrder> merged = {};
          for (final order in remoteOrders) {
            merged[order.id] = order;
          }
          for (final order in localOrders) {
            if (!merged.containsKey(order.id)) {
              merged[order.id] = order;
            }
          }
          final result = merged.values.toList();
          result.sort((a, b) => b.createdAt.compareTo(a.createdAt));
          await _saveLocalOrders(result);
          return result;
        }
      } catch (e) {
        debugPrint('[OrdersRepository] Firestore scoped getOrders note: $e');
      }
    }

    localOrders.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return localOrders;
  }

  @override
  Future<CustomerOrder> placeOrder(CustomerOrder rawOrder) async {
    // Attach authenticated customer identity
    final currentUser = FirebaseAuth.instance.currentUser;
    final order = rawOrder.copyWith(
      customerId: currentUser?.uid,
      customerName: currentUser?.displayName ?? rawOrder.customerName,
      customerPhone: currentUser?.phoneNumber ?? rawOrder.customerPhone,
    );

    // Save locally for instant zero-latency UX in customer app
    final list = _loadLocalOrders();
    list.removeWhere((o) => o.id == order.id);
    list.insert(0, order);
    await _saveLocalOrders(list);

    // Note: The authoritative Firestore order document is created exclusively by the
    // BhojanOS backend via /api/marketplace/checkout/place to guarantee atomic inventory,
    // server-verified pricing, and proper POS listener triggering without client tampering.
    return order;
  }

  @override
  Future<OrderPlaceResult> placeOrderWithResult(CustomerOrder rawOrder) async {
    final order = await placeOrder(rawOrder);
    // placeOrder already awaited _saveLocalOrders; re-verify so the caller can
    // observe persistence failure instead of assuming it from a BLoC dispatch.
    final persisted = _loadLocalOrders().any((o) => o.id == order.id);
    return OrderPlaceResult(order, persisted: persisted);
  }

  @override
  Stream<CustomerOrder?> watchOrder(String orderId) {
    if (_firestore != null) {
      return _firestore
          .collection('orders')
          .doc(orderId)
          .snapshots()
          .asyncMap((snapshot) async {
        if (snapshot.exists && snapshot.data() != null) {
          final data = snapshot.data()!;
          data['id'] = snapshot.id;
          final order = CustomerOrder.fromJson(data);
          // Keep local persistent storage updated with the authoritative server status
          final list = _loadLocalOrders();
          final idx = list.indexWhere((o) => o.id == order.id);
          if (idx != -1) {
            list[idx] = order;
          } else {
            list.insert(0, order);
          }
          await _saveLocalOrders(list);
          return order;
        }
        return await getOrderById(orderId);
      }).handleError((e) {
        debugPrint('[OrdersRepository] watchOrder stream note: $e');
        return null;
      });
    }
    return Stream.fromFuture(getOrderById(orderId));
  }

  @override
  Future<void> updateOrderRating(String orderId, int rating) async {
    final list = _loadLocalOrders();
    final idx = list.indexWhere((o) => o.id == orderId);
    if (idx != -1) {
      list[idx] = list[idx].copyWith(rating: rating);
      await _saveLocalOrders(list);
    }

    if (_firestore != null) {
      try {
        await _firestore.collection('orders').doc(orderId).update({
          'rating': rating,
        });
      } catch (e) {
        debugPrint('[OrdersRepository] Firestore updateRating warning: $e');
      }
    }

    if (_dio != null) {
      try {
        await _dio.post(
          '/api/marketplace/orders/$orderId/feedback',
          data: {'rating': rating},
          options: Options(receiveTimeout: const Duration(seconds: 4)),
        );
      } catch (_) {}
    }
  }

  @override
  Future<CustomerOrder?> getOrderById(String orderId) async {
    // 1. Try fetching live tracking from backend first
    if (_dio != null) {
      try {
        // Authenticated users get Bearer token for /tracking; guests use
        // /guest-tracking with the "Authorization: Guest <jwt>" scheme.
        final currentUser = FirebaseAuth.instance.currentUser;
        final isGuest = orderId.isEmpty == false && currentUser == null;
        final String endpoint = isGuest
            ? '/api/marketplace/orders/$orderId/guest-tracking'
            : '/api/marketplace/orders/$orderId/tracking';
        final Map<String, String>? authOptions;
        if (isGuest) {
          // The backend requires the guest-tracking JWT in the Authorization
          // header. Without it the endpoint 401s and tracking silently falls
          // back to stale local state.
          final local = _loadLocalOrders()
              .where((o) => o.id == orderId)
              .toList();
          final token = local.isNotEmpty ? local.first.guestTrackingToken : null;
          authOptions = (token != null && token.isNotEmpty)
              ? {'Authorization': 'Guest $token'}
              : null;
        } else {
          authOptions = (currentUser != null)
              ? {'Authorization': 'Bearer ${await currentUser.getIdToken()}'}
              : null;
        }
        final res = await _dio.get(
          endpoint,
          options: authOptions != null
              ? Options(headers: authOptions, receiveTimeout: const Duration(seconds: 4))
              : Options(receiveTimeout: const Duration(seconds: 4)),
        );
        if (res.statusCode == 200 && res.data is Map) {
          final data = res.data as Map<String, dynamic>;
          final mappedOrder = _mapTrackingResponseToOrder(data, orderId);
          if (mappedOrder != null) {
            // Update local storage with live backend status
            final list = _loadLocalOrders();
            final idx = list.indexWhere((o) => o.id == orderId);
            if (idx != -1) {
              list[idx] = mappedOrder;
            } else {
              list.insert(0, mappedOrder);
            }
            await _saveLocalOrders(list);
            return mappedOrder;
          }
        }
      } catch (e) {
        debugPrint('[OrdersRepository] getTracking API note: $e');
      }
    }

    // 2. Try Firestore
    if (_firestore != null) {
      try {
        final doc = await _firestore.collection('orders').doc(orderId).get();
        if (doc.exists && doc.data() != null) {
          final data = doc.data()!;
          data['id'] = doc.id;
          return CustomerOrder.fromJson(data);
        }
      } catch (_) {}
    }

    // 3. Fallback to local persistent cache
    final list = await getOrders();
    try {
      return list.firstWhere((o) => o.id == orderId);
    } catch (_) {
      return list.isNotEmpty ? list.first : null;
    }
  }

  CustomerOrder? _mapTrackingResponseToOrder(
      Map<String, dynamic> data, String orderId) {
    try {
      final rawStatus = (data['lifecycleStatus'] as String? ??
              data['status'] as String? ??
              'PLACED')
          .toUpperCase();
      String parsedStatus = 'confirmed';
      int parsedStep = 1;

      if (rawStatus == 'PLACED' || rawStatus == 'NEW') {
        parsedStatus = 'confirmed';
        parsedStep = 1;
      } else if (rawStatus == 'ACCEPTED' || rawStatus == 'PREPARING') {
        parsedStatus = 'cooking';
        parsedStep = 2;
      } else if (rawStatus == 'READY' || rawStatus == 'OUT_FOR_DELIVERY') {
        parsedStatus = 'out_for_delivery';
        parsedStep = 3;
      } else if (rawStatus == 'DELIVERED' || rawStatus == 'COMPLETED') {
        parsedStatus = 'delivered';
        parsedStep = 4;
      }

      final restaurant = data['restaurant'] as Map<String, dynamic>?;
      final kName = restaurant?['displayName'] as String? ?? 'Unknown';
      final kId = restaurant?['restaurantId'] as String? ?? '';

      return CustomerOrder(
        id: orderId,
        kitchenId: kId,
        kitchenName: kName,
        kitchenAddress: null,
        items: const [],
        total: 0,
        status: parsedStatus,
        statusStep: parsedStep,
        eta: parsedStatus == 'delivered' ? 'Delivered' : 'Arriving in 20 mins',
        paymentMode: data['paymentStatus'] != null
            ? 'Paid (${data['paymentStatus']})'
            : 'UPI (Google Pay)',
        deliveryAddress: 'Delivery Address',
        createdAt: DateTime.now(),
      );
    } catch (_) {
      return null;
    }
  }

  List<CustomerOrder> _loadLocalOrders() {
    final raw = _prefs.getString(_keyOrders);
    if (raw == null || raw.isEmpty) return [];
    try {
      final decoded = jsonDecode(raw) as List;
      return decoded
          .map((e) => CustomerOrder.fromJson(e as Map<String, dynamic>))
          .where((o) =>
              !o.id.startsWith('ORD-892104') &&
              !o.id.startsWith('ORD-761298'))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _saveLocalOrders(List<CustomerOrder> orders) async {
    final encoded = jsonEncode(orders.map((o) => o.toJson()).toList());
    await _prefs.setString(_keyOrders, encoded);
  }

  @override
  Future<PaymentClaimResult> claimPayment(
    String orderId, {
    required String phone,
    String? upiReference,
  }) async {
    if (_dio == null) {
      return PaymentClaimResult(
        orderId,
        PaymentClaimStatus.failed,
        message: 'Network unavailable; payment claim not sent.',
      );
    }

    // Resolve the canonical order from local cache so a claim failure still
    // preserves the order ID and any guest-tracking token the customer needs
    // to retry tracking. This call never creates a new order.
    final existing = _loadLocalOrders()
        .where((o) => o.id == orderId)
        .toList();
    final CustomerOrder? current =
        existing.isNotEmpty ? existing.first : null;

    try {
      final response = await _dio.post(
        '/api/marketplace/orders/$orderId/payment-claim',
        data: {
          'phone': phone,
          'upiReference':
              (upiReference == null || upiReference.trim().isEmpty)
                  ? 'UPI_APP_PAYMENT'
                  : upiReference.trim(),
        },
        options: Options(receiveTimeout: const Duration(seconds: 4)),
      );

      final ok = response.data is Map &&
          (response.data as Map<String, dynamic>)['ok'] == true;
      final message = response.data is Map
          ? (response.data as Map<String, dynamic>)['error'] is Map
              ? ((response.data as Map<String, dynamic>)['error'] as Map)
                      ['message'] as String?
              : (response.data as Map<String, dynamic>)['message'] as String?
          : null;

      final status = ok ? PaymentClaimStatus.verified : PaymentClaimStatus.failed;
      final resolved = current?.copyWith(paymentClaimStatus: status) ??
          CustomerOrder(
            id: orderId,
            kitchenId: '',
            kitchenName: '',
            total: 0,
            status: 'pending',
            statusStep: 0,
            eta: '',
            paymentMode: 'UPI (Awaiting Verification)',
            createdAt: DateTime.now(),
            items: const [],
            paymentClaimStatus: status,
          );

      final list = _loadLocalOrders();
      list.removeWhere((o) => o.id == orderId);
      list.insert(0, resolved);
      await _saveLocalOrders(list);

      return PaymentClaimResult(orderId, status, message: message);
    } catch (e) {
      // A network failure is NOT a payment failure: the claim was never
      // received. Preserve the order and let the customer retry safely.
      final resolved = current?.copyWith(
            paymentClaimStatus: PaymentClaimStatus.pending,
          ) ??
          CustomerOrder(
            id: orderId,
            kitchenId: '',
            kitchenName: '',
            total: 0,
            status: 'pending',
            statusStep: 0,
            eta: '',
            paymentMode: 'UPI (Awaiting Verification)',
            createdAt: DateTime.now(),
            items: const [],
            paymentClaimStatus: PaymentClaimStatus.pending,
          );

      final list = _loadLocalOrders();
      list.removeWhere((o) => o.id == orderId);
      list.insert(0, resolved);
      await _saveLocalOrders(list);

      return PaymentClaimResult(
        orderId,
        PaymentClaimStatus.pending,
        message: 'Payment claim not sent: $e',
      );
    }
  }
}
