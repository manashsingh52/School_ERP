import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../shell/tab_requests.dart';
import 'parent_data.dart';
import 'parent_home.dart';
import 'performance_section.dart';

/// Academics (docs/06 §4): attendance calendar, homework, timetable, results.
class AcademicsScreen extends ConsumerStatefulWidget {
  const AcademicsScreen({super.key});
  @override
  ConsumerState<AcademicsScreen> createState() => _AcademicsScreenState();
}

class _AcademicsScreenState extends ConsumerState<AcademicsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 4, vsync: this, initialIndex: ref.read(academicsTabProvider));

  @override
  void initState() {
    super.initState();
    _tabs.addListener(() {
      if (!_tabs.indexIsChanging) ref.read(academicsTabProvider.notifier).go(_tabs.index);
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(academicsTabProvider, (_, next) {
      if (next != _tabs.index) _tabs.animateTo(next);
    });
    final child = ref.watch(childProvider);
    if (child == null) return const EmptyView(icon: Icons.family_restroom, title: 'No children linked yet');
    return Column(children: [
      Material(
        color: Theme.of(context).colorScheme.surface,
        child: TabBar(controller: _tabs, isScrollable: true, tabAlignment: TabAlignment.start, tabs: const [Tab(text: 'Attendance'), Tab(text: 'Homework'), Tab(text: 'Timetable'), Tab(text: 'Results')]),
      ),
      Expanded(
        child: TabBarView(controller: _tabs, children: [
          _AttendanceTab(child: child),
          _HomeworkTab(child: child),
          _TimetableTab(child: child),
          _ResultsTab(child: child),
        ]),
      ),
    ]);
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
  bool _session = false;
  String? _picked;

  @override
  Widget build(BuildContext context) {
    final key = DateFormat('yyyy-MM').format(_month);
    final data = ref.watch(childMonthAttendance((widget.child.id, key)));
    final session = ref.watch(childSessionAttendance(widget.child.id));
    final s = StatusColors.of(context);
    final colors = {'PRESENT': s.success, 'ABSENT': s.danger, 'LATE': s.warning, 'HALF_DAY': s.info, 'LEAVE': s.muted};
    final isCurrent = _month.year == DateTime.now().year && _month.month == DateTime.now().month;
    return Refreshable(
      onRefresh: () async {
        ref.invalidate(childMonthAttendance((widget.child.id, key)));
        ref.invalidate(childSessionAttendance(widget.child.id));
      },
      children: [
        AsyncView(
          value: session,
          onRetry: () => ref.invalidate(childSessionAttendance(widget.child.id)),
          loading: const SizedBox(height: 84),
          builder: (h) => _SessionTotals(t: h.summary),
        ),
        SegmentedButton<bool>(
          segments: const [ButtonSegment(value: false, label: Text('Days'), icon: Icon(Icons.calendar_month_outlined)), ButtonSegment(value: true, label: Text('Whole session'), icon: Icon(Icons.bar_chart))],
          selected: {_session},
          onSelectionChanged: (v) => setState(() => _session = v.first),
        ),
        if (_session)
          AsyncView(
            value: session,
            onRetry: () => ref.invalidate(childSessionAttendance(widget.child.id)),
            builder: (h) => h.months.isEmpty
                ? const EmptyView(icon: Icons.event_busy_outlined, title: 'No registers yet this session')
                : Card(
                    child: Column(children: [
                      for (final m in h.months.reversed)
                        ListTile(
                          onTap: () => setState(() {
                            _month = DateTime.parse('${m.month}-01');
                            _session = false;
                          }),
                          title: Text(DateFormat('MMMM yyyy').format(DateTime.parse('${m.month}-01'))),
                          subtitle: Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: (m.percentPresent ?? 0) / 100, minHeight: 6, color: (m.percentPresent ?? 0) >= 75 ? s.success : s.danger, backgroundColor: s.subtle)),
                              const SizedBox(height: 4),
                              Text('${m.attended} of ${m.conducted} days${m.missed > 0 ? ' · ${m.missed} missed' : ''}'),
                            ]),
                          ),
                          trailing: Text(percent(m.percentPresent), style: TextStyle(fontWeight: FontWeight.w700, color: (m.percentPresent ?? 0) >= 75 ? null : s.danger)),
                        ),
                    ]),
                  ),
          ),
        if (!_session) Row(children: [
          IconButton(tooltip: 'Previous month', onPressed: () => setState(() => _month = DateTime(_month.year, _month.month - 1)), icon: const Icon(Icons.chevron_left)),
          Expanded(child: Text(DateFormat('MMMM yyyy').format(_month), textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium)),
          IconButton(tooltip: 'Next month', onPressed: isCurrent ? null : () => setState(() => _month = DateTime(_month.year, _month.month + 1)), icon: const Icon(Icons.chevron_right)),
        ]),
        if (!_session) AsyncView(
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
                          final date = isoDate(DateTime(first.year, first.month, d));
                          final status = h.days[date];
                          return Semantics(
                            label: '$d ${status == null ? 'not marked' : attendanceLabel[status]}',
                            button: true,
                            child: GestureDetector(
                            onTap: () => setState(() => _picked = date),
                            child: Container(
                              margin: const EdgeInsets.all(3),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(color: status == null ? null : colors[status]!.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(8)),
                              child: Text('$d', style: TextStyle(color: status == null ? s.muted : colors[status], fontWeight: status == null ? null : FontWeight.w600)),
                            ),
                            ),
                          );
                        }),
                    ],
                  ),
                  if (_picked != null && _picked!.startsWith(key))
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        '${formatDay(_picked!)}: ${h.days[_picked] == null ? (_picked!.compareTo(today()) > 0 ? 'not yet' : 'no register (holiday or weekend)') : attendanceLabel[h.days[_picked]]}${h.remarks[_picked] == null ? '' : ' — ${h.remarks[_picked]}'}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
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

/// Classes held · attended · missed · % for the session so far.
class _SessionTotals extends StatelessWidget {
  const _SessionTotals({required this.t});
  final AttendanceTally t;

  @override
  Widget build(BuildContext context) {
    final s = StatusColors.of(context);
    Widget cell(String label, String value, [Color? color]) => Expanded(
          child: Column(children: [
            Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: color)),
            const SizedBox(height: 2),
            Text(label, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
          ]),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        child: Row(children: [
          cell('Classes held', '${t.conducted}'),
          cell('Attended', '${t.attended}', s.success),
          cell('Missed', '${t.missed}', t.missed > 0 ? s.danger : null),
          cell('This session', percent(t.percentPresent), (t.percentPresent ?? 100) < 75 ? s.danger : null),
        ]),
      ),
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
                    trailing: switch (h.progress) {
                      'REVIEWED' => const Pill('Checked', tone: Tone.success),
                      'SUBMITTED' => const Pill('Handed in', tone: Tone.info),
                      _ => h.attachments.isNotEmpty ? const Icon(Icons.attach_file, size: 18) : (overdue ? null : const Pill('Due', tone: Tone.info)),
                    },
                    onTap: () => showHomework(context, h, studentId: child.id),
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
    final terms = ref.watch(childTerms(child.id)).value ?? const <TermResult>[];
    final s = StatusColors.of(context);
    return AsyncView(
      value: results,
      onRetry: () => ref.invalidate(childResults(child.id)),
      builder: (list) => list.isEmpty && terms.isEmpty
          ? const EmptyView(icon: Icons.emoji_events_outlined, title: 'No results published yet')
          : RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(childResults(child.id));
                ref.invalidate(childTerms(child.id));
                ref.invalidate(childPerformance(child.id));
              },
              child: ListView(padding: const EdgeInsets.all(16), children: [
              PerformanceSection(childId: child.id),
              const SizedBox(height: 20),
              Text('Results and report cards', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              for (final term in terms)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Card(
                    clipBehavior: Clip.antiAlias,
                    child: ExpansionTile(
                      initiallyExpanded: true,
                      title: Text(term.name),
                      subtitle: Text([percent(term.percentage), if (term.grade != null) 'Grade ${term.grade}', if (term.rankInSection != null) 'Rank ${term.rankInSection}', term.how].join(' · ')),
                      trailing: Pill(term.status == 'PASS' ? 'Passed' : term.status == 'FAIL' ? 'Not passed' : 'Incomplete', tone: term.status == 'PASS' ? Tone.success : term.status == 'FAIL' ? Tone.danger : Tone.warning),
                      children: [
                        for (final sub in term.subjects)
                          ListTile(
                            dense: true,
                            title: Text(sub.name),
                            trailing: Text('${percent(sub.percent)}${sub.grade != null ? '  ${sub.grade}' : ''}', style: TextStyle(color: sub.passed == false ? s.danger : null, fontWeight: FontWeight.w600)),
                          ),
                        if (term.coScholastic.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                            child: Wrap(spacing: 8, runSpacing: 4, children: [for (final c in term.coScholastic) Chip(label: Text('${c.area}: ${c.grade}'))]),
                          ),
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.picture_as_pdf_outlined),
                            label: const Text('Term report card'),
                            onPressed: () => openLink(context, () async => (await ref.read(apiProvider).get<Json>('/exam-terms/${term.termId}/report-cards/${child.id}'))['url'] as String),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
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
                        if (r.coScholastic.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                            child: Wrap(spacing: 8, runSpacing: 4, children: [for (final c in r.coScholastic) Chip(label: Text('${c.area}: ${c.grade}'))]),
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
            ),
    );
  }
}

String _n(double? v) => v == null ? '—' : (v % 1 == 0 ? v.toInt().toString() : v.toStringAsFixed(1));
