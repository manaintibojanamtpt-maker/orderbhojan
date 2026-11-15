import '../entities/customer_user.dart';

abstract class AuthRepository {
  Stream<CustomerUser?> get authStateChanges;
  CustomerUser? get currentCustomer;
  Future<CustomerUser> signInWithGoogle();
  Future<CustomerUser> continueAsGuest();
  Future<void> signOut();
}
