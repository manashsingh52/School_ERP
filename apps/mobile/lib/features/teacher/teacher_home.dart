import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/attendance_queue.dart';
import '../../core/session.dart';
import '../../widgets/common.dart';
import '../connect/connect_row.dart';
import 'marks_screen.dart';
import 'register_screen.dart';
import 'teacher_data.dart';

/// Teacher home (docs/06 §5): today's classes, registers still to take, marks still to enter.
class TeacherHome extends ConsumerWidget {
  const TeacherHome({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    final dash = ref.watch(teacherDashboard);
    final marks = ref.watch(myMarksSheets);
    final queued = ref.watch(attendanceQueueProvider);
    final now = TimeOfDay.now();
    final nowText = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
    return Refreshable(
      onRefresh: () async {
        ref.invalidate(teacherDashboard);
        ref.invalidate(myMarksSheets);
        await ref.read(attendanceQueueProvider.notifier).sync();
      },
      children: [
        Text('Good day, ${me.user.name.split(' ').first}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        const ConnectRow(),
        if (queued.isNotEmpty) const QueueBanner(),
        AsyncView(
          value: dash,
          onRetry: () => ref.invalidate(teacherDashboard),
          builder: (d) => Column(children: [
            if (d.myRegisters.isNotEmpty)
              SectionCard(
                title: 'Attendance to take',
                child: Column(children: [
                  for (final r in d.myRegisters)
                    ListTile(
                      leading: const Icon(Icons.how_to_reg_outlined),
                      title: Text(r.label),
                      subtitle: Text(r.status == 'DRAFT' ? 'Saved as draft' : 'Not taken yet'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RegisterScreen(sectionId: r.sectionId, label: r.label))),
                    ),
                ]),
              ),
            if (d.myRegisters.isNotEmpty) const SizedBox(height: 12),
            SectionCard(
              title: "Today's classes",
              child: d.today == null || d.today!.isWeeklyOff || d.today!.slots.isEmpty
                  ? const EmptyView(icon: Icons.free_breakfast_outlined, title: 'No classes today')
                  : Column(children: [
                      for (final s in d.today!.slots.where((x) => !x.isBreak))
                        Builder(builder: (context) {
                          final current = s.startTime.compareTo(nowText) <= 0 && s.endTime.compareTo(nowText) > 0;
                          return ListTile(
                            dense: true,
                            selected: current,
                            leading: SizedBox(width: 48, child: Text(s.startTime)),
                            title: Text([s.section, s.subject].whereType<String>().join(' · ')),
                            subtitle: Text([s.periodName, s.room].whereType<String>().join(' · ')),
                            trailing: current ? const Pill('Now', tone: Tone.accent) : null,
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
            final open = sheets.where((s) => s.entered < s.total).toList();
            if (open.isEmpty) return const SizedBox.shrink();
            return SectionCard(
              title: 'Marks to enter',
              child: Column(children: [
                for (final s in open.take(5))
                  ListTile(
                    title: Text('${s.subject} · ${s.sectionLabel}'),
                    subtitle: Text('${s.examName} · ${s.entered} of ${s.total} entered'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => MarksEntryScreen(sheet: s))),
                  ),
              ]),
            );
          },
        ),
      ],
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
