import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/attendance_queue.dart';
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
import 'classes_tab.dart';
import 'marks_screen.dart';
import 'register_screen.dart';
import 'teacher_data.dart';

/// Teacher home: who and where up top, a colourful shortcut card, then registers to take,
/// today's classes and marks still to enter — each as a card you can tap.
class TeacherHome extends ConsumerWidget {
  const TeacherHome({super.key, this.onOpenTab});
  /// 1 = Attendance, 2 = Classes, 3 = Alerts, 4 = Profile.
  final void Function(int tab)? onOpenTab;

  void _push(BuildContext context, Widget screen) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));

  void _classes(WidgetRef ref, int sub) {
    ref.read(classesTabProvider.notifier).go(sub);
    onOpenTab?.call(2);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    final dash = ref.watch(teacherDashboard);
    final marks = ref.watch(myMarksSheets);
    final queued = ref.watch(attendanceQueueProvider);
    final unread = ref.watch(unreadMessagesProvider).value ?? 0;
    final s = StatusColors.of(context);
    final now = TimeOfDay.now();
    final nowText = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
    final d = dash.value;
    final classesToday = d?.today == null || d!.today!.isWeeklyOff ? 0 : d.today!.slots.where((x) => !x.isBreak).length;
    final openSheets = (marks.value ?? const []).where((x) => x.entered < x.total).toList();
    final registers = d?.myRegisters ?? const [];

    final features = [
      Feature('Attendance', Icons.how_to_reg_rounded, FeatureColors.green, () => onOpenTab?.call(1)),
      Feature('Marks', Icons.edit_note_rounded, FeatureColors.pink, () => _classes(ref, 1)),
      Feature('Homework', Icons.menu_book_rounded, FeatureColors.teal, () => _classes(ref, 0)),
      if (me.can('message.use')) Feature('Messages', Icons.mail_rounded, FeatureColors.blue, () => _push(context, const MessagesScreen()), badge: unread),
      if (me.can('meeting.view')) Feature('Meetings', Icons.videocam_rounded, FeatureColors.purple, () => _push(context, const MeetingsScreen())),
      if (me.can('reminder.use')) Feature('Reminders', Icons.alarm_rounded, FeatureColors.orange, () => _push(context, const RemindersScreen())),
      Feature('Alerts', Icons.campaign_rounded, FeatureColors.indigo, () => onOpenTab?.call(3)),
      if (me.can('calendar.view')) Feature('Calendar', Icons.event_rounded, FeatureColors.red, () => _push(context, const CalendarScreen())),
    ];

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(teacherDashboard);
          ref.invalidate(myMarksSheets);
          ref.invalidate(unreadMessagesProvider);
          await ref.read(attendanceQueueProvider.notifier).sync();
        },
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
          HomeHeader(
            greeting: greetingFor(DateTime.now()),
            name: me.user.name,
            subtitle: ['Teacher', me.membership?.school.name].whereType<String>().join(' · '),
            avatarName: me.user.name,
            actions: [
              HeaderAction(icon: Icons.add_rounded, tooltip: 'New', onPressed: () => _quickAdd(context, ref)),
              HeaderAction(icon: Icons.settings_outlined, tooltip: 'Profile and settings', onPressed: () => onOpenTab?.call(4)),
            ],
          ),
          const SizedBox(height: 18),
          FeatureCard(
            lines: [
              (Icons.how_to_reg_rounded, registers.isEmpty ? 'All registers done' : '${registers.length} register${registers.length == 1 ? '' : 's'} to take'),
              (Icons.edit_note_rounded, openSheets.isEmpty ? 'No marks pending' : '${openSheets.length} marks sheet${openSheets.length == 1 ? '' : 's'} open'),
            ],
            metricLabel: 'Classes today',
            metricValue: d == null ? '—' : '$classesToday',
            features: features,
          ),
          if (queued.isNotEmpty) ...[const SizedBox(height: 12), const QueueBanner()],
          AsyncView(
            value: dash,
            onRetry: () => ref.invalidate(teacherDashboard),
            builder: (d) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (d.myRegisters.isNotEmpty) ...[
                const SizedBox(height: 18),
                HomeSectionTitle(title: 'Attendance to take', caption: '${d.myRegisters.length} section${d.myRegisters.length == 1 ? '' : 's'} · today'),
                const SizedBox(height: 12),
                for (final r in d.myRegisters)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AccentCard(
                      accent: r.status == 'DRAFT' ? FeatureColors.orange : FeatureColors.red,
                      title: r.label,
                      subtitle: r.status == 'DRAFT' ? 'Saved as draft' : 'Not taken yet',
                      chip: r.status == 'DRAFT' ? 'Finish and submit' : 'Take register',
                      chipIcon: Icons.how_to_reg_rounded,
                      onTap: () => _push(context, RegisterScreen(sectionId: r.sectionId, label: r.label)),
                    ),
                  ),
              ],
              const SizedBox(height: 18),
              HomeSectionTitle(title: "Today's classes", caption: d.today == null || d.today!.isWeeklyOff ? 'Day off' : '$classesToday classes'),
              const SizedBox(height: 12),
              if (d.today == null || d.today!.isWeeklyOff || d.today!.slots.isEmpty)
                const Card(child: EmptyView(icon: Icons.free_breakfast_outlined, title: 'No classes today'))
              else
                Card(
                  child: Column(children: [
                    for (final slot in d.today!.slots.where((x) => !x.isBreak))
                      Builder(builder: (context) {
                        final current = slot.startTime.compareTo(nowText) <= 0 && slot.endTime.compareTo(nowText) > 0;
                        final done = slot.endTime.compareTo(nowText) <= 0;
                        return ListTile(
                          leading: Container(
                            width: 56,
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            decoration: BoxDecoration(color: (current ? FeatureColors.green : s.muted).withValues(alpha: current ? 0.16 : 0.08), borderRadius: BorderRadius.circular(10)),
                            child: Text(slot.startTime, textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, color: current ? FeatureColors.green : done ? s.muted : null)),
                          ),
                          title: Text([slot.section, slot.subject].whereType<String>().join(' · '), style: TextStyle(color: done ? s.muted : null, fontWeight: FontWeight.w600)),
                          subtitle: Text([slot.periodName, slot.room].whereType<String>().join(' · ')),
                          trailing: current ? const Pill('Now', tone: Tone.success) : null,
                        );
                      }),
                  ]),
                ),
            ]),
          ),
          AsyncView(
            value: marks,
            onRetry: () => ref.invalidate(myMarksSheets),
            builder: (sheets) {
              final open = sheets.where((x) => x.entered < x.total).toList();
              if (open.isEmpty) return const SizedBox.shrink();
              return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const SizedBox(height: 18),
                HomeSectionTitle(title: 'Marks to enter', caption: '${open.length} sheet${open.length == 1 ? '' : 's'}', action: 'All', actionIcon: Icons.list_rounded, onAction: () => _classes(ref, 1)),
                const SizedBox(height: 12),
                for (final m in open.take(5))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AccentCard(
                      accent: m.entered == 0 ? FeatureColors.red : FeatureColors.orange,
                      title: '${m.subject} · ${m.sectionLabel}',
                      subtitle: m.examName,
                      chip: m.entered == 0 ? 'Not started' : '${m.total - m.entered} left',
                      chipIcon: Icons.edit_note_rounded,
                      trailing: ScoreRing(value: m.total == 0 ? 0 : m.entered / m.total, center: '${m.entered}', caption: '${m.entered}/${m.total}', color: m.entered == 0 ? FeatureColors.red : FeatureColors.orange),
                      onTap: () => _push(context, MarksEntryScreen(sheet: m)),
                    ),
                  ),
              ]);
            },
          ),
        ]),
      ),
    );
  }

  void _quickAdd(BuildContext context, WidgetRef ref) {
    final me = ref.read(meProvider);
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (me.can('homework.manage'))
            ListTile(leading: const Icon(Icons.menu_book_rounded, color: FeatureColors.teal), title: const Text('Set homework'), onTap: () {
              Navigator.pop(ctx);
              Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const HomeworkCreateScreen(), fullscreenDialog: true));
            }),
          if (me.can('message.use'))
            ListTile(leading: const Icon(Icons.mail_rounded, color: FeatureColors.blue), title: const Text('Message a parent'), onTap: () {
              Navigator.pop(ctx);
              _push(context, const NewMessageScreen());
            }),
          if (me.can('meeting.manage'))
            ListTile(leading: const Icon(Icons.video_call_rounded, color: FeatureColors.purple), title: const Text('Schedule a meeting'), onTap: () {
              Navigator.pop(ctx);
              _push(context, const MeetingFormScreen());
            }),
          if (me.can('reminder.use'))
            ListTile(leading: const Icon(Icons.alarm_add_rounded, color: FeatureColors.orange), title: const Text('Set a reminder'), onTap: () {
              Navigator.pop(ctx);
              _push(context, const ReminderFormScreen());
            }),
        ]),
      ),
    );
  }
}

/// "2 registers will sync when you're online" — with a manual retry.
class QueueBanner extends ConsumerWidget {
  const QueueBanner({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queued = ref.watch(attendanceQueueProvider);
    final failed = queued.where((q) => q.error != null).length;
    return Card(
      color: Theme.of(context).colorScheme.primaryContainer,
      child: ListTile(
        leading: Icon(failed > 0 ? Icons.error_outline : Icons.cloud_upload_outlined),
        title: Text(failed > 0 ? '$failed register${failed == 1 ? '' : 's'} could not be sent' : '${queued.length} register${queued.length == 1 ? '' : 's'} will sync when you\'re online'),
        subtitle: failed > 0 ? const Text('Open Attendance to see why') : null,
        trailing: TextButton(
          onPressed: () async {
            final sent = await ref.read(attendanceQueueProvider.notifier).sync();
            if (context.mounted) toast(context, sent > 0 ? 'Sent $sent register${sent == 1 ? '' : 's'}' : 'Still offline — will try again');
          },
          child: const Text('Sync now'),
        ),
      ),
    );
  }
}
