import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config.dart';
import 'session.dart';

/// Push notifications (FCM). Off unless the build carries the Firebase app settings (from the
/// Firebase console → Project settings → Android app; SETUP-LATER #12):
/// `--dart-define=FIREBASE_PROJECT_ID=… FIREBASE_APP_ID=… FIREBASE_API_KEY=… FIREBASE_SENDER_ID=…`
class PushService {
  PushService(this.ref);
  final Ref ref;
  bool _started = false;

  static const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const _appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _senderId = String.fromEnvironment('FIREBASE_SENDER_ID');

  static bool get configured => !demoMode && !kIsWeb && _projectId.isNotEmpty && _appId.isNotEmpty && _apiKey.isNotEmpty && _senderId.isNotEmpty;

  /// After sign-in: ask permission, register this phone with the API, and open the screen a
  /// tapped notification points to ([open] gets its `route`). [onMessage] runs for pushes that
  /// arrive while the app is open.
  Future<void> start({required void Function(String route) open, required void Function() onMessage}) async {
    if (!configured || _started) return;
    _started = true;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: const FirebaseOptions(apiKey: _apiKey, appId: _appId, messagingSenderId: _senderId, projectId: _projectId));
      }
      final messaging = FirebaseMessaging.instance;
      final permission = await messaging.requestPermission();
      if (permission.authorizationStatus == AuthorizationStatus.denied) return;
      // Registration tokens are what the API's HTTP v1 sender targets (core/notify/fcm.ts); the
      // newer register()/onRegistered hands out installation ids instead.
      // ignore: deprecated_member_use
      final token = await messaging.getToken();
      if (token != null) await _register(token);
      // ignore: deprecated_member_use
      messaging.onTokenRefresh.listen(_register);
      FirebaseMessaging.onMessage.listen((_) => onMessage());
      FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m, open));
      final initial = await messaging.getInitialMessage();
      if (initial != null) _open(initial, open);
    } catch (e) {
      // Push is a bonus: the in-app inbox still has everything.
      debugPrint('push unavailable: $e');
    }
  }

  void _open(RemoteMessage m, void Function(String route) open) {
    final route = m.data['route'];
    if (route is String && route.isNotEmpty) open(route);
  }

  Future<void> _register(String token) => ref.read(apiProvider).put<Object?>('/me/devices', {'token': token, 'platform': clientPlatform});
}

final pushProvider = Provider<PushService>(PushService.new);
