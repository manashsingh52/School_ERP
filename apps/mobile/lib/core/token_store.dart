import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The refresh token lives in the Keychain / Keystore (docs/09 §2); the short-lived access token
/// only in memory. The chosen school is remembered so the app opens straight into it.
class TokenStore {
  TokenStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _refreshKey = 'refresh_token';
  static const _membershipKey = 'membership_id';

  String? accessToken;

  Future<String?> readRefresh() => _storage.read(key: _refreshKey);
  Future<void> saveRefresh(String token) => _storage.write(key: _refreshKey, value: token);
  Future<String?> readMembership() => _storage.read(key: _membershipKey);
  Future<void> saveMembership(String id) => _storage.write(key: _membershipKey, value: id);

  Future<void> clear() async {
    accessToken = null;
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _membershipKey);
  }
}
