import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderbhojan/features/auth/domain/entities/customer_user.dart';
import 'package:orderbhojan/features/auth/domain/repositories/auth_repository.dart';
import 'package:orderbhojan/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:orderbhojan/features/auth/presentation/bloc/auth_event.dart';
import 'package:orderbhojan/features/auth/presentation/bloc/auth_state.dart';

class FakeAuthRepository implements AuthRepository {
  CustomerUser? _currentUser;
  final StreamController<CustomerUser?> _controller =
      StreamController<CustomerUser?>.broadcast();

  @override
  CustomerUser? get currentCustomer => _currentUser;

  @override
  Stream<CustomerUser?> get authStateChanges => _controller.stream;

  @override
  Future<CustomerUser> signInWithGoogle() async {
    _currentUser = const CustomerUser(
      uid: 'test-google-uid-123',
      displayName: 'Aravind Swaminathan',
      email: 'aravind@example.com',
      photoUrl: 'https://example.com/avatar.jpg',
      authProviders: ['google'],
    );
    _controller.add(_currentUser);
    return _currentUser!;
  }

  @override
  Future<CustomerUser> continueAsGuest() async {
    _currentUser = CustomerUser.guest();
    _controller.add(_currentUser);
    return _currentUser!;
  }

  @override
  Future<void> signOut() async {
    _currentUser = null;
    _controller.add(null);
  }

  void dispose() {
    _controller.close();
  }
}

void main() {
  group('AuthBloc Tests', () {
    late FakeAuthRepository fakeAuthRepository;
    late AuthBloc authBloc;

    setUp(() {
      fakeAuthRepository = FakeAuthRepository();
      authBloc = AuthBloc(authRepository: fakeAuthRepository);
    });

    tearDown(() {
      authBloc.close();
      fakeAuthRepository.dispose();
    });

    test('initial state is AuthInitial', () {
      expect(authBloc.state, isA<AuthInitial>());
    });

    test('AuthCheckRequested emits Unauthenticated when no user signed in',
        () async {
      authBloc.add(const AuthCheckRequested());
      await expectLater(
        authBloc.stream,
        emits(isA<Unauthenticated>()),
      );
    });

    test(
        'AuthGoogleSignInRequested emits AuthLoading then Authenticated on success',
        () async {
      authBloc.add(const AuthGoogleSignInRequested());
      await expectLater(
        authBloc.stream,
        emitsInOrder([
          isA<AuthLoading>(),
          predicate<AuthState>((state) {
            return state is Authenticated &&
                state.user.uid == 'test-google-uid-123' &&
                state.user.email == 'aravind@example.com';
          }),
        ]),
      );
    });

    test('AuthGuestAccessRequested emits AuthLoading then Authenticated guest',
        () async {
      authBloc.add(const AuthGuestAccessRequested());
      await expectLater(
        authBloc.stream,
        emitsInOrder([
          isA<AuthLoading>(),
          predicate<AuthState>((state) {
            return state is Authenticated && state.user.isAnonymous;
          }),
        ]),
      );
    });

    test('AuthSignOutRequested emits AuthLoading then Unauthenticated',
        () async {
      authBloc.add(const AuthGoogleSignInRequested());
      await expectLater(
        authBloc.stream,
        emitsThrough(isA<Authenticated>()),
      );

      authBloc.add(const AuthSignOutRequested());
      await expectLater(
        authBloc.stream,
        emitsInOrder([
          isA<AuthLoading>(),
          isA<Unauthenticated>(),
        ]),
      );
    });
  });
}
