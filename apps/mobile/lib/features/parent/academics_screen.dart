import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'parent_data.dart';
import 'parent_home.dart';

/// Academics (docs/06 §4): attendance calendar, homework, timetable, results.
class AcademicsScreen extends ConsumerWidget {
  const AcademicsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final child = ref.watch(childProvider);
    if (child == null) return const EmptyView(icon: Icons.family_restroom, title: 'No children linked yet');
    return DefaultTabController(
      length: 4,
      child: Column(children: [
        Material(
          color: Theme.of(context).colorScheme.surface,
          child: const TabBar(isScrollable: true, tabAlignment: TabAlignment.start, tabs: [Tab(text: 'Attendance'), Tab(text: 'Homework'), Tab(text: 'Timetable'), Tab(text: 'Results')]),
        ),
        Expanded(
          child: TabBarView(children: [
            _AttendanceTab(child: child),
            _HomeworkTab(child: child),
            _TimetableTab(child: child),
            _ResultsTab(child: child),
          ]),
        ),
      ]),
    );
  }
}

class _AttendanceTab extends ConsumerStatefulWidget {
  const _AttendanceTab({required this.child});
  final Child child;
  @override
  ConsumerState<_AttendanceTab> createState() => _AttendanceTabState();
}

class _AttendanceTabState extends ConsumerState<_AttendanceTab> {
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);

  @override
  Widget build(BuildContext context) {
    final key = DateFormat('yyyy-MM').format(_month);
    final data = ref.watch(childMonthAttendance((widget.child.id, key)));
    final s = StatusColors.of(context);
    final colors = {'PRESENT': s.success, 'ABSENT': s.danger, 'LATE': s.warning, 'HALF_DAY': s.info, 'LEAVE': s.muted};
    final isCurrent = _month.year == DateTime.now().year && _month.month == DateTime.now().month;
    return Refreshable(
      onRefresh: () async => ref.invalidate(childMonthAttendance((widget.child.id, key))),
      children: [
        Row(children: [
          IconButton(tooltip: 'Previous month', onPressed: () => setState(() => _month = DateTime(_month.year, _month.month - 1)), icon: const Icon(Icons.chevron_left)),
          Expanded(child: Text(DateFormat('MMMM yyyy').format(_month), textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium)),
          IconButton(tooltip: 'Next month', onPressed: isCurrent ? null : () => setState(() => _month = DateTime(_month.year, _month.month + 1)), icon: const Icon(Icons.chevron_right)),
        ]),
        AsyncView(
          value: data,
          onRetry: () => ref.invalidate(childMonthAttendance((widget.child.id, key))),
          builder: (h) {
            final first = _month;
            final days = DateTime(first.year, first.month + 1, 0).day;
            final lead = first.weekday - 1; // Monday first
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(children: [
                  Row(children: [for (final d in ['M', 'T', 'W', 'T', 'F', 'S', 'S']) Expanded(child: Center(child: Text(d, style: Theme.of(context).textTheme.bodySmall)))]),
                  const SizedBox(height: 6),
                  GridView.count(
                    crossAxisCount: 7,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      for (var i = 0; i < lead; i++) const SizedBox.shrink(),
                      for (var d = 1; d <= days; d++)
                        Builder(builder: (context) {
                          final status = h.days[isoDate(DateTime(first.year, first.month, d))];
                          return Semantics(
                            label: '$d ${status == null ? 'not marked' : attendanceLabel[status]}',
                            child: Container(
                              margin: const EdgeInsets.all(3),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(color: status == null ? null : colors[status]!.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(8)),
                              child: Text('$d', style: TextStyle(color: status == null ? s.muted : colors[status], fontWeight: status == null ? null : FontWeight.w600)),
                            ),
                          );
                        }),
                    ],
                  ),
                  const Divider(height: 24),
                  Wrap(spacing: 12, runSpacing: 6, children: [
                    Text('Attendance ${percent(h.percentPresent)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                    for (final st in attendanceStatuses)
                      if ((h.counts[st] ?? 0) > 0) Pill('${attendanceLabel[st]} ${h.counts[st]}', tone: attendanceTone[st]!),
                  ]),
                ]),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _HomeworkTab extends ConsumerWidget {
  const _HomeworkTab({required this.child});
  final Child child;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(childHomework(child.id));
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(childHomework(child.id)),
      child: AsyncView(
        value: list,
        onRetry: () => ref.invalidate(childHomework(child.id)),
        builder: (items) => items.isEmpty
            ? ListView(children: const [EmptyView(icon: Icons.menu_book_outlined, title: 'No homework yet')])
            : ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: items.length,
                separatorBuilder: (_, _) => const Divider(),
                itemBuilder: (_, i) {
                  final h = items[i];
                  final overdue = h.dueDate != null && h.dueDate!.compareTo(today()) < 0;
                  return ListTile(
                    title: Text(h.title),
                    subtitle: Text([h.subject, if (h.dueDate != null) 'due ${formatDay(h.dueDate!)}'].join(' · ')),
                    trailing: h.attachments.isNotEmpty ? const Icon(Icons.attach_file, size: 18) : (overdue ? null : const Pill('Due', tone: Tone.info)),
                    onTap: () => showHomework(context, h),
                  );
                },
              ),
      ),
    );
  }
}

final _sectionTimetable = FutureProvider.autoDispose.family<Json?, String>((ref, sectionId) async => ref.read(apiProvider).get<Json?>('/timetables', query: {'sectionId': sectionId}));

class _TimetableTab extends ConsumerStatefulWidget {
  const _TimetableTab({required this.child});
  final Child child;
  @override
  ConsumerState<_TimetableTab> createState() => _TimetableTabState();
}

class _TimetableTabState extends ConsumerState<_TimetableTab> {
  int _day = DateTime.now().weekday;

  @override
  Widget build(BuildContext context) {
    final sectionId = widget.child.sectionId;
    if (sectionId == null) return const EmptyView(icon: Icons.calendar_view_week, title: 'Not in a class this year');
    final tt = ref.watch(_sectionTimetable(sectionId));
    return AsyncView(
      value: tt,
      onRetry: () => ref.invalidate(_sectionTimetable(sectionId)),
      builder: (view) {
        if (view == null || view['status'] != 'PUBLISHED') return const EmptyView(icon: Icons.calendar_view_week, title: 'Timetable not published yet');
        final days = (view['days'] as List).cast<int>();
        final day = days.contains(_day) ? _day : days.first;
        final periods = ((view['bellSchedule'] as Json)['periods'] as List).cast<Json>()..sort((a, b) => (a['order'] as int).compareTo(b['order'] as int));
        final entries = (view['entries'] as List).cast<Json>().where((e) => e['dayOfWeek'] == day);
        const names = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return ListView(padding: const EdgeInsets.all(16), children: [
          Wrap(spacing: 6, children: [for (final d in days) ChoiceChip(label: Text(names[d]), selected: d == day, onSelected: (_) => setState(() => _day = d))]),
          const SizedBox(height: 12),
          Card(
            child: Column(children: [
              for (final p in periods)
                Builder(builder: (context) {
                  final e = entries.where((x) => x['periodId'] == p['id']).firstOrNull;
                  return ListTile(
                    dense: true,
                    leading: SizedBox(width: 92, child: Text('${p['startTime']}–${p['endTime']}', style: Theme.of(context).textTheme.bodySmall)),
                    title: Text(p['isBreak'] == true ? p['name'] as String : ((e?['subject'] as Json?)?['name'] as String? ?? '—')),
                    subtitle: e?['teacher'] == null ? null : Text((e!['teacher'] as Json)['name'] as String),
                  );
                }),
            ]),
          ),
        ]);
      },
    );
  }
}

class _ResultsTab extends ConsumerWidget {
  const _ResultsTab({required this.child});
  final Child child;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final results = ref.watch(childResults(child.id));
    final s = StatusColors.of(context);
    return AsyncView(
      value: results,
      onRetry: () => ref.invalidate(childResults(child.id)),
      builder: (list) => list.isEmpty
          ? const EmptyView(icon: Icons.emoji_events_outlined, title: 'No results published yet')
          : ListView(padding: const EdgeInsets.all(16), children: [
              for (final r in list)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Card(
                    clipBehavior: Clip.antiAlias,
                    child: ExpansionTile(
                      title: Text(r.examName),
                      subtitle: Text([percent(r.percentage), if (r.grade != null) 'Grade ${r.grade}', if (r.rankInSection != null) 'Rank ${r.rankInSection}'].join(' · ')),
                      trailing: Pill(r.status == 'PASS' ? 'Passed' : r.status == 'FAIL' ? 'Not passed' : r.status.toLowerCase(), tone: r.status == 'PASS' ? Tone.success : r.status == 'FAIL' ? Tone.danger : Tone.neutral),
                      children: [
                        for (final sub in r.subjects)
                          ListTile(
                            dense: true,
                            title: Text(sub.subject),
                            trailing: Text(
                              sub.absent ? 'Absent' : sub.exempt ? 'Exempt' : '${_n(sub.marks)} / ${_n(sub.maxMarks)}${sub.grade != null ? '  ${sub.grade}' : ''}',
                              style: TextStyle(color: sub.passed == false ? s.danger : null, fontWeight: FontWeight.w600),
                            ),
                          ),
                        if (r.hasReportCard)
                          Padding(
                            padding: const EdgeInsets.all(12),
                            child: OutlinedButton.icon(
                              icon: const Icon(Icons.picture_as_pdf_outlined),
                              label: const Text('Report card'),
                              onPressed: () => openLink(context, () async => (await ref.read(apiProvider).get<Json>('/exams/${r.examId}/report-cards/${child.id}'))['url'] as String),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
            ]),
    );
  }
}

String _n(double? v) => v == null ? '—' : (v % 1 == 0 ? v.toInt().toString() : v.toStringAsFixed(1));
