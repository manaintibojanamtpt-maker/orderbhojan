import 'package:equatable/equatable.dart';

abstract class Failure extends Equatable {
  final String message;
  final int? code;

  const Failure(this.message, [this.code]);

  @override
  List<Object?> get props => [message, code];
}

class ServerFailure extends Failure {
  const ServerFailure(
      [super.message = 'An unexpected server error occurred.', super.code]);
}

class NetworkFailure extends Failure {
  const NetworkFailure(
      [super.message =
          'Unable to connect. Please check your internet connection.',
      super.code]);
}

class CacheFailure extends Failure {
  const CacheFailure(
      [super.message = 'Local cache error occurred.', super.code]);
}

class AuthFailure extends Failure {
  const AuthFailure(
      [super.message = 'Authentication failed. Please sign in again.',
      super.code]);
}

class ValidationFailure extends Failure {
  const ValidationFailure(super.message, [super.code]);
}

class OrderFailure extends Failure {
  const OrderFailure(super.message, [super.code]);
}

/// Base Application Exception
class AppException implements Exception {
  final String message;
  final int? code;

  const AppException(this.message, [this.code]);

  @override
  String toString() => 'AppException: $message (code: $code)';
}

class ServerException extends AppException {
  const ServerException([super.message = 'Server exception', super.code]);
}

class NetworkException extends AppException {
  const NetworkException([super.message = 'Network exception', super.code]);
}

class CacheException extends AppException {
  const CacheException([super.message = 'Cache exception', super.code]);
}

class AuthException extends AppException {
  const AuthException([super.message = 'Auth exception', super.code]);
}
