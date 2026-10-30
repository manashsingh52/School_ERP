import 'dart:convert';

import 'package:flutter/services.dart';

import 'api_client.dart';
import 'api_error.dart';
import 'models.dart';

/// Demo mode (`--dart-define=DEMO_MODE=true`): the app runs with no server. Answers come from the
/// demo school recorded in assets/demo (tool/record_demo.mjs). Dates move forward by whole weeks so
/// "today" always has data on the same weekday. Changes (attendance, marks, messages, payments…)
/// are kept in memory until the app is closed.
class DemoApi extends ApiClient {
  DemoApi(super.tokens, {AssetBundle? bundle, DateTime Function()? now})
      : _bundle = bundle ?? rootBundle,
        _now = now ?? DateTime.now;

  final AssetBundle _bundle;
  final DateTime Function() _now;

  String? _persona;
  late Map<String, dynamic> _data;
  late String _recordedOn;
  late int _shift;
  late List<dynamic> _notifications, _upcoming, _past, _active, _done, _sessions;
  late Map<String, Json> _threads, _fees, _sheets;
  final _registers = <String, List<dynamic>>{};
  final _orders = <String, Json>{};
  final _certificates = <Json>[];
  var _seq = 0;

  static const _downloadsOff = 'Files open from the real school app. This demo has sample data only.';

  @override
  Future<T> get<T>(String path, {Map<String, Object?>? query}) => _answer<T>('GET', path, query: query);
  @override
  Future<T> post<T>(String path, [Object? body, Map<String, String>? headers]) => _answer<T>('POST', path, body: body);
  @override
  Future<T> put<T>(String path, [Object? body]) => _answer<T>('PUT', path, body: body);
  @override
  Future<T> patch<T>(String path, [Object? body]) => _answer<T>('PATCH', path, body: body);
  @override
  Future<T> delete<T>(String path, [Object? body]) => _answer<T>('DELETE', path, body: body);
  @override
  Future<void> upload(String url, Map<String, String> headers, List<int> bytes) async {}

  Future<T> _answer<T>(String method, String path, {Object? body, Map<String, Object?>? query}) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final q = {for (final e in (query ?? const {}).entries) if (e.value != null) e.key: '${e.value}'};
    final b = body is Map ? body.cast<String, dynamic>() : <String, dynamic>{};
    if (path.startsWith('/auth/')) return await _auth(path, b) as T;
    if (_persona == null) {
      final saved = await tokens.readRefresh();
      if (saved == null || !saved.startsWith('demo-')) throw ApiException(401, 'UNAUTHENTICATED', 'Please sign in.');
      await _load(saved.substring(5));
    }
    return (method == 'GET' ? _get(path, q) : _write(method, path, b)) as T;
  }

  // ------------------------------------------------------------------ sign-in

  Future<Object?> _auth(String path, Json b) async {
    switch (path) {
      case '/auth/login':
        return _signIn('${b['identifier']}'.toLowerCase().contains('teacher') ? 'teacher' : 'parent');
      case '/auth/otp/send':
        return {'challengeId': 'demo'};
      case '/auth/otp/verify':
      case '/auth/code/redeem':
        return _signIn('${b['identifier']}'.toLowerCase().contains('teacher') ? 'teacher' : 'parent');
      case '/auth/select-school':
        return {'accessToken': 'demo'};
      case '/auth/logout':
        _persona = null;
        return null;
    }
    throw ApiException(404, 'NOT_FOUND', 'Not available in the demo.');
  }

  Future<Json> _signIn(String persona) async {
    await _load(persona);
    return {...(_data['login'] as Json), 'tokens': {'accessToken': 'demo', 'refreshToken': 'demo-$persona'}};
  }

  Future<void> _load(String persona) async {
    final file = jsonDecode(await _bundle.loadString('assets/demo/$persona.json')) as Json;
    _persona = persona;
    _data = file['responses'] as Json;
    _recordedOn = file['recordedOn'] as String;
    _shift = (_day(_today).difference(_day(_recordedOn)).inDays / 7).floor() * 7;
    List<dynamic> list(String key) => (_body('GET $key') as List?) ?? [];
    _notifications = list('/notifications?limit=50');
    _upcoming = list('/meetings?when=upcoming');
    _past = list('/meetings?when=past');
    _active = list('/reminders?status=active');
    _done = list('/reminders?status=done');
    _sessions = list('/me/sessions');
    _threads = {for (final c in list('/conversations?pageSize=50')) c['id'] as String: _body('GET /conversations/${c['id']}') as Json};
    _fees = _matching(RegExp(r'^GET /students/([^/]+)/fees$'));
    _sheets = _matching(RegExp(r'^GET /exams/marks\?(.+)$'));
    _registers.clear();
    _certificates
      ..clear()
      ..addAll(_sampleCertificates());
  }

  /// A prize and a sports day for a parent's first child (nothing is recorded for these yet).
  List<Json> _sampleCertificates() {
    final kids = ((_me['membership'] as Json?)?['children'] as List?)?.cast<Json>() ?? const <Json>[];
    if (kids.isEmpty) return [];
    final k = kids.first;
    Json cert(String id, String kind, String event, int daysAgo, {String? position, String? note}) => {
          'id': id,
          'serialNo': 'CERT/DEMO/$id',
          'kind': kind,
          'eventName': event,
          'eventDate': _add(_recordedOn, -daysAgo),
          'position': position,
          'note': note,
          'student': {'id': k['id'], 'name': k['name'], 'classLabel': k['classLabel'] == null ? null : 'Class ${k['classLabel']}'},
          'issuedBy': 'Priya Sharma',
          'createdAt': '${_add(_recordedOn, -daysAgo + 1)}T06:00:00.000Z',
          'canDelete': false,
        };
    return [
      cert('0002', 'ACHIEVEMENT', 'Inter-school Science Quiz', 6, position: '1st place', note: 'District level'),
      cert('0001', 'PARTICIPATION', 'Annual Sports Day', 20),
    ];
  }

  /// Students of a section, from its recorded register.
  List<Json> _sectionStudents(String sectionId) {
    final key = _data.keys.firstWhere((k) => k.startsWith('GET /sections/$sectionId/attendance'), orElse: () => '');
    if (key.isEmpty) return [];
    return [
      for (final s in ((_body(key) as Json)['students'] as List).cast<Json>()) {'id': s['studentId'], 'firstName': s['name'], 'lastName': null, 'rollNo': s['rollNo']},
    ];
  }

  Map<String, Json> _matching(RegExp re) => {
        for (final k in _data.keys)
          if (re.firstMatch(k) case final m?) m.group(1)!: _body(k) as Json,
      };

  Object? _body(String key) {
    final v = _data[key];
    return v is Map && v.containsKey('data') ? v['data'] : v;
  }

  Json get _me => _body('GET /me') as Json;

  // ------------------------------------------------------------------ reads

  Object? _get(String path, Map<String, String> q) {
    final student = RegExp(r'^/students/([^/]+)/(attendance|fees)$').firstMatch(path);
    if (student != null && student.group(2) == 'attendance') return _attendance(student.group(1)!, q['from'], q['to']);
    if (student != null) return _moved(_fees[student.group(1)]);
    final detail = RegExp(r'^/students/([^/]+)$').firstMatch(path);
    if (detail != null) return _studentCard(detail.group(1)!);
    final register = RegExp(r'^/sections/([^/]+)/attendance$').firstMatch(path);
    if (register != null) return _register(register.group(1)!, q['date'] ?? _today);
    if (path.endsWith('/receipt') || path.contains('/report-cards/') || path.contains('/attachments/') || path.endsWith('/download')) {
      throw ApiException(404, 'DEMO', _downloadsOff);
    }
    switch (path) {
      case '/timetables/today':
      case '/attendance/overview':
        return _onDay(path, q, q['date'] ?? _today);
      case '/dashboard':
        final dash = _moved(_body('GET /dashboard')) as Json;
        final today = _onDay('/attendance/overview', const {}, _today) as Json;
        return {
          ...dash,
          'today': _onDay('/timetables/today', const {}, _today),
          'myRegisters': [
            for (final s in (today['sections'] as List).cast<Json>().where((s) => s['canMark'] == true)) {'sectionId': s['sectionId'], 'label': s['label'], 'status': s['status']},
          ],
        };
      case '/calendar':
        final from = _unshift(q['from'] ?? _today), to = _unshift(q['to'] ?? _today);
        final all = _body(_data.keys.firstWhere((k) => k.startsWith('GET /calendar')))! as List;
        return _moved([for (final c in all.cast<Json>()) if ((c['startDate'] as String).compareTo(to) <= 0 && (c['endDate'] as String).compareTo(from) >= 0) c]);
      case '/notifications':
        return _moved(_notifications);
      case '/notifications/unread-count':
        return {'count': _notifications.where((n) => n['readAt'] == null).length};
      case '/conversations':
        final rows = _threads.values.where((t) => q['status'] == null || t['status'] == q['status']).toList()
          ..sort((a, b) => '${b['lastMessageAt']}'.compareTo('${a['lastMessageAt']}'));
        return _moved([for (final t in rows) {...t}..remove('messages')]);
      case '/conversations/unread':
        return {'count': _threads.values.where((t) => t['unread'] == true).length};
      case '/meetings':
        return _moved(q['when'] == 'past' ? _past : _upcoming);
      case '/reminders':
        return _moved(q['status'] == 'done' ? _done : _active);
      case '/me/sessions':
        return _moved(_sessions);
      case '/certificates':
        return _moved([
          for (final c in _certificates)
            if ((q['studentId'] == null || (c['student'] as Json)['id'] == q['studentId']) && (q['mine'] != 'true' || c['canDelete'] == true)) c,
        ]);
      case '/students' when q['sectionId'] != null:
        return _sectionStudents(q['sectionId']!);
      case '/search':
        final words = (q['q'] ?? '').toLowerCase();
        final seen = <String>{};
        return {
          'students': [
            for (final k in _data.keys.where((k) => k.startsWith('GET /sections/')))
              for (final s in ((_body(k) as Json)['students'] as List).cast<Json>())
                if ('${s['name']} ${s['admissionNo']}'.toLowerCase().contains(words) && seen.add(s['studentId'] as String))
                  {'id': s['studentId'], 'name': s['name'], 'className': 'Class ${((_body(k) as Json)['section'] as Json)['label'].toString().split('-').first}', 'sectionName': ((_body(k) as Json)['section'] as Json)['label'].toString().split('-').last},
          ],
          'teachers': [],
          'parents': [],
        };
    }
    if (RegExp(r'^/conversations/[^/]+$').hasMatch(path) && path != '/conversations/contacts') {
      final t = _threads[path.split('/').last] ?? (throw ApiException(404, 'NOT_FOUND', 'This conversation is no longer available.'));
      t['unread'] = false;
      return _moved(t);
    }
    final exact = _data['GET $path${_query(q)}'] ?? _data['GET $path'];
    if (exact != null) return _moved(exact is Map && exact.containsKey('data') ? exact['data'] : exact);
    if (path == '/conversations/contacts' || path == '/documents' || path == '/homework') return [];
    throw ApiException(404, 'NOT_FOUND', 'Not available in the demo.');
  }

  /// A parent's child for the ID card (not recorded): the recorded name, class and admission
  /// number, the signed-in parent, and a sample birthday and blood group.
  Json _studentCard(String id) {
    final me = _me;
    final kids = ((me['membership'] as Json?)?['children'] as List?)?.cast<Json>() ?? const <Json>[];
    final k = kids.where((c) => c['id'] == id).firstOrNull ?? (throw ApiException(404, 'NOT_FOUND', 'Student not found.'));
    final label = '${k['classLabel'] ?? ''}'.split('-');
    final grade = int.tryParse(label.first) ?? 5;
    final user = me['user'] as Json;
    return {
      'id': id,
      'admissionNo': ((_fees[id]?['student'] as Json?)?['admissionNo'] as String?) ?? '—',
      'firstName': k['firstName'],
      'lastName': '${k['name']}'.split(' ').skip(1).join(' '),
      'status': 'ACTIVE',
      'className': 'Class ${label.first}',
      'sectionName': label.length > 1 ? label[1] : null,
      'rollNo': 7 + grade,
      'dateOfBirth': '${2020 - grade}-${grade.isEven ? '08-22' : '03-14'}',
      'bloodGroup': grade.isEven ? 'O+' : 'B+',
      'photoUrl': null,
      'guardians': [
        {'guardianId': user['id'], 'name': user['name'], 'phone': user['phone'], 'relation': 'FATHER', 'isPrimary': true},
      ],
    };
  }

  /// Attendance between two dates, cut from the recorded session; days past the recording repeat
  /// the same weekday from the last recorded week.
  Json _attendance(String studentId, String? from, String? to) {
    final recorded = _body('GET /students/$studentId/attendance') as Json;
    final byDay = {for (final d in (recorded['days'] as List).cast<Json>()) d['date'] as String: d};
    final start = from ?? _add(recorded['from'] as String, _shift), end = to ?? _today;
    final days = <Json>[];
    for (var d = start; d.compareTo(end) <= 0 && d.compareTo(_today) <= 0; d = _add(d, 1)) {
      // The recording day's register may not be taken yet: use the week before.
      final r = byDay[_back(d)] ?? (_back(d) == _recordedOn ? byDay[_add(_recordedOn, -7)] : null);
      if (r != null) days.add({...r, 'date': d});
    }
    Map<String, int> count(Iterable<Json> rows) {
      final c = {'PRESENT': 0, 'ABSENT': 0, 'LATE': 0, 'HALF_DAY': 0, 'LEAVE': 0, 'unmarked': 0};
      for (final r in rows) {
        c[r['status'] as String] = (c[r['status']] ?? 0) + 1;
      }
      return c;
    }

    Json tally(Map<String, int> c, [String? month]) {
      final base = c['PRESENT']! + c['ABSENT']! + c['LATE']! + c['HALF_DAY']!;
      return {
        'month': ?month,
        'conducted': base + c['LEAVE']!,
        'attended': c['PRESENT']! + c['LATE']! + c['HALF_DAY']!,
        'missed': c['ABSENT']!,
        'onLeave': c['LEAVE']!,
        'percentPresent': base == 0 ? null : ((c['PRESENT']! + c['LATE']! + c['HALF_DAY']! / 2) / base * 1000).round() / 10,
      };
    }

    final counts = count(days);
    final months = <String>{for (final d in days) (d['date'] as String).substring(0, 7)}.toList()..sort();
    return {
      'studentId': studentId,
      'from': start,
      'to': end,
      'counts': counts,
      'percentPresent': tally(counts)['percentPresent'],
      'summary': tally(counts),
      'months': [for (final m in months) tally(count(days.where((d) => (d['date'] as String).startsWith(m))), m)],
      'days': days,
    };
  }

  /// A register for any date: the recorded one for the same weekday, plus anything saved here.
  Json _register(String sectionId, String date) {
    var back = _back(date);
    for (var i = 0; i < 60 && !_data.containsKey('GET /sections/$sectionId/attendance?date=$back'); i++) {
      back = _add(back, 7);
    }
    final recorded = _body('GET /sections/$sectionId/attendance?date=$back') as Json?;
    if (recorded == null) throw ApiException(404, 'NOT_FOUND', 'Not available in the demo.');
    final j = _moved(recorded, _day(date).difference(_day(back)).inDays) as Json;
    final saved = _registers['$sectionId|$date'];
    if (saved == null) return j;
    final byId = {for (final r in saved.cast<Map>()) r['studentId']: r};
    return {
      ...j,
      'status': 'SUBMITTED',
      'submittedAt': _now().toUtc().toIso8601String(),
      'takenBy': (_me['user'] as Json)['name'],
      'students': [
        for (final s in (j['students'] as List).cast<Json>()) {...s, 'status': byId[s['studentId']]?['status'] ?? s['status'], 'remark': byId[s['studentId']]?['remark']},
      ],
    };
  }

  /// One day's answer (today's classes, the attendance overview) from the same weekday.
  Object? _onDay(String path, Map<String, String> q, String date) {
    final back = _back(date);
    final key = 'GET $path${_query({...q, 'date': back})}';
    final j = _moved(_body(key) ?? (throw ApiException(404, 'NOT_FOUND', 'Not available in the demo.')), _day(date).difference(_day(back)).inDays) as Json;
    if (path != '/attendance/overview') return j;
    return {
      ...j,
      'sections': [
        for (final s in (j['sections'] as List).cast<Json>())
          if (_registers['${s['sectionId']}|$date'] case final saved?)
            {...s, 'status': 'SUBMITTED', 'present': saved.where((r) => r['status'] != 'ABSENT' && r['status'] != 'LEAVE').length}
          else
            s,
      ],
    };
  }

  // ------------------------------------------------------------------ writes

  Object? _write(String method, String path, Json b) {
    final parts = path.split('/')..removeAt(0);
    final now = _unshift(_now().toUtc().toIso8601String());
    switch ((method, parts)) {
      case ('POST', ['notifications', 'read-all']):
        for (final n in _notifications) {
          n['readAt'] ??= now;
        }
        return null;
      case ('POST', ['notifications', final id, 'read']):
        _notifications.firstWhere((n) => n['id'] == id, orElse: () => {})['readAt'] ??= now;
        return null;
      case ('PUT', ['sections', final id, 'attendance']):
        _registers['$id|${b['date']}'] = b['records'] as List;
        return {'status': 'SUBMITTED'};
      case ('PUT', ['exams', 'marks']):
        final key = _query({'examSubjectId': '${b['examSubjectId']}', 'sectionId': '${b['sectionId']}'}).substring(1);
        final sheet = _sheets[key]!;
        final byId = {for (final e in (b['entries'] as List).cast<Map>()) e['studentId']: e};
        for (final s in (sheet['students'] as List).cast<Json>()) {
          final e = byId[s['studentId']];
          if (e != null) s.addAll({'marks': e['marks'], 'absent': e['absent'], 'exempt': e['exempt']});
        }
        sheet['version'] = 'demo-${++_seq}';
        return _moved(sheet);
      case ('POST', ['homework']):
        final targets = (_body('GET /homework/targets') as Json)['sections'] as List;
        final sections = [for (final s in targets.cast<Json>()) if ((b['sectionIds'] as List).contains(s['id'])) s];
        final subject = sections.expand((s) => (s['subjects'] as List).cast<Json>()).firstWhere((x) => x['id'] == b['subjectId']);
        ((_data['GET /homework?mine=true&pageSize=30'] as Json)['data'] as List).insert(0, {
          'id': 'demo-hw-${++_seq}',
          'title': b['title'],
          'description': b['description'],
          'subject': {'id': subject['id'], 'name': subject['name']},
          'teacher': {'id': _me['membership']['teacherId'], 'name': (_me['user'] as Json)['name']},
          'sections': [for (final s in sections) {'id': s['id'], 'label': s['label']}],
          'dueDate': b['dueDate'] == null ? null : _unshift(b['dueDate'] as String),
          'status': 'PUBLISHED',
          'publishAt': null,
          'publishedAt': now,
          'attachments': [],
          'createdAt': now,
          'canEdit': true,
          'submission': null,
        });
        return {'id': 'demo-hw-$_seq'};
      case ('POST', ['certificates']):
        final names = {for (final k in _data.keys.where((k) => k.startsWith('GET /sections/'))) for (final st in ((_body(k) as Json)['students'] as List? ?? const []).cast<Json>()) st['studentId']: st['name']};
        final made = [
          for (final id in (b['studentIds'] as List).cast<String>())
            {
              'id': 'demo-cert-${++_seq}',
              'serialNo': 'CERT/DEMO/${_seq.toString().padLeft(4, '0')}',
              'kind': b['kind'],
              'eventName': b['eventName'],
              'eventDate': _unshift(b['eventDate'] as String),
              'position': b['kind'] == 'ACHIEVEMENT' ? b['position'] : null,
              'note': b['note'],
              'student': {'id': id, 'name': names[id] ?? 'Student', 'classLabel': null},
              'issuedBy': (_me['user'] as Json)['name'],
              'createdAt': now,
              'canDelete': true,
            },
        ];
        _certificates.insertAll(0, made);
        return _moved(made);
      case ('DELETE', ['certificates', final id]):
        _certificates.removeWhere((c) => c['id'] == id);
        return null;
      case ('POST', ['files', 'upload-url']):
        return {'fileId': 'demo-file-${++_seq}', 'upload': {'url': 'demo://upload', 'headers': <String, String>{}}};
      case ('POST', ['conversations']):
        return _newThread(b, now);
      case ('POST', ['conversations', final id, 'messages']):
        final t = _threads[id]!;
        final me = _me;
        final message = {
          'id': 'demo-msg-${++_seq}',
          'body': b['body'],
          'sender': {'memberId': me['membership']['membershipId'], 'name': (me['user'] as Json)['name'], 'side': t['myRole'] == 'PARENT' ? 'PARENT' : 'STAFF'},
          'fromMe': true,
          'seen': false,
          'createdAt': now,
        };
        (t['messages'] as List).add(message);
        t.addAll({'lastMessageAt': now, 'lastMessage': {'body': b['body'], 'senderName': (me['user'] as Json)['name'], 'fromMe': true}});
        return _moved(message);
      case ('PATCH', ['conversations', final id]):
        _threads[id]!.addAll({'status': b['status'], 'resolvedAt': b['status'] == 'RESOLVED' ? now : null});
        return _moved(_threads[id]);
      case ('POST', ['meetings']):
        final student = _student(b['studentId'] as String);
        final meeting = {
          'id': 'demo-meet-${++_seq}',
          'student': student,
          'organizer': {'memberId': _me['membership']['membershipId'], 'name': (_me['user'] as Json)['name']},
          'title': b['title'],
          'agenda': b['agenda'],
          'category': b['category'],
          'scheduledAt': _unshift(b['scheduledAt'] as String),
          'durationMinutes': b['durationMinutes'],
          'status': 'SCHEDULED',
          'cancelReason': null,
          'joinUrl': 'https://meet.jit.si/Bastaa-demo-$_seq',
          'joinable': false,
          'canManage': true,
          'createdAt': now,
        };
        _upcoming.add(meeting);
        return _moved(meeting);
      case ('PATCH', ['meetings', final id]):
        final m = _upcoming.cast<Json>().firstWhere((m) => m['id'] == id);
        m.addAll({...b, 'scheduledAt': _unshift(b['scheduledAt'] as String)});
        return _moved(m);
      case ('POST', ['meetings', final id, final action]):
        final m = _upcoming.cast<Json>().firstWhere((m) => m['id'] == id);
        _upcoming.remove(m);
        _past.insert(0, m..addAll({'status': action == 'cancel' ? 'CANCELLED' : 'COMPLETED', 'cancelReason': b['reason']}));
        return _moved(m);
      case ('POST', ['reminders']):
        final r = {
          'id': 'demo-rem-${++_seq}',
          'title': b['title'],
          'notes': b['notes'],
          'remindAt': _unshift(b['remindAt'] as String),
          'repeat': b['repeat'],
          'student': b['studentId'] == null ? null : _student(b['studentId'] as String),
          'completedAt': null,
          'lastFiredAt': null,
          'createdAt': now,
        };
        _active.add(r);
        return _moved(r);
      case ('PATCH', ['reminders', final id]):
        final r = [..._active, ..._done].cast<Json>().firstWhere((r) => r['id'] == id);
        if (b.containsKey('title')) {
          r.addAll({'title': b['title'], 'notes': b['notes'], 'remindAt': _unshift(b['remindAt'] as String), 'repeat': b['repeat'], 'student': b['studentId'] == null ? null : _student(b['studentId'] as String)});
        }
        if (b['completed'] == true) r['completedAt'] = now;
        if (b['completed'] == false) r['completedAt'] = null;
        _active.remove(r);
        _done.remove(r);
        (r['completedAt'] == null ? _active : _done).add(r);
        return _moved(r);
      case ('DELETE', ['reminders', final id]):
        _active.removeWhere((r) => r['id'] == id);
        _done.removeWhere((r) => r['id'] == id);
        return null;
      case ('DELETE', ['me', 'sessions', final id]):
        _sessions.removeWhere((s) => s['id'] == id);
        return null;
      case ('POST', ['payments', 'online', 'orders']):
        final fees = _fees[b['studentId']]!;
        final ids = (b['invoiceIds'] as List).cast<String>();
        final amount = (fees['invoices'] as List).cast<Json>().where((i) => ids.contains(i['id'])).fold<int>(0, (sum, i) => sum + (i['balancePaise'] as num).toInt());
        final order = {
          'providerOrderId': 'demo_order_${++_seq}',
          'keyId': 'demo',
          'amountPaise': amount,
          'driver': 'mock',
          'schoolName': (_me['membership']['school'] as Json)['name'],
          'description': 'School fees',
          'prefill': <String, dynamic>{},
        };
        _orders[order['providerOrderId'] as String] = {'studentId': b['studentId'], 'invoiceIds': ids, 'amount': amount};
        return order;
      case ('POST', ['payments', 'online', 'mock-checkout']):
        return {'providerOrderId': b['providerOrderId'], 'providerPaymentId': 'demo_pay_${++_seq}', 'signature': b['outcome']};
      case ('POST', ['payments', 'online', 'verify']):
        if (b['signature'] == 'failure') return {'status': 'FAILED', 'message': 'The payment did not go through. No money was taken.'};
        return _markPaid(b['providerOrderId'] as String, now);
    }
    // Anything else (a homework "seen" mark, finishing an upload…) just succeeds.
    return <String, dynamic>{};
  }

  Json _newThread(Json b, String now) {
    final me = _me;
    final isParent = (me['membership']['children'] as List).isNotEmpty;
    final contacts = (_body('GET /conversations/contacts${_query({'studentId': '${b['studentId']}'})}') as List? ?? const []).cast<Json>();
    final to = contacts.where((c) => c['memberId'] == b['toMemberId']).firstOrNull;
    final mine = {'memberId': me['membership']['membershipId'], 'name': (me['user'] as Json)['name']};
    final id = 'demo-thread-${++_seq}';
    _threads[id] = {
      'id': id,
      'student': _student(b['studentId'] as String),
      // Writing to the office: no staff member yet.
      'parent': isParent ? mine : {'memberId': b['toMemberId'] ?? 'demo-parent', 'name': to?['name'] ?? 'Parent'},
      'staff': isParent ? (b['toMemberId'] == null ? null : {'memberId': b['toMemberId'], 'name': to?['name'] ?? 'Teacher'}) : mine,
      'category': b['category'],
      'subject': b['subject'],
      'status': 'OPEN',
      'lastMessageAt': now,
      'lastMessage': {'body': b['body'], 'senderName': mine['name'], 'fromMe': true},
      'unread': false,
      'myRole': isParent ? 'PARENT' : 'STAFF',
      'canChangeStatus': !isParent,
      'createdAt': now,
      'resolvedAt': null,
      'messages': [
        {'id': 'demo-msg-$_seq', 'body': b['body'], 'sender': {...mine, 'side': isParent ? 'PARENT' : 'STAFF'}, 'fromMe': true, 'seen': false, 'createdAt': now},
      ],
    };
    return {'id': id};
  }

  Json _markPaid(String orderId, String now) {
    final order = _orders[orderId]!;
    final fees = _fees[order['studentId']]!;
    final receiptNo = 'RCPT/DEMO/${(++_seq).toString().padLeft(6, '0')}';
    final paid = (fees['invoices'] as List).cast<Json>().where((i) => (order['invoiceIds'] as List).contains(i['id'])).toList();
    for (final i in paid) {
      i.addAll({'status': 'PAID', 'overdue': false, 'paidPaise': i['totalPaise'], 'balancePaise': 0});
    }
    final amount = order['amount'] as int;
    final totals = fees['totals'] as Json;
    totals['paidPaise'] = (totals['paidPaise'] as num) + amount;
    totals['balancePaise'] = (totals['balancePaise'] as num) - amount;
    totals['overduePaise'] = (fees['invoices'] as List).cast<Json>().where((i) => i['overdue'] == true).fold<num>(0, (s, i) => s + (i['balancePaise'] as num));
    (fees['payments'] as List).insert(0, {
      'id': 'demo-payment-$_seq',
      'student': fees['student'],
      'amountPaise': amount,
      'method': 'ONLINE',
      'gatewayMethod': 'upi',
      'status': 'CAPTURED',
      'referenceNo': null,
      'gatewayPaymentId': orderId,
      'receiptNo': receiptNo,
      'receiptReady': false,
      'receivedAt': now,
      'collectedBy': null,
      'refundedPaise': 0,
      'creditPaise': 0,
      'allocations': [for (final i in paid) {'invoiceId': i['id'], 'invoiceNumber': i['number'], 'amountPaise': i['totalPaise']}],
      'voidReason': null,
    });
    final child = (fees['student'] as Json)['name'];
    _notifications.insert(0, {'id': 'demo-n-$_seq', 'event': 'payment.received', 'title': 'Payment received', 'body': 'We received your payment for $child. Receipt $receiptNo.', 'data': {'route': '/my/fees'}, 'readAt': null, 'createdAt': now});
    return {'status': 'PAID', 'paymentId': 'demo-payment-$_seq', 'receiptNo': receiptNo, 'message': 'Thank you! The school has your payment.'};
  }

  Json _student(String id) {
    for (final c in (_me['membership']['children'] as List).cast<Json>()) {
      if (c['id'] == id) return {'id': id, 'name': c['name'], 'classLabel': c['classLabel']};
    }
    final s = ((_get('/search', {'q': ''}) as Json)['students'] as List).cast<Json>().firstWhere((s) => s['id'] == id, orElse: () => {'id': id, 'name': 'Student'});
    return {'id': id, 'name': s['name'], 'classLabel': s['className'] == null ? null : '${(s['className'] as String).replaceFirst('Class ', '')}-${s['sectionName']}'};
  }

  // ------------------------------------------------------------------ dates

  String get _today {
    final n = _now();
    return _iso(DateTime.utc(n.year, n.month, n.day));
  }

  /// A real date → the recorded date with the same weekday, never after the recording.
  String _back(String date) {
    var d = _add(date, -_shift);
    while (d.compareTo(_recordedOn) > 0) {
      d = _add(d, -7);
    }
    return d;
  }

  /// A real date or time → recorded time (what the stored data uses).
  String _unshift(String date) => '${_add(date.substring(0, 10), -_shift)}${date.substring(10)}';

  /// A copy with every date moved forward (by the week shift unless [days] is given).
  Object? _moved(Object? v, [int? days]) {
    final by = days ?? _shift;
    Object? walk(Object? x) => switch (x) {
          final Map<dynamic, dynamic> m => {for (final e in m.entries) e.key as String: walk(e.value)},
          final List<dynamic> l => [for (final e in l) walk(e)],
          final String s when _date.hasMatch(s) => '${_add(s.substring(0, 10), by)}${s.substring(10)}',
          _ => x,
        };
    return walk(v);
  }

  static final _date = RegExp(r'^\d{4}-\d{2}-\d{2}($|T)');
  static DateTime _day(String s) => DateTime.utc(int.parse(s.substring(0, 4)), int.parse(s.substring(5, 7)), int.parse(s.substring(8, 10)));
  static String _iso(DateTime d) => d.toIso8601String().substring(0, 10);
  static String _add(String s, int days) => _iso(_day(s).add(Duration(days: days)));

  /// "?a=1&b=2", sorted: the keys tool/record_demo.mjs writes.
  static String _query(Map<String, String> q) {
    if (q.isEmpty) return '';
    final keys = q.keys.toList()..sort();
    return '?${keys.map((k) => '$k=${q[k]}').join('&')}';
  }
}
