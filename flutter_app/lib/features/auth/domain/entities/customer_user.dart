import 'package:equatable/equatable.dart';

class CustomerPreferences extends Equatable {
  final bool notifications;
  final bool marketing;
  final String spiceLevel; // 'Mild' | 'Medium' | 'Hot'
  final String dietary; // 'Veg' | 'Egg' | 'Non-veg'

  const CustomerPreferences({
    this.notifications = true,
    this.marketing = false,
    this.spiceLevel = 'Medium',
    this.dietary = 'Veg',
  });

  factory CustomerPreferences.fromMap(Map<String, dynamic>? map) {
    if (map == null) return const CustomerPreferences();
    return CustomerPreferences(
      notifications: map['notifications'] as bool? ?? true,
      marketing: map['marketing'] as bool? ?? false,
      spiceLevel: map['spiceLevel'] as String? ?? 'Medium',
      dietary: map['dietary'] as String? ?? 'Veg',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'notifications': notifications,
      'marketing': marketing,
      'spiceLevel': spiceLevel,
      'dietary': dietary,
    };
  }

  @override
  List<Object?> get props => [notifications, marketing, spiceLevel, dietary];
}

class CustomerUser extends Equatable {
  final String uid;
  final String? displayName;
  final String? email;
  final String? phoneNumber;
  final String? photoUrl;
  final List<String> authProviders;
  final bool isAnonymous;
  final CustomerPreferences preferences;

  const CustomerUser({
    required this.uid,
    this.displayName,
    this.email,
    this.phoneNumber,
    this.photoUrl,
    this.authProviders = const ['google'],
    this.isAnonymous = false,
    this.preferences = const CustomerPreferences(),
  });

  factory CustomerUser.guest() {
    return const CustomerUser(
      uid: 'guest_customer',
      displayName: 'Guest Foodie',
      authProviders: ['guest'],
      isAnonymous: true,
    );
  }

  factory CustomerUser.fromFirestore(Map<String, dynamic> data, String uid) {
    return CustomerUser(
      uid: uid,
      displayName: data['displayName'] as String?,
      email: data['email'] as String?,
      phoneNumber: data['phoneNumber'] as String?,
      photoUrl: data['photoURL'] as String?,
      authProviders: (data['authProviders'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const ['google'],
      isAnonymous: false,
      preferences: CustomerPreferences.fromMap(
        data['preferences'] as Map<String, dynamic>?,
      ),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'uid': uid,
      'displayName': displayName,
      'email': email,
      'phoneNumber': phoneNumber,
      'photoURL': photoUrl,
      'authProviders': authProviders,
      'preferences': preferences.toMap(),
    };
  }

  @override
  List<Object?> get props => [
        uid,
        displayName,
        email,
        phoneNumber,
        photoUrl,
        authProviders,
        isAnonymous,
        preferences,
      ];
}
