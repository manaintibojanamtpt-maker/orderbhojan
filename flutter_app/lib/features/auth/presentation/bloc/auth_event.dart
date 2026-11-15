import 'package:equatable/equatable.dart';

abstract class AuthEvent extends Equatable {
  const AuthEvent();

  @override
  List<Object?> get props => [];
}

class AuthCheckRequested extends AuthEvent {
  const AuthCheckRequested();
}

class AuthGoogleSignInRequested extends AuthEvent {
  const AuthGoogleSignInRequested();
}

class AuthGuestAccessRequested extends AuthEvent {
  const AuthGuestAccessRequested();
}

class AuthSignOutRequested extends AuthEvent {
  const AuthSignOutRequested();
}
