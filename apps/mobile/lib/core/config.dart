import 'package:flutter/foundation.dart';

/// Where the API lives. Override with `--dart-define=API_URL=https://api.bastaa.in`.
/// Locally the Android emulator reaches the Mac at 10.0.2.2; everything else uses localhost.
String get apiBaseUrl {
  const fromEnv = String.fromEnvironment('API_URL');
  if (fromEnv.isNotEmpty) return fromEnv;
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

/// Release builds must name their server (or be the demo); otherwise they'd look for a developer's computer.
bool get misconfiguredRelease => kReleaseMode && !demoMode && const String.fromEnvironment('API_URL').isEmpty;

/// A build with no server: sample data from assets/demo (`--dart-define=DEMO_MODE=true`, see DemoApi).
const demoMode = bool.fromEnvironment('DEMO_MODE');

/// The version shown in stores; must match pubspec.yaml (checked by a test).
const appVersion = '1.0.0';

/// What we send as the session's platform (sessions on phones last 60 days idle).
String get clientPlatform {
  if (kIsWeb) return 'WEB';
  return defaultTargetPlatform == TargetPlatform.iOS ? 'IOS' : 'ANDROID';
}
