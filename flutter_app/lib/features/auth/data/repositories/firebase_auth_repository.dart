import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/services/preferences_service.dart';
import '../../domain/entities/customer_user.dart';
import '../../domain/repositories/auth_repository.dart';

class FirebaseAuthRepository implements AuthRepository {
  final fb_auth.FirebaseAuth? _auth;
  final FirebaseFirestore? _firestore;
  final GoogleSignIn _googleSignIn;

  CustomerUser? _cachedCustomer;
  final StreamController<CustomerUser?> _controller =
      StreamController<CustomerUser?>.broadcast();

  FirebaseAuthRepository({
    fb_auth.FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    GoogleSignIn? googleSignIn,
  })  : _auth = auth,
        _firestore = firestore,
        _googleSignIn =
            googleSignIn ?? GoogleSignIn(scopes: ['email', 'profile']) {
    _initAuthListener();
  }

  void _initAuthListener() {
    if (_auth != null) {
      _auth.authStateChanges().listen((fb_auth.User? user) async {
        if (user == null) {
          _cachedCustomer = null;
          _controller.add(null);
        } else {
          final customer = await _fetchOrUpsertCustomer(user);
          _cachedCustomer = customer;
          _controller.add(customer);
        }
      });
    }
  }

  @override
  Stream<CustomerUser?> get authStateChanges => _controller.stream;

  @override
  CustomerUser? get currentCustomer => _cachedCustomer;

  @override
  Future<CustomerUser> signInWithGoogle() async {
    try {
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        throw Exception('Google Sign-In was cancelled by user.');
      }

      final googleAuth = await googleUser.authentication;
      final credential = fb_auth.GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      if (_auth != null) {
        final userCredential = await _auth.signInWithCredential(credential);
        final fbUser = userCredential.user;
        if (fbUser == null) {
          throw Exception('Firebase authentication returned empty user.');
        }
        final customer = await _fetchOrUpsertCustomer(fbUser);
        _cachedCustomer = customer;
        _controller.add(customer);
        return customer;
      } else {
        // Fallback if testing without live Firebase
        final customer = CustomerUser(
          uid: googleUser.id,
          displayName: googleUser.displayName ?? 'Google User',
          email: googleUser.email,
          photoUrl: googleUser.photoUrl,
          authProviders: const ['google'],
        );
        _cachedCustomer = customer;
        _controller.add(customer);
        return customer;
      }
    } catch (e) {
      debugPrint('[FirebaseAuthRepository] Google Sign-In error: $e');
      rethrow;
    }
  }

  @override
  Future<CustomerUser> continueAsGuest() async {
    final guest = CustomerUser.guest();
    _cachedCustomer = guest;
    _controller.add(guest);
    return guest;
  }

  @override
  Future<void> signOut() async {
    try {
      await _googleSignIn.signOut();
      if (_auth != null) {
        await _auth.signOut();
      }
    } finally {
      _cachedCustomer = null;
      _controller.add(null);
    }
  }

  Future<CustomerUser> _fetchOrUpsertCustomer(fb_auth.User user) async {
    if (_firestore == null) {
      return CustomerUser(
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        photoUrl: user.photoURL,
        authProviders: const ['google'],
      );
    }

    final docRef = _firestore.collection('customers').doc(user.uid);
    try {
      if (sl.isRegistered<PreferencesService>()) {
        await sl<PreferencesService>().syncAddressesFromFirestore(
          uid: user.uid,
          firestore: _firestore,
        );
      }
    } catch (_) {}

    try {
      final snapshot = await docRef.get();
      if (snapshot.exists && snapshot.data() != null) {
        // Returning user - preserve existing profile and preferences
        await docRef.set({
          'lastLoginAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));

        return CustomerUser.fromFirestore(snapshot.data()!, user.uid);
      } else {
        // New user profile creation
        final newCustomer = CustomerUser(
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          photoUrl: user.photoURL,
          authProviders: const ['google'],
          preferences: const CustomerPreferences(),
        );

        await docRef.set({
          ...newCustomer.toFirestore(),
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
          'lastLoginAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));

        return newCustomer;
      }
    } catch (e) {
      debugPrint(
          '[FirebaseAuthRepository] Firestore customer profile error: $e');
      return CustomerUser(
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        photoUrl: user.photoURL,
        authProviders: const ['google'],
      );
    }
  }
}
