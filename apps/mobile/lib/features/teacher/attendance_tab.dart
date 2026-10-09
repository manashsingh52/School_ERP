import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/attendance_queue.dart';
import '../../core/format.dart';
import '../../widgets/common.dart';
import 'register_screen.dart';
import 'teacher_data.dart';
import 'teacher_home.dart';

/// Attendance tab: my sections for today, plus anything waiting to sync.
class AttendanceTab extends ConsumerWidget {
  const AttendanceTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sections = ref.watch(markableSections);
    final queued = ref.watch(attendanceQueueProvider);
    return Refreshable(
      onRefresh: () async {
        await ref.read(attendanceQueueProvider.notifier).sync();
        ref.invalidate(markableSections);
      },
      children: [
        if (queued.isNotEmpty) ...[
          const QueueBanner(),
          for (final q in queued.where((x) => x.error != null))
            Card(
              child: ListTile(
                leading: const Icon(Icons.error_outline),
                title: Text('${q.label} · ${formatDay(q.date)}'),
                subtitle: Text(q.error!),
                trailing: TextButton(onPressed: () => ref.read(attendanceQueueProvider.notifier).discard(q.id), child: const Text('Discard')),
              ),
            ),
        ],
        SectionCard(
          title: 'Today · ${formatDay(today())}',
          child: AsyncView(
            value: sections,
            onRetry: () => ref.invalidate(markableSections),
            builder: (list) => list.isEmpty
                ? const EmptyView(icon: Icons.how_to_reg_outlined, title: 'No classes to mark', subtitle: "You'll see your class here once you're its class teacher.")
                : Column(children: [
                    for (final s in list)
                      ListTile(
                        title: Text(s.label),
                        subtitle: Text(s.status == 'SUBMITTED' ? '${s.present} of ${s.students} present' : s.status == 'DRAFT' ? 'Draft saved' : '${s.students} students · not taken'),
                        trailing: s.status == 'SUBMITTED' ? const Pill('Done', tone: Tone.success) : const Pill('To do', tone: Tone.warning),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RegisterScreen(sectionId: s.sectionId, label: s.label))),
                      ),
                  ]),
          ),
        ),
      ],
    );
  }
}
