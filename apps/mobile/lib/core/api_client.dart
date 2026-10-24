import 'dart:async';

import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import 'api_error.dart';
import 'config.dart';
import 'token_store.dart';

/// Thin client over the Bastaa REST API (docs/05). Adds the Bearer token, refreshes it once on
/// 401 (one refresh at a time, shared by parallel requests), and turns errors into [ApiException].
class ApiClient {
  ApiClient(this.tokens, {Dio? dio, this.onSignedOut}) : _dio = dio ?? Dio(BaseOptions(baseUrl: apiBaseUrl, connectTimeout: const Duration(seconds: 10), receiveTimeout: const Duration(seconds: 30))) {
    _dio.options.validateStatus = (_) => true;
  }

  final TokenStore tokens;
  final Dio _dio;

  /// Called when the session can't be refreshed (signed out elsewhere, idle too long).
  void Function()? onSignedOut;
  Future<bool>? _refreshing;

  static String newKey() => const Uuid().v4();

  Future<T> get<T>(String path, {Map<String, Object?>? query}) => _send<T>('GET', path, query: query);
  Future<T> post<T>(String path, [Object? body, Map<String, String>? headers]) => _send<T>('POST', path, body: body ?? const {}, headers: headers);
  Future<T> put<T>(String path, [Object? body]) => _send<T>('PUT', path, body: body ?? const {});
  Future<T> patch<T>(String path, [Object? body]) => _send<T>('PATCH', path, body: body ?? const {});
  Future<T> delete<T>(String path, [Object? body]) => _send<T>('DELETE', path, body: body);

  /// Unwraps `{ data }`. Endpoints that answer without the envelope (auth) are returned whole.
  Future<T> _send<T>(String method, String path, {Object? body, Map<String, Object?>? query, Map<String, String>? headers, bool retried = false}) async {
    final Response<Object?> res;
    try {
      res = await _dio.request<Object?>(
        path.startsWith('/v1') ? path : '/v1$path',
        data: body,
        queryParameters: query == null ? null : {for (final e in query.entries) if (e.value != null) e.key: '${e.value}'},
        options: Options(method: method, headers: {
          if (tokens.accessToken != null) 'authorization': 'Bearer ${tokens.accessToken}',
          ...?headers,
        }),
      );
    } on DioException {
      throw ApiException.network;
    }
    final status = res.statusCode ?? 0;
    if (status == 401 && !retried && !path.contains('/auth/')) {
      if (await _refresh()) return _send<T>(method, path, body: body, query: query, headers: headers, retried: true);
      onSignedOut?.call();
    }
    if (status < 200 || status >= 300) throw ApiException.fromBody(status, res.data);
    final data = res.data;
    if (data is Map && data.containsKey('data') && !data.containsKey('tokens')) return data['data'] as T;
    return data as T;
  }

  Future<bool> _refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final refresh = await tokens.readRefresh();
    if (refresh == null) return false;
    try {
      final res = await _dio.post<Object?>('/v1/auth/refresh', data: {'refreshToken': refresh});
      if (res.statusCode != 200) return false;
      final t = (res.data as Map)['tokens'] as Map;
      tokens.accessToken = t['accessToken'] as String;
      await tokens.saveRefresh(t['refreshToken'] as String);
      return true;
    } on DioException {
      return false;
    }
  }

  /// PUT raw bytes to a signed upload link (cloud storage, or the API's local driver in development).
  Future<void> upload(String url, Map<String, String> headers, List<int> bytes) async {
    final target = url.startsWith('http') ? url : '$apiBaseUrl$url';
    final res = await _dio.put<Object?>(target, data: Stream.fromIterable([bytes]), options: Options(headers: {...headers, Headers.contentLengthHeader: bytes.length}));
    if ((res.statusCode ?? 0) >= 300) throw ApiException(res.statusCode ?? 0, 'UPLOAD_FAILED', "The upload didn't finish. Please try again.");
  }
}
