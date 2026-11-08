import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../features/auth/data/repositories/firebase_auth_repository.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/kitchen/data/repositories/kitchen_repository.dart';
import '../../features/orders/data/repositories/orders_repository_impl.dart';
import '../../features/orders/domain/repositories/orders_repository.dart';
import '../config/environment_config.dart';
import '../services/preferences_service.dart';

final GetIt sl = GetIt.instance;

Future<void> configureDependencies({required bool firebaseInitialized}) async {
  // 1. SharedPreferences & Secure Storage (Always Available)
  if (!sl.isRegistered<SharedPreferences>()) {
    final sharedPrefs = await SharedPreferences.getInstance();
    sl.registerSingleton<SharedPreferences>(sharedPrefs);
  }

  if (!sl.isRegistered<FlutterSecureStorage>()) {
    const secureStorage = FlutterSecureStorage();
    sl.registerSingleton<FlutterSecureStorage>(secureStorage);
  }

  if (!sl.isRegistered<PreferencesService>()) {
    sl.registerLazySingleton<PreferencesService>(
      () => PreferencesService(sl<SharedPreferences>()),
    );
  }

  // 2. Firebase Instances (Conditional on successful platform initialization)
  if (firebaseInitialized) {
    if (!sl.isRegistered<FirebaseAuth>()) {
      sl.registerLazySingleton<FirebaseAuth>(() => FirebaseAuth.instance);
    }
    if (!sl.isRegistered<FirebaseFirestore>()) {
      sl.registerLazySingleton<FirebaseFirestore>(
          () => FirebaseFirestore.instance);
    }
  }

  // 3. Domain Repositories
  if (!sl.isRegistered<AuthRepository>()) {
    sl.registerLazySingleton<AuthRepository>(
      () => FirebaseAuthRepository(
        auth: firebaseInitialized && sl.isRegistered<FirebaseAuth>()
            ? sl<FirebaseAuth>()
            : null,
        firestore: firebaseInitialized && sl.isRegistered<FirebaseFirestore>()
            ? sl<FirebaseFirestore>()
            : null,
      ),
    );
  }

  if (!sl.isRegistered<KitchenRepository>()) {
    sl.registerLazySingleton<KitchenRepository>(
      () => KitchenRepository(
        firestore: firebaseInitialized && sl.isRegistered<FirebaseFirestore>()
            ? sl<FirebaseFirestore>()
            : null,
        dio: sl<Dio>(),
      ),
    );
  }

  if (!sl.isRegistered<OrdersRepository>()) {
    sl.registerLazySingleton<OrdersRepository>(
      () => OrdersRepositoryImpl(
        firestore: firebaseInitialized && sl.isRegistered<FirebaseFirestore>()
            ? sl<FirebaseFirestore>()
            : null,
        prefs: sl<SharedPreferences>(),
        dio: sl<Dio>(),
      ),
    );
  }

  // 4. Network HTTP Client (Dio) with Standard Timeouts and Telemetry
  if (!sl.isRegistered<Dio>()) {
    final dio = Dio(
      BaseOptions(
        baseUrl: EnvironmentConfig.apiBaseUrl,
        connectTimeout: EnvironmentConfig.connectTimeout,
        receiveTimeout: EnvironmentConfig.receiveTimeout,
        headers: const {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    // Dynamically inject Firebase Auth token when available
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          try {
            if (firebaseInitialized && sl.isRegistered<FirebaseAuth>()) {
              final user = sl<FirebaseAuth>().currentUser;
              if (user != null) {
                final token = await user.getIdToken();
                if (token != null && token.isNotEmpty) {
                  options.headers['Authorization'] = 'Bearer $token';
                }
              }
            }
          } catch (_) {}
          return handler.next(options);
        },
      ),
    );

    sl.registerLazySingleton<Dio>(() => dio);
  }
}
