import 'dart:async';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import 'package:path_provider/path_provider.dart';

import 'app/app.dart';
import 'core/di/injection.dart';

Future<void> main() async {
  unawaited(runZonedGuarded<Future<void>>(() async {
    WidgetsFlutterBinding.ensureInitialized();

    // 1. Edge-to-Edge System Bar & Tablet-Responsive Orientations
    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);

    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
        systemNavigationBarColor: Colors.transparent,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
    );

    // 2. Durable Hydrated Storage Initialization (NOT Temporary Cache)
    // Uses Application Support Directory to prevent OS memory-pressure cache purges
    final Directory storageDir = kIsWeb
        ? HydratedStorage.webStorageDirectory
        : await getApplicationSupportDirectory();

    HydratedBloc.storage = await HydratedStorage.build(
      storageDirectory: storageDir,
    );

    // 3. Graceful Firebase Initialization
    bool firebaseReady = false;
    try {
      await Firebase.initializeApp();
      if (!kIsWeb) {
        FlutterError.onError =
            FirebaseCrashlytics.instance.recordFlutterFatalError;
      }
      firebaseReady = true;
    } catch (e, stack) {
      debugPrint(
          '[FirebaseInitWarning] Failed to initialize Firebase: $e\n$stack');
    }

    // 4. Initialize Dependency Injection Service Locator
    await configureDependencies(firebaseInitialized: firebaseReady);

    runApp(const OrderBhojanApp());
  }, (error, stack) {
    if (kReleaseMode) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    } else {
      debugPrint('[UncaughtZonedError]: $error\n$stack');
    }
  }));
}
