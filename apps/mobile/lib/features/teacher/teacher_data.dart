import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_error.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';

class TeacherDashboard {
  TeacherDashboard({required this.myRegisters, required this.today});
  factory TeacherDashboard.fromJson(Json j) => TeacherDashboard(
        myRegisters: (j['myRegisters'] as List).cast<Json>().map((r) => (sectionId: r['sectionId'] as String, label: r['label'] as String, status: r['status'] as String)).toList(),
        today: j['today'] == null ? null : TodaySchedule.fromJson(j['today'] as Json),
      );
  final List<({String sectionId, String label, String status})> myRegisters;
  final TodaySchedule? today;
}

final teacherDashboard = FutureProvider.autoDispose<TeacherDashboard>((ref) async => TeacherDashboard.fromJson(await ref.read(apiProvider).get<Json>('/dashboard')));

final myMarksSheets = FutureProvider.autoDispose<List<MarksSheetRef>>((ref) async => MarksSheetRef.listFromJson(await ref.read(apiProvider).get<List<dynamic>>('/exams/marks/mine')));

/// Sections the teacher may mark today (from the attendance overview). The list is kept on the
/// phone so the register can still be opened — and taken — without a connection.
final markableSections = FutureProvider.autoDispose<List<SectionOverview>>((ref) async {
  const key = 'markable_sections';
  final prefs = await SharedPreferences.getInstance();
  List<SectionOverview> parse(List<dynamic> rows) => rows.cast<Json>().map(SectionOverview.fromJson).where((s) => s.canMark).toList();
  try {
    final o = await ref.read(apiProvider).get<Json>('/attendance/overview', query: {'date': today()});
    await prefs.setString(key, jsonEncode(o['sections']));
    return parse(o['sections'] as List);
  } on ApiException catch (e) {
    final cached = prefs.getString(key);
    if (!e.isNetwork || cached == null) rethrow;
    // Offline: same sections, today's status unknown.
    return [for (final s in parse(jsonDecode(cached) as List)) SectionOverview(sectionId: s.sectionId, label: s.label, status: 'NOT_TAKEN', canMark: true, students: s.students, present: 0)];
  }
});

final homeworkTargets = FutureProvider.autoDispose<List<({String id, String label, List<({String id, String name})> subjects})>>((ref) async {
  final t = await ref.read(apiProvider).get<Json>('/homework/targets');
  return [
    for (final s in (t['sections'] as List).cast<Json>())
      (id: s['id'] as String, label: s['label'] as String, subjects: [for (final x in (s['subjects'] as List).cast<Json>()) (id: x['id'] as String, name: x['name'] as String)]),
  ];
});

final myHomework = FutureProvider.autoDispose<List<Homework>>((ref) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/homework', query: {'mine': 'true', 'pageSize': 30});
  return rows.cast<Json>().map(Homework.fromJson).toList();
});
