import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/home_kit.dart';
import '../connect/calendar_screen.dart';
import '../connect/connect_data.dart';
import '../connect/meetings_screen.dart';
import '../connect/messages_screen.dart';
import '../connect/reminders_screen.dart';
import '../shell/tab_requests.dart';
import 'parent_data.dart';
import 'performance_section.dart';

/// Parent home: the child up top, a shortcut card in colour, today in one line, and every
/// subject as a card with its average in a ring (tap for the tests).
class ParentHome extends ConsumerWidget {
  const ParentHome({super.key, required this.onOpenTab});
  /// 1 = Academics, 2 = Fees, 3 = Alerts, 4 = Profile.
  final void Function(int tab) onOpenTab;

  void _academics(WidgetRef ref, int sub) {
    ref.read(academicsTabProvider.notifier).go(sub);
    onOpenTab(1);
  }

  void _push(BuildContext context, Widget screen) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final child = ref.watch(childProvider);
    final me = ref.watch(meProvider);
    if (child == null) return const SafeArea(child: EmptyView(icon: Icons.family_restroom, title: 'No children linked yet', subtitle: 'Ask the school office to link your child to your account.'));
    final s = StatusColors.of(context);
    final session = ref.watch(childSessionAttendance(child.id)).value;
    final todayStatus = ref.watch(childTodayAttendance(child.id)).value?.days[today()];
    final schedule = ref.watch(childSchedule(child.id)).value;
    final fees = ref.watch(childFees(child.id)).value;
    final homework = ref.watch(childHomework(child.id)).value ?? const <Homework>[];
    final perf = ref.watch(childPerformance(child.id));
    final teachers = me.can('message.use') ? ref.watch(contactsProvider(child.id)).value : null;
    final classTeacher = teachers?.where((t) => t.role.startsWith('Class teacher')).firstOrNull;
    final unread = ref.watch(unreadMessagesProvider).value ?? 0;
    final pct = session?.summary.percentPresent;
    final schoolName = me.membership?.school.name ?? '';

    final features = [
      if (me.can('message.use')) Feature('Messages', Icons.mail_rounded, FeatureColors.blue, () => _push(context, const MessagesScreen()), badge: unread),
      if (me.can('meeting.view')) Feature('Meetings', Icons.videocam_rounded, FeatureColors.purple, () => _push(context, const MeetingsScreen())),
      if (me.can('reminder.use')) Feature('Reminders', Icons.alarm_rounded, FeatureColors.orange, () => _push(context, const RemindersScreen())),
      Feature('Results', Icons.insights_rounded, FeatureColors.pink, () => _academics(ref, 3)),
      Feature('Homework', Icons.menu_book_rounded, FeatureColors.teal, () => _academics(ref, 1)),
      Feature('Timetable', Icons.calendar_month_rounded, FeatureColors.sky, () => _academics(ref, 2)),
      Feature('Fees', Icons.currency_rupee_rounded, FeatureColors.green, () => onOpenTab(2)),
      if (me.can('calendar.view')) Feature('Calendar', Icons.event_rounded, FeatureColors.red, () => _push(context, const CalendarScreen())),
    ];

    final nowText = DateFormat('HH:mm').format(DateTime.now());
    final next = schedule == null || schedule.isWeeklyOff ? null : schedule.slots.where((x) => !x.isBreak && x.endTime.compareTo(nowText) > 0).firstOrNull;
    final due = homework.where((h) => h.dueDate != null && h.dueDate!.compareTo(today()) >= 0 && h.progress != 'SUBMITTED' && h.progress != 'REVIEWED').toList();

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () async {
          refreshChild(ref, child.id);
          ref.invalidate(unreadMessagesProvider);
        },
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
          HomeHeader(
            greeting: '${greetingFor(DateTime.now())}, ${me.user.name.split(' ').first}',
            name: child.name,
            subtitle: ['Class ${child.classLabel ?? '—'}', if (schoolName.isNotEmpty) schoolName].join(' · '),
            avatarName: child.name,
            onTapIdentity: me.children.length > 1 ? () => _pickChild(context, ref) : null,
            actions: [
              HeaderAction(icon: Icons.add_rounded, tooltip: 'New', onPressed: () => _quickAdd(context)),
              HeaderAction(icon: Icons.settings_outlined, tooltip: 'Profile and settings', onPressed: () => onOpenTab(4)),
            ],
          ),
          const SizedBox(height: 18),
          FeatureCard(
            lines: [
              (Icons.school_rounded, 'Class ${child.classLabel ?? '—'}'),
              classTeacher == null ? (Icons.apartment_rounded, schoolName) : (Icons.person_rounded, 'Class teacher: ${classTeacher.name}'),
            ],
            metricLabel: 'Attendance',
            metricValue: percent(pct),
            metricColor: pct == null ? null : pct >= 85 ? s.success : pct >= 75 ? null : s.danger,
            onTapInfo: () => _academics(ref, 0),
            features: features,
          ),
          const SizedBox(height: 14),
          _TodayStrip(status: todayStatus, firstName: child.firstName, next: next, dueHomework: due.length, onAttendance: () => _academics(ref, 0), onHomework: () => _academics(ref, 1)),
          if (fees != null && fees.balancePaise > 0) ...[
            const SizedBox(height: 12),
            AccentCard(
              accent: fees.overduePaise > 0 ? FeatureColors.red : FeatureColors.orange,
              title: '${rupees(fees.balancePaise)} fees due',
              subtitle: fees.overduePaise > 0 ? '${rupees(fees.overduePaise)} is overdue' : 'Pay online in a minute',
              chip: fees.overduePaise > 0 ? 'Overdue' : 'Due soon',
              chipIcon: Icons.error_rounded,
              trailing: FilledButton(onPressed: () => onOpenTab(2), child: const Text('Pay')),
            ),
          ],
          const SizedBox(height: 22),
          AsyncView(
            value: perf,
            onRetry: () => ref.invalidate(childPerformance(child.id)),
            builder: (p) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              HomeSectionTitle(
                title: 'Your Subjects',
                caption: p.subjects.isEmpty ? 'No marks yet' : '${p.subjects.length} subjects · ${p.exams.length} exam${p.exams.length == 1 ? '' : 's'} · avg ${percent(p.overallPct)}',
                action: 'Results',
                actionIcon: Icons.insights_rounded,
                onAction: () => _academics(ref, 3),
              ),
              const SizedBox(height: 12),
              if (p.subjects.isEmpty)
                const Card(child: EmptyView(icon: Icons.emoji_events_outlined, title: 'No marks yet', subtitle: 'Subjects appear here when the first test results are out.'))
              else
                for (final x in p.subjects)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _SubjectHomeCard(subject: x, teacher: teachers?.where((t) => t.subjects.contains(x.name)).firstOrNull, onOpenResults: () => _academics(ref, 3)),
                  ),
            ]),
          ),
        ]),
      ),
    );
  }

  void _pickChild(BuildContext context, WidgetRef ref) {
    final me = ref.read(meProvider);
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final k in me.children)
            ListTile(
              leading: GradientAvatar(name: k.name, size: 40),
              title: Text(k.name),
              subtitle: Text('Class ${k.classLabel ?? '—'}'),
              trailing: ref.read(childProvider)?.id == k.id ? const Icon(Icons.check_circle) : null,
              onTap: () {
                ref.read(childProvider.notifier).select(k);
                Navigator.pop(ctx);
              },
            ),
        ]),
      ),
    );
  }

  void _quickAdd(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.mail_rounded, color: FeatureColors.blue), title: const Text('Message a teacher'), onTap: () {
            Navigator.pop(ctx);
            _push(context, const NewMessageScreen());
          }),
          ListTile(leading: const Icon(Icons.report_rounded, color: FeatureColors.red), title: const Text('Raise a complaint'), onTap: () {
            Navigator.pop(ctx);
            _push(context, const NewMessageScreen(category: 'COMPLAINT'));
          }),
          ListTile(leading: const Icon(Icons.alarm_add_rounded, color: FeatureColors.orange), title: const Text('Set a reminder'), onTap: () {
            Navigator.pop(ctx);
            _push(context, const ReminderFormScreen());
          }),
        ]),
      ),
    );
  }
}

/// Today in one card: attendance mark, the next class, homework due.
class _TodayStrip extends StatelessWidget {
  const _TodayStrip({required this.status, required this.firstName, required this.next, required this.dueHomework, required this.onAttendance, required this.onHomework});
  final String? status;
  final String firstName;
  final Slot? next;
  final int dueHomework;
  final VoidCallback onAttendance, onHomework;

  @override
  Widget build(BuildContext context) {
    final s = StatusColors.of(context);
    final (icon, color, label) = switch (status) {
      null => (Icons.schedule_rounded, s.muted, 'Not marked yet'),
      'ABSENT' => (Icons.cancel_rounded, s.danger, 'Absent today'),
      'LATE' => (Icons.watch_later_rounded, s.warning, 'Arrived late'),
      _ => (Icons.check_circle_rounded, s.success, 'In school today'),
    };
    Widget cell(IconData i, Color c, String top, String bottom, VoidCallback onTap) => Expanded(
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
              child: Row(children: [
                Icon(i, color: c, size: 26),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(top, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(bottom, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: s.muted, fontSize: 13)),
                  ]),
                ),
              ]),
            ),
          ),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: IntrinsicHeight(
          child: Row(children: [
            cell(icon, color, label, firstName, onAttendance),
            VerticalDivider(width: 1, indent: 8, endIndent: 8, color: s.border),
            next != null
                ? cell(Icons.class_rounded, FeatureColors.sky, next!.subject ?? next!.periodName, 'Next · ${next!.startTime}', onHomework)
                : cell(Icons.menu_book_rounded, FeatureColors.teal, 'Homework', dueHomework == 0 ? 'Nothing due' : '$dueHomework due', onHomework),
          ]),
        ),
      ),
    );
  }
}

/// A subject on the home screen: average in a ring, marks got / max across tests, a status chip.
class _SubjectHomeCard extends StatelessWidget {
  const _SubjectHomeCard({required this.subject, required this.onOpenResults, this.teacher});
  final PerformanceSubject subject;
  /// Who teaches this subject to the child (for "Message …").
  final MessageContact? teacher;
  final VoidCallback onOpenResults;

  @override
  Widget build(BuildContext context) {
    final avg = subject.averagePct;
    final counted = subject.exams.where((e) => !e.exempt && (e.marks != null || e.absent));
    final got = counted.fold<double>(0, (n, e) => n + (e.absent ? 0 : e.marks ?? 0));
    final max = counted.fold<double>(0, (n, e) => n + e.maxMarks);
    final color = avg == null ? StatusColors.of(context).muted : avg >= 75 ? FeatureColors.green : avg >= 50 ? FeatureColors.orange : FeatureColors.red;
    final (chip, chipIcon) = avg == null
        ? ('No marks yet', Icons.hourglass_empty_rounded)
        : avg >= 75
            ? (subject.trend == 'down' ? 'Doing well · slipped a little' : 'Doing well', Icons.verified_rounded)
            : avg >= 50
                ? (subject.trend == 'up' ? 'Improving — keep going' : 'Keep practising', Icons.trending_up_rounded)
                : ('Needs attention', Icons.error_rounded);
    String n(double v) => v % 1 == 0 ? v.toInt().toString() : v.toStringAsFixed(1);
    return AccentCard(
      accent: color,
      title: subject.name,
      subtitle: '${subject.exams.length} test${subject.exams.length == 1 ? '' : 's'}${subject.sectionAveragePct == null ? '' : ' • Section ${percent(subject.sectionAveragePct)}'}',
      chip: chip,
      chipIcon: chipIcon,
      trailing: ScoreRing(value: avg == null ? null : avg / 100, center: avg == null ? '—' : '${avg.round()}', caption: max == 0 ? null : '${n(got)}/${n(max)}', color: color),
      onTap: () => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(subject.name, style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              Text('Average ${percent(avg)}${subject.sectionAveragePct == null ? '' : ' · section ${percent(subject.sectionAveragePct)}'}', style: TextStyle(color: StatusColors.of(ctx).muted)),
              const SizedBox(height: 8),
              for (final e in subject.exams)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(e.examName),
                  subtitle: Text([if (e.grade != null) 'Grade ${e.grade}', if (e.sectionAveragePct != null) 'Section ${percent(e.sectionAveragePct)}'].join(' · ')),
                  trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(e.exempt ? 'Exempt' : e.absent ? 'Absent' : '${n(e.marks ?? 0)} / ${n(e.maxMarks)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(percent(e.percent), style: TextStyle(color: pctColor(ctx, e.percent), fontWeight: FontWeight.w600)),
                  ]),
                ),
              const SizedBox(height: 8),
              if (teacher != null && teacher!.available) ...[
                FilledButton.tonalIcon(
                  onPressed: () {
                    Navigator.pop(ctx);
                    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => NewMessageScreen(toMemberId: teacher!.memberId, subject: 'About ${subject.name}', category: 'ACADEMIC')));
                  },
                  icon: const Icon(Icons.mail_rounded),
                  label: Text('Message ${teacher!.name} (${subject.name} teacher)', overflow: TextOverflow.ellipsis),
                ),
                const SizedBox(height: 8),
              ],
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(ctx);
                  onOpenResults();
                },
                icon: const Icon(Icons.insights_rounded),
                label: const Text('All results and report cards'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Parent's view of one homework; tells the teacher it was seen (best effort).
void showHomework(BuildContext context, Homework h, {String? studentId}) {
  if (studentId != null && h.progress == 'ASSIGNED') {
    ProviderScope.containerOf(context).read(apiProvider).post<Object?>('/homework/${h.id}/seen', {'studentId': studentId}).ignore();
  }
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      builder: (ctx, scroll) => ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(20, 0, 20, 24), children: [
        Text(h.title, style: Theme.of(ctx).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text([h.subject, h.teacher, if (h.dueDate != null) 'Due ${formatDate(h.dueDate!)}'].join(' · '), style: Theme.of(ctx).textTheme.bodySmall),
        if (h.description != null) ...[const SizedBox(height: 16), Text(h.description!)],
        if (h.feedback != null) ...[
          const SizedBox(height: 16),
          Card(child: ListTile(leading: const Icon(Icons.rate_review_outlined), title: Text("${h.teacher}'s note"), subtitle: Text(h.feedback!))),
        ],
        if (h.attachments.isNotEmpty) ...[
          const SizedBox(height: 16),
          for (final a in h.attachments)
            Consumer(
              builder: (ctx, ref, _) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.attach_file),
                title: Text(a.name),
                onTap: () => openLink(ctx, () async => (await ref.read(apiProvider).get<Json>('/homework/${h.id}/attachments/${a.id}'))['url'] as String),
              ),
            ),
        ],
      ]),
    ),
  );
}
