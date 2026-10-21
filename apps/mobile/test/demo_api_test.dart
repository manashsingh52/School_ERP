import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:schoolos/core/demo_api.dart';
import 'package:schoolos/core/models.dart';
import 'package:schoolos/features/teacher/teacher_data.dart';

import 'fakes.dart';

/// The demo build answers every screen from assets/demo. These parse each answer with the app's
/// own models, on the recording day and on later days (the dates move forward by whole weeks).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late String recordedOn;
  setUpAll(() async => recordedOn = (jsonDecode(await rootBundle.loadString('assets/demo/parent.json')) as Json)['recordedOn'] as String);

  Future<DemoApi> signIn(String who, DateTime now) async {
    final api = DemoApi(MemoryTokenStore(), now: () => now);
    final auth = await api.post<Json>('/auth/login', {'identifier': '$who@demo.school', 'password': 'demo'});
    await api.tokens.saveRefresh((auth['tokens'] as Json)['refreshToken'] as String);
    return api;
  }

  String iso(DateTime d) => d.toIso8601String().substring(0, 10);
  DateTime day(int offset) => DateTime.parse(recordedOn).add(Duration(days: offset, hours: 10));

  for (final offset in [0, 3, 10, 400]) {
    test('parent screens parse, $offset days after recording', () async {
      final now = day(offset);
      final api = await signIn('parent', now);
      final me = Me.fromJson(await api.get<Json>('/me'));
      expect(me.children, hasLength(2));
      AppConfig.fromJson(await api.get<Json>('/app/config'));

      for (final child in me.children) {
        final today = AttendanceHistory.fromJson(await api.get<Json>('/students/${child.id}/attendance', query: {'from': iso(now), 'to': iso(now)}));
        final weekday = now.weekday != DateTime.sunday;
        if (weekday) expect(today.days.keys, [iso(now)], reason: 'a school day always has attendance');
        final month = '${iso(now).substring(0, 7)}-01';
        final last = DateTime(now.year, now.month + 1, 0);
        AttendanceHistory.fromJson(await api.get<Json>('/students/${child.id}/attendance', query: {'from': month, 'to': iso(last)}));
        final session = AttendanceHistory.fromJson(await api.get<Json>('/students/${child.id}/attendance'));
        expect(session.summary.conducted, greaterThan(0));
        expect(session.days.keys.every((d) => d.compareTo(iso(now)) <= 0), isTrue);

        final schedule = TodaySchedule.fromJson(await api.get<Json>('/timetables/today', query: {'studentId': child.id}));
        expect(schedule.date, iso(now));
        Performance.fromJson(await api.get<Json>('/students/${child.id}/performance'));
        (await api.get<List<dynamic>>('/homework', query: {'studentId': child.id, 'pageSize': 30})).cast<Json>().map(Homework.fromJson).toList();
        FeeStatement.fromJson(await api.get<Json>('/students/${child.id}/fees'));
        (await api.get<List<dynamic>>('/students/${child.id}/results')).cast<Json>().map(StudentResult.fromJson).toList();
        (await api.get<List<dynamic>>('/students/${child.id}/term-results')).cast<Json>().map(TermResult.fromJson).toList();
        (await api.get<List<dynamic>>('/conversations/contacts', query: {'studentId': child.id})).cast<Json>().map(MessageContact.fromJson).toList();
        await api.get<List<dynamic>>('/documents', query: {'ownerType': 'STUDENT', 'ownerId': child.id});
        await api.get<Json?>('/timetables', query: {'sectionId': child.sectionId});
      }

      final calendar = (await api.get<List<dynamic>>('/calendar', query: {'from': iso(now), 'to': iso(now.add(const Duration(days: 120)))})).cast<Json>().map(CalendarItem.fromJson).toList();
      expect(calendar.every((c) => c.endDate.compareTo(iso(now)) >= 0), isTrue);
      final threads = (await api.get<List<dynamic>>('/conversations', query: {'pageSize': 50})).cast<Json>().map(Conversation.fromJson).toList();
      expect(threads, isNotEmpty);
      for (final t in threads) {
        Conversation.fromJson(await api.get<Json>('/conversations/${t.id}'));
      }
      for (final when in ['upcoming', 'past']) {
        (await api.get<List<dynamic>>('/meetings', query: {'when': when})).cast<Json>().map(Meeting.fromJson).toList();
      }
      for (final status in ['active', 'done']) {
        (await api.get<List<dynamic>>('/reminders', query: {'status': status})).cast<Json>().map(Reminder.fromJson).toList();
      }
      final inbox = (await api.get<List<dynamic>>('/notifications', query: {'limit': 50})).cast<Json>().map(AppNotification.fromJson).toList();
      expect(inbox, isNotEmpty);
      (await api.get<List<dynamic>>('/me/sessions')).cast<Json>().map(SessionItem.fromJson).toList();
    });

    test('teacher screens parse, $offset days after recording', () async {
      final now = day(offset);
      final api = await signIn('teacher', now);
      final me = Me.fromJson(await api.get<Json>('/me'));
      expect(me.isTeacher, isTrue);
      final dash = TeacherDashboard.fromJson(await api.get<Json>('/dashboard'));
      expect(dash.today?.date, iso(now));
      final overview = await api.get<Json>('/attendance/overview', query: {'date': iso(now)});
      final sections = (overview['sections'] as List).cast<Json>().map(SectionOverview.fromJson).where((s) => s.canMark).toList();
      expect(sections, isNotEmpty);
      for (var i = 0; i < 30; i++) {
        final register = AttendanceRegister.fromJson(await api.get<Json>('/sections/${sections.first.sectionId}/attendance', query: {'date': iso(now.subtract(Duration(days: i)))}));
        expect(register.date, iso(now.subtract(Duration(days: i))));
      }
      for (final ref in MarksSheetRef.listFromJson(await api.get<List<dynamic>>('/exams/marks/mine'))) {
        MarksSheet.fromJson(await api.get<Json>('/exams/marks', query: {'examSubjectId': ref.examSubjectId, 'sectionId': ref.sectionId}));
      }
      await api.get<Json>('/homework/targets');
      (await api.get<List<dynamic>>('/homework', query: {'mine': 'true', 'pageSize': 30})).cast<Json>().map(Homework.fromJson).toList();
      final found = (await api.get<Json>('/search', query: {'q': 'ra'}))['students'] as List;
      expect(found, isNotEmpty);
    });
  }

  test('changes stay for the session: attendance, marks, messages, meetings, reminders', () async {
    final now = day(10);
    final api = await signIn('teacher', now);
    final overview = await api.get<Json>('/attendance/overview', query: {'date': iso(now)});
    final section = (overview['sections'] as List).cast<Json>().firstWhere((s) => s['canMark'] == true)['sectionId'] as String;
    final register = AttendanceRegister.fromJson(await api.get<Json>('/sections/$section/attendance', query: {'date': iso(now)}));
    final records = [for (final s in register.students) {'studentId': s.studentId, 'status': 'ABSENT'}];
    await api.put<Object?>('/sections/$section/attendance', {'date': iso(now), 'records': records, 'submit': true, 'clientMutationId': 'x'});
    final again = AttendanceRegister.fromJson(await api.get<Json>('/sections/$section/attendance', query: {'date': iso(now)}));
    expect(again.status, 'SUBMITTED');
    expect(again.students.every((s) => s.status == 'ABSENT'), isTrue);

    final ref = MarksSheetRef.listFromJson(await api.get<List<dynamic>>('/exams/marks/mine')).first;
    final sheet = MarksSheet.fromJson(await api.get<Json>('/exams/marks', query: {'examSubjectId': ref.examSubjectId, 'sectionId': ref.sectionId}));
    final first = sheet.students.first.studentId;
    await api.put<Json>('/exams/marks', {'examSubjectId': ref.examSubjectId, 'sectionId': ref.sectionId, 'version': sheet.version, 'entries': [{'studentId': first, 'marks': 7.0, 'absent': false, 'exempt': false}]});
    final reloaded = MarksSheet.fromJson(await api.get<Json>('/exams/marks', query: {'examSubjectId': ref.examSubjectId, 'sectionId': ref.sectionId}));
    expect(reloaded.students.first.marks, 7);

    final thread = (await api.get<List<dynamic>>('/conversations', query: {'pageSize': 50})).cast<Json>().first['id'] as String;
    await api.post<Json>('/conversations/$thread/messages', {'body': 'See you tomorrow'});
    final t = Conversation.fromJson(await api.get<Json>('/conversations/$thread'));
    expect(t.messages.last.body, 'See you tomorrow');
    expect(t.messages.last.createdAt.substring(0, 10), iso(now.toUtc()));

    final student = ((await api.get<Json>('/search', query: {'q': 'a'}))['students'] as List).cast<Json>().first['id'] as String;
    final at = now.add(const Duration(days: 2)).toUtc().toIso8601String();
    await api.post<Json>('/meetings', {'title': 'Chat', 'agenda': '', 'category': 'ACADEMIC', 'scheduledAt': at, 'durationMinutes': 15, 'studentId': student});
    final upcoming = (await api.get<List<dynamic>>('/meetings', query: {'when': 'upcoming'})).cast<Json>().map(Meeting.fromJson).toList();
    expect(upcoming.any((m) => m.title == 'Chat' && m.scheduledAt.toUtc().toIso8601String() == at), isTrue);

    final r = await api.post<Json>('/reminders', {'title': 'Bring forms', 'notes': '', 'remindAt': at, 'repeat': 'NONE', 'studentId': null});
    await api.patch<Json>('/reminders/${r['id']}', {'completed': true});
    final done = (await api.get<List<dynamic>>('/reminders', query: {'status': 'done'})).cast<Json>().map(Reminder.fromJson);
    expect(done.map((x) => x.title), contains('Bring forms'));

    await api.post<Json>('/homework', {'subjectId': (((await api.get<Json>('/homework/targets'))['sections'] as List).first['subjects'] as List).first['id'], 'sectionIds': [(((await api.get<Json>('/homework/targets'))['sections'] as List).first as Json)['id']], 'title': 'Read chapter 4', 'attachmentFileIds': <String>[], 'publish': 'NOW'});
    final mine = (await api.get<List<dynamic>>('/homework', query: {'mine': 'true', 'pageSize': 30})).cast<Json>().map(Homework.fromJson);
    expect(mine.first.title, 'Read chapter 4');
  });

  test('a parent pays a fee in the sandbox: the bill shows paid, with a notification', () async {
    final api = await signIn('parent', day(3));
    final me = Me.fromJson(await api.get<Json>('/me'));
    final child = me.children.firstWhere((c) => true);
    final before = FeeStatement.fromJson(await api.get<Json>('/students/${child.id}/fees'));
    final open = before.invoices.where((i) => i.balancePaise > 0).toList();
    expect(open, isNotEmpty);
    final order = OnlineOrder.fromJson(await api.post<Json>('/payments/online/orders', {'studentId': child.id, 'invoiceIds': [open.first.id]}));
    expect(order.amountPaise, open.first.balancePaise);
    final proof = await api.post<Json>('/payments/online/mock-checkout', {'providerOrderId': order.providerOrderId, 'outcome': 'success', 'method': 'upi'});
    final result = PaymentResult.fromJson(await api.post<Json>('/payments/online/verify', proof.map((k, v) => MapEntry(k, '$v'))));
    expect(result.status, 'PAID');
    final after = FeeStatement.fromJson(await api.get<Json>('/students/${child.id}/fees'));
    expect(after.invoices.firstWhere((i) => i.id == open.first.id).balancePaise, 0);
    expect(after.payments.first.receiptNo, result.receiptNo);
    expect((await api.get<Json>('/notifications/unread-count'))['count'], greaterThan(0));
  });

  test('a saved session reopens the same demo user; sign-out ends it', () async {
    final tokens = MemoryTokenStore();
    final first = DemoApi(tokens);
    final auth = await first.post<Json>('/auth/login', {'identifier': 'teacher@demo.school', 'password': 'demo'});
    await tokens.saveRefresh((auth['tokens'] as Json)['refreshToken'] as String);
    final reopened = DemoApi(tokens);
    expect(Me.fromJson(await reopened.get<Json>('/me')).isTeacher, isTrue);
    expect(() => DemoApi(MemoryTokenStore()).get<Json>('/me'), throwsA(isA<Exception>()));
  });

  test('downloads say they are not in the demo instead of failing silently', () async {
    final api = await signIn('parent', day(0));
    expect(() => api.get<Json>('/payments/x/receipt'), throwsA(predicate((e) => '$e'.contains('sample data'))));
  });

  test('the recorded data has no stray sign-ins', () async {
    for (final who in ['parent', 'teacher']) {
      final file = jsonDecode(await rootBundle.loadString('assets/demo/$who.json')) as Json;
      final sessions = ((file['responses'] as Json)['GET /me/sessions'] as Json)['data'] as List;
      expect(sessions, hasLength(1));
    }
  });
}
