import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/repositories/auth_repository.dart';
import 'auth_event.dart';
import 'auth_state.dart';

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final AuthRepository _authRepository;

  AuthBloc({required AuthRepository authRepository})
      : _authRepository = authRepository,
        super(AuthInitial()) {
    on<AuthCheckRequested>(_onAuthCheckRequested);
    on<AuthGoogleSignInRequested>(_onAuthGoogleSignInRequested);
    on<AuthGuestAccessRequested>(_onAuthGuestAccessRequested);
    on<AuthSignOutRequested>(_onAuthSignOutRequested);
  }

  Future<void> _onAuthCheckRequested(
    AuthCheckRequested event,
    Emitter<AuthState> emit,
  ) async {
    final current = _authRepository.currentCustomer;
    if (current != null) {
      emit(Authenticated(current));
    } else {
      emit(Unauthenticated());
    }
  }

  Future<void> _onAuthGoogleSignInRequested(
    AuthGoogleSignInRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    try {
      final user = await _authRepository.signInWithGoogle();
      emit(Authenticated(user));
    } catch (e) {
      emit(AuthFailureState(e.toString()));
    }
  }

  Future<void> _onAuthGuestAccessRequested(
    AuthGuestAccessRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    try {
      final guest = await _authRepository.continueAsGuest();
      emit(Authenticated(guest));
    } catch (e) {
      emit(AuthFailureState(e.toString()));
    }
  }

  Future<void> _onAuthSignOutRequested(
    AuthSignOutRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    try {
      await _authRepository.signOut();
      emit(Unauthenticated());
    } catch (e) {
      emit(AuthFailureState(e.toString()));
    }
  }
}
