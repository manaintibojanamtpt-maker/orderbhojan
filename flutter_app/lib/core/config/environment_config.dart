enum Environment { dev, staging, prod }

class EnvironmentConfig {
  static const Environment currentEnvironment = Environment.prod;

  static const String appName = 'OrderBhojan';
  static const String assistantBrandName = 'OrderBhojan Assistant';
  static const String voiceAssistantBrandName = 'OrderBhojan Voice Assistant';
  static const String aiTechnologyAttribution =
      'Powered by Saarvamm Indic Voice AI';

  // Production Firebase Project Configuration
  static const String firebaseProjectId = 'bhojanos-prod';
  static const String firebaseStorageBucket =
      'bhojanos-prod.firebasestorage.app';
  static const String functionsRegion = 'asia-south1';

  // Backend API Base URLs (Render Marketplace Production Backend)
  static const String marketplaceBaseUrl =
      'https://manaintibojanam-backend.onrender.com';

  static String get apiBaseUrl => marketplaceBaseUrl;

  // Network Timeouts
  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 15);
}
