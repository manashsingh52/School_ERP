import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:schoolos/core/api_error.dart';
import 'package:schoolos/core/attendance_queue.dart';
import 'package:schoolos/core/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

void main() {
  late FakeApi api;
  late ProviderContainer c;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    api = FakeApi({'PUT /sections/s1/attendance': (_) => {'ok': true}});
    c = ProviderContainer(overrides: [apiProvider.overrideWithValue(api)]);
  });
  tearDown(() => c.dispose());

  final records = [{'studentId': 'x', 'status': 'ABSENT'}];

  test('online: sent straight away with a clientMutationId', () async {
    final out = await c.read(attendanceQueueProvider.notifier).submit(sectionId: 's1', label: '8-A', date: '2026-10-09', records: records);
    expect(out, SubmitOutcome.sent);
    final body = api.calls.single.$3 as Map;
    expect(body['clientMutationId'], isA<String>());
    expect(body['submit'], true);
    expect(c.read(attendanceQueueProvider), isEmpty);
  });

  test('offline: kept on the phone, sent later with the same id, survives a restart', () async {
    api.offline = true;
    final q = c.read(attendanceQueueProvider.notifier);
    expect(await q.submit(sectionId: 's1', label: '8-A', date: '2026-10-09', records: records), SubmitOutcome.queued);
    // A second submission of the same register replaces the first.
    await q.submit(sectionId: 's1', label: '8-A', date: '2026-10-09', records: [{'studentId': 'x', 'status': 'PRESENT'}]);
    expect(c.read(attendanceQueueProvider), hasLength(1));
    final id = c.read(attendanceQueueProvider).single.id;

    expect(await q.sync(), 0); // still offline

    // "Restart": a new container reads the queue back from storage.
    final c2 = ProviderContainer(overrides: [apiProvider.overrideWithValue(api)]);
    c2.read(attendanceQueueProvider);
    await Future<void>.delayed(Duration.zero);
    expect(c2.read(attendanceQueueProvider).single.id, id);

    api.offline = false;
    expect(await c2.read(attendanceQueueProvider.notifier).sync(), 1);
    expect(c2.read(attendanceQueueProvider), isEmpty);
    expect((api.calls.last.$3 as Map)['clientMutationId'], id);
    expect(((api.calls.last.$3 as Map)['records'] as List).single['status'], 'PRESENT');
    c2.dispose();
  });

  test('a refusal from the school is shown, not retried forever', () async {
    api.offline = true;
    final q = c.read(attendanceQueueProvider.notifier);
    await q.submit(sectionId: 's1', label: '8-A', date: '2026-10-01', records: records);
    api.offline = false;
    api.routes['PUT /sections/s1/attendance'] = (_) => throw ApiException(409, 'ATTENDANCE_LOCKED', 'The edit window for this date has closed.');
    expect(await q.sync(), 0);
    expect(c.read(attendanceQueueProvider).single.error, 'The edit window for this date has closed.');
    await q.discard(c.read(attendanceQueueProvider).single.id);
    expect(c.read(attendanceQueueProvider), isEmpty);
  });

  test('other errors on submit reach the screen', () async {
    api.routes['PUT /sections/s1/attendance'] = (_) => throw ApiException(403, 'FORBIDDEN', "You don't have permission to do this.");
    expect(() => c.read(attendanceQueueProvider.notifier).submit(sectionId: 's1', label: '8-A', date: '2026-10-09', records: records), throwsA(isA<ApiException>()));
  });
}
