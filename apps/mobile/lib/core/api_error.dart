/// An error the API sent back (`{ error: { code, message, details } }`) or a network failure.
class ApiException implements Exception {
  ApiException(this.status, this.code, this.message, {this.details = const []});

  final int status;
  final String code;
  final String message;
  final List<({String? field, String message})> details;

  bool get isNetwork => status == 0;

  static ApiException fromBody(int status, Object? body) {
    if (body is Map && body['error'] is Map) {
      final e = body['error'] as Map;
      final details = (e['details'] as List? ?? [])
          .whereType<Map>()
          .map((d) => (field: d['field'] as String?, message: '${d['message'] ?? ''}'))
          .toList();
      return ApiException(status, '${e['code'] ?? 'UNKNOWN'}', '${e['message'] ?? 'Something went wrong.'}', details: details);
    }
    return ApiException(status, 'UNKNOWN', status >= 500 ? 'SchoolOS is having trouble right now. Please try again.' : 'Something went wrong. Please try again.');
  }

  static final network = ApiException(0, 'NETWORK', "You're offline or SchoolOS can't be reached. Check your connection and try again.");

  @override
  String toString() => message;
}
