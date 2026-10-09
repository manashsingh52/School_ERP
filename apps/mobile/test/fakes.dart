import 'package:schoolos/core/api_client.dart';
import 'package:schoolos/core/api_error.dart';
import 'package:schoolos/core/token_store.dart';

/// In-memory token store (no Keychain in tests).
class MemoryTokenStore extends TokenStore {
  String? refresh, membership;
  @override
  Future<String?> readRefresh() async => refresh;
  @override
  Future<void> saveRefresh(String token) async => refresh = token;
  @override
  Future<String?> readMembership() async => membership;
  @override
  Future<void> saveMembership(String id) async => membership = id;
  @override
  Future<void> clear() async {
    accessToken = refresh = membership = null;
  }
}

/// Answers from a table of "METHOD /path" → handler; records every call.
class FakeApi extends ApiClient {
  FakeApi(this.routes) : super(MemoryTokenStore());
  final Map<String, Object? Function(Object? body)> routes;
  final calls = <(String, String, Object?)>[];
  bool offline = false;

  Future<T> _answer<T>(String method, String path, Object? body) async {
    calls.add((method, path, body));
    if (offline) throw ApiException.network;
    final handler = routes['$method $path'];
    if (handler == null) throw ApiException(404, 'NOT_FOUND', 'No fake for $method $path');
    return handler(body) as T;
  }

  @override
  Future<T> get<T>(String path, {Map<String, Object?>? query}) => _answer<T>('GET', path, query);
  @override
  Future<T> post<T>(String path, [Object? body, Map<String, String>? headers]) => _answer<T>('POST', path, body);
  @override
  Future<T> put<T>(String path, [Object? body]) => _answer<T>('PUT', path, body);
  @override
  Future<T> delete<T>(String path, [Object? body]) => _answer<T>('DELETE', path, body);
}
