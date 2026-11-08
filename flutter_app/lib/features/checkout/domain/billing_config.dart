class BillingConfig {
  final int gstPercent;
  final int packagingFee;
  final int baseDeliveryFee;
  final double freeDeliveryRadiusKm;
  final double baseDeliveryRadiusKm;
  final double maxDeliveryRadiusKm;
  final int additionalFeePerKm;

  const BillingConfig({
    this.gstPercent = 0,
    this.packagingFee = 10,
    this.baseDeliveryFee = 40,
    this.freeDeliveryRadiusKm = 2.0,
    this.baseDeliveryRadiusKm = 7.0,
    this.maxDeliveryRadiusKm = 15.0,
    this.additionalFeePerKm = 10,
  });

  int deliveryFeeForDistance(double distanceKm) {
    if (distanceKm <= freeDeliveryRadiusKm) return 0;
    if (distanceKm > maxDeliveryRadiusKm) return -1; // out of zone
    if (distanceKm <= baseDeliveryRadiusKm) return baseDeliveryFee;
    final extraKm = distanceKm - baseDeliveryRadiusKm;
    return baseDeliveryFee + (extraKm * additionalFeePerKm).ceil();
  }

  int gstAmountOn(int subtotal) {
    if (subtotal == 0) return 0;
    return (subtotal * gstPercent / 100).round();
  }

  int packagingFeeFor(int subtotal) =>
      subtotal == 0 ? 0 : packagingFee;

  int calculateTotal({
    required int subtotal,
    required double distanceKm,
    required int discount,
    required int tip,
  }) {
    final df = deliveryFeeForDistance(distanceKm);
    if (df < 0) return -1; // unserviceable
    return [subtotal, df, packagingFeeFor(subtotal), gstAmountOn(subtotal), tip]
            .reduce((a, b) => a + b) -
        discount;
  }

  BillingConfig copyWith({
    int? gstPercent,
    int? packagingFee,
    int? baseDeliveryFee,
    double? freeDeliveryRadiusKm,
    double? baseDeliveryRadiusKm,
    double? maxDeliveryRadiusKm,
    int? additionalFeePerKm,
  }) {
    return BillingConfig(
      gstPercent: gstPercent ?? this.gstPercent,
      packagingFee: packagingFee ?? this.packagingFee,
      baseDeliveryFee: baseDeliveryFee ?? this.baseDeliveryFee,
      freeDeliveryRadiusKm: freeDeliveryRadiusKm ?? this.freeDeliveryRadiusKm,
      baseDeliveryRadiusKm: baseDeliveryRadiusKm ?? this.baseDeliveryRadiusKm,
      maxDeliveryRadiusKm: maxDeliveryRadiusKm ?? this.maxDeliveryRadiusKm,
      additionalFeePerKm: additionalFeePerKm ?? this.additionalFeePerKm,
    );
  }
}
