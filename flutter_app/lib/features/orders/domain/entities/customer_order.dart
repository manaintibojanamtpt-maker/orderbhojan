/// Outcome of a customer-side UPI payment-claim request.
///
/// The POS/backend remains the authority on whether a payment was actually
/// received. This enum only records what the customer's claim call resolved to,
/// so the UI can tell "payment pending verification" apart from "claim failed"
/// instead of showing both as a silent success.
enum PaymentClaimStatus {
  pending,
  verified,
  failed,
}

class CustomerOrderItem {
  final String id;
  final String name;
  final int qty;
  final int price;
  final bool isVeg;
  final String? portion;

  const CustomerOrderItem({
    required this.id,
    required this.name,
    required this.qty,
    required this.price,
    required this.isVeg,
    this.portion,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'itemId': id,
        'name': name,
        'qty': qty,
        'quantity': qty,
        'price': price,
        'unitPrice': price,
        'lineTotal': price * qty,
        'isVeg': isVeg,
        if (portion != null) 'portion': portion,
      };

  factory CustomerOrderItem.fromJson(Map<String, dynamic> json) =>
      CustomerOrderItem(
        id: json['itemId'] as String? ?? json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        qty: (json['quantity'] as num?)?.toInt() ??
            (json['qty'] as num?)?.toInt() ??
            1,
        price: (json['unitPrice'] as num?)?.toInt() ??
            (json['price'] as num?)?.toInt() ??
            0,
        isVeg: json['isVeg'] as bool? ?? false,
        portion: json['portion'] as String?,
      );
}

class CustomerOrder {
  final String id;
  final String kitchenId;
  final String kitchenName;
  final String? kitchenAddress;
  final List<CustomerOrderItem> items;
  final int total;
  final String
      status; // 'confirmed', 'cooking', 'out_for_delivery', 'delivered'
  final int
      statusStep; // 1: Confirmed, 2: Cooking, 3: Out for Delivery, 4: Delivered
  final String eta;
  final String paymentMode;
  final String? deliveryAddress;
  final DateTime createdAt;
  final int? rating;
  final String? customerId;
  final String? customerName;
  final String? customerPhone;
  // Guest-tracking JWT issued by backend for non-logged-in users (valid 24h, single orderId).
  // Used with /guest-tracking endpoint which requires "Authorization: Guest <jwt>" auth.
  final String? guestTrackingToken;
  // Result of the last customer-side UPI payment-claim call. null = claim never
  // attempted. The authoritative payment decision still belongs to the POS/backend;
  // this only records what the customer's claim request resolved to so the UI can
  // distinguish "pending" from "failed" instead of treating both as success.
  final PaymentClaimStatus? paymentClaimStatus;

  const CustomerOrder({
    required this.id,
    required this.kitchenId,
    required this.kitchenName,
    this.kitchenAddress,
    required this.items,
    required this.total,
    required this.status,
    required this.statusStep,
    required this.eta,
    required this.paymentMode,
    this.deliveryAddress,
    required this.createdAt,
    this.rating,
    this.customerId,
    this.customerName,
    this.customerPhone,
    this.guestTrackingToken,
    this.paymentClaimStatus,
  });

  bool get isActive => status != 'delivered';

  CustomerOrder copyWith({
    String? status,
    int? statusStep,
    String? eta,
    int? rating,
    String? customerId,
    String? customerName,
    String? customerPhone,
    String? guestTrackingToken,
    PaymentClaimStatus? paymentClaimStatus,
  }) {
    return CustomerOrder(
      id: id,
      kitchenId: kitchenId,
      kitchenName: kitchenName,
      kitchenAddress: kitchenAddress,
      items: items,
      total: total,
      status: status ?? this.status,
      statusStep: statusStep ?? this.statusStep,
      eta: eta ?? this.eta,
      paymentMode: paymentMode,
      deliveryAddress: deliveryAddress,
      createdAt: createdAt,
      rating: rating ?? this.rating,
      customerId: customerId ?? this.customerId,
      customerName: customerName ?? this.customerName,
      customerPhone: customerPhone ?? this.customerPhone,
      guestTrackingToken: guestTrackingToken ?? this.guestTrackingToken,
      paymentClaimStatus: paymentClaimStatus ?? this.paymentClaimStatus,
    );
  }

  /// Exports schema fully compatible with POS terminal listeners (tenantId, orderStatus, pricing)
  Map<String, dynamic> toJson() {
    final subtotal = items.fold<int>(0, (sum, i) => sum + (i.price * i.qty));
    final deliveryFee = total > subtotal ? total - subtotal : 20;

    return {
      'id': id,
      'orderId': id,
      'tenantId': kitchenId,
      'kitchenId': kitchenId,
      'kitchenName': kitchenName,
      'kitchenAddress': kitchenAddress,
      'items': items.map((i) => i.toJson()).toList(),
      'total': total,
      'totalAmount': total,
      'subtotal': subtotal,
      'deliveryFee': deliveryFee,
      'pricing': {
        'subtotal': subtotal,
        'deliveryFee': deliveryFee,
        'taxes': 0,
        'total': total,
      },
      'status': status,
      'orderStatus': _toPosOrderStatus(status),
      'orderSource': 'ORDERBHOJAN',
      'statusStep': statusStep,
      'eta': eta,
      'paymentMode': paymentMode,
      'deliveryAddress': deliveryAddress,
      'createdAt': createdAt.toIso8601String(),
      if (rating != null) 'rating': rating,
      if (customerId != null) 'customerId': customerId,
      if (customerName != null) 'customerName': customerName,
      if (customerPhone != null) 'customerPhone': customerPhone,
      if (guestTrackingToken != null) 'guestTrackingToken': guestTrackingToken,
      if (paymentClaimStatus != null) 'paymentClaimStatus': paymentClaimStatus!.name,
      'customer': {
        'id': customerId,
        'name': customerName ?? 'Customer',
        'phone': customerPhone ?? '',
      },
    };
  }

  factory CustomerOrder.fromJson(Map<String, dynamic> json) {
    final rawStatus = (json['orderStatus'] as String? ??
            json['status'] as String? ??
            'cooking')
        .toLowerCase();

    String parsedStatus = 'cooking';
    int parsedStep = 2;

    if (rawStatus == 'placed' || rawStatus == 'confirmed') {
      parsedStatus = 'confirmed';
      parsedStep = 1;
    } else if (rawStatus == 'cooking' ||
        rawStatus == 'preparing' ||
        rawStatus == 'accepted') {
      parsedStatus = 'cooking';
      parsedStep = 2;
    } else if (rawStatus == 'out_for_delivery' || rawStatus == 'ready') {
      parsedStatus = 'out_for_delivery';
      parsedStep = 3;
    } else if (rawStatus == 'delivered' || rawStatus == 'completed') {
      parsedStatus = 'delivered';
      parsedStep = 4;
    }

    final kitchenId = json['tenantId'] as String? ??
        json['kitchenId'] as String? ??
        'obr_mana_inti_001';

    final kitchenName = json['kitchenName'] as String? ??
        json['displayName'] as String? ??
        'Inti Bojanam – Ghar Ka Khana';

    final total = (json['totalAmount'] as num?)?.toInt() ??
        (json['total'] as num?)?.toInt() ??
        0;

    return CustomerOrder(
      id: json['id'] as String? ??
          json['orderId'] as String? ??
          'ORD-${DateTime.now().millisecondsSinceEpoch}',
      kitchenId: kitchenId,
      kitchenName: kitchenName,
      kitchenAddress: json['kitchenAddress'] as String?,
      items: (json['items'] as List<dynamic>?)
              ?.map((item) =>
                  CustomerOrderItem.fromJson(item as Map<String, dynamic>))
              .toList() ??
          [],
      total: total,
      status: parsedStatus,
      statusStep:
          json['statusStep'] is int ? json['statusStep'] as int : parsedStep,
      eta: json['eta'] as String? ??
          (parsedStatus == 'delivered' ? 'Delivered' : 'Arriving in 25 mins'),
      paymentMode: json['paymentMode'] as String? ?? 'UPI (Google Pay)',
      deliveryAddress: json['deliveryAddress'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String) ?? DateTime.now()
          : DateTime.now(),
      rating: (json['rating'] as num?)?.toInt(),
      customerId: json['customerId'] as String? ??
          (json['customer'] is Map ? (json['customer'] as Map)['id'] as String? : null),
      customerName: json['customerName'] as String? ??
          (json['customer'] is Map ? (json['customer'] as Map)['name'] as String? : null),
      customerPhone: json['customerPhone'] as String? ??
          (json['customer'] is Map ? (json['customer'] as Map)['phone'] as String? : null),
      guestTrackingToken: json['guestTrackingToken'] as String?,
      paymentClaimStatus: _parsePaymentClaimStatus(json['paymentClaimStatus']),
    );
  }

  static String _toPosOrderStatus(String status) {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return 'PLACED';
      case 'cooking':
        return 'PREPARING';
      case 'out_for_delivery':
        return 'OUT_FOR_DELIVERY';
      case 'delivered':
        return 'COMPLETED';
      default:
        return 'PLACED';
    }
  }

  static PaymentClaimStatus? _parsePaymentClaimStatus(dynamic value) {
    if (value is PaymentClaimStatus) return value;
    if (value is String) {
      for (final s in PaymentClaimStatus.values) {
        if (s.name == value) return s;
      }
    }
    return null;
  }
}
