import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';

/// Everything a parent screen reads, per child. Pull-to-refresh invalidates these.
final childTodayAttendance = FutureProvider.autoDispose.family<AttendanceHistory, String>((ref, id) async {
  final d = today();
  return AttendanceHistory.fromJson(await ref.read(apiProvider).get<Json>('/students/$id/attendance', query: {'from': d, 'to': d}));
});

/// One month: "2026-10".
final childMonthAttendance = FutureProvider.autoDispose.family<AttendanceHistory, (String, String)>((ref, args) async {
  final (id, month) = args;
  final first = DateTime.parse('$month-01');
  final last = DateTime(first.year, first.month + 1, 0);
  return AttendanceHistory.fromJson(await ref.read(apiProvider).get<Json>('/students/$id/attendance', query: {'from': isoDate(first), 'to': isoDate(last)}));
});

/// The whole session so far: totals and month-by-month.
final childSessionAttendance = FutureProvider.autoDispose.family<AttendanceHistory, String>((ref, id) async => AttendanceHistory.fromJson(await ref.read(apiProvider).get<Json>('/students/$id/attendance')));

/// Marks shaped for the results charts (radar, progress, each subject's tests).
final childPerformance = FutureProvider.autoDispose.family<Performance, String>((ref, id) async => Performance.fromJson(await ref.read(apiProvider).get<Json>('/students/$id/performance')));

final childSchedule = FutureProvider.autoDispose.family<TodaySchedule, String>((ref, id) async => TodaySchedule.fromJson(await ref.read(apiProvider).get<Json>('/timetables/today', query: {'studentId': id})));

final childHomework = FutureProvider.autoDispose.family<List<Homework>, String>((ref, id) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/homework', query: {'studentId': id, 'pageSize': 30});
  return rows.cast<Json>().map(Homework.fromJson).toList();
});

final childFees = FutureProvider.autoDispose.family<FeeStatement, String>((ref, id) async => FeeStatement.fromJson(await ref.read(apiProvider).get<Json>('/students/$id/fees')));

final childResults = FutureProvider.autoDispose.family<List<StudentResult>, String>((ref, id) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/students/$id/results');
  return rows.cast<Json>().map(StudentResult.fromJson).toList();
});

final childTerms = FutureProvider.autoDispose.family<List<TermResult>, String>((ref, id) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/students/$id/term-results');
  return rows.cast<Json>().map(TermResult.fromJson).toList();
});

final childDocuments = FutureProvider.autoDispose.family<List<DocumentItem>, String>((ref, id) async {
  final api = ref.read(apiProvider);
  final mine = await api.get<List<dynamic>>('/documents', query: {'ownerType': 'STUDENT', 'ownerId': id});
  final school = await api.get<List<dynamic>>('/documents', query: {'ownerType': 'SCHOOL'});
  return [...mine, ...school].cast<Json>().map(DocumentItem.fromJson).toList();
});

final childCertificates = FutureProvider.autoDispose.family<List<Certificate>, String>((ref, id) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/certificates', query: {'studentId': id, 'pageSize': 100});
  return rows.cast<Json>().map(Certificate.fromJson).toList();
});

void refreshChild(WidgetRef ref, String id) {
  ref.invalidate(childTodayAttendance(id));
  ref.invalidate(childSchedule(id));
  ref.invalidate(childHomework(id));
  ref.invalidate(childFees(id));
  ref.invalidate(childResults(id));
  ref.invalidate(childTerms(id));
  ref.invalidate(childSessionAttendance(id));
  ref.invalidate(childPerformance(id));
  ref.invalidate(childCertificates(id));
}
