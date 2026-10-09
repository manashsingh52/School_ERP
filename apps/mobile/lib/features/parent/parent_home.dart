import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'parent_data.dart';

/// Parent home (docs/06 §4): today, homework due, fees due, latest results.
class ParentHome extends ConsumerWidget {
  const ParentHome({super.key, required this.onOpenTab});
  /// 1 = Academics, 2 = Fees.
  final void Function(int tab) onOpenTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final child = ref.watch(childProvider);
    final me = ref.watch(meProvider);
    if (child == null) return const EmptyView(icon: Icons.family_restroom, title: 'No children linked yet', subtitle: 'Ask the school office to link your child to your account.');
    final attendance = ref.watch(childTodayAttendance(child.id));
    final schedule = ref.watch(childSchedule(child.id));
    final homework = ref.watch(childHomework(child.id));
    final fees = ref.watch(childFees(child.id));
    final results = ref.watch(childResults(child.id));
    final s = StatusColors.of(context);
    return Refreshable(
      onRefresh: () async => refreshChild(ref, child.id),
      children: [
        Text('Hello, ${me.user.name.split(' ').first}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        SectionCard(
          title: 'Today',
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            AsyncView(
              value: attendance,
              onRetry: () => ref.invalidate(childTodayAttendance(child.id)),
              builder: (a) {
                final status = a.days[today()];
                return ListTile(
                  leading: Icon(status == null ? Icons.schedule : status == 'ABSENT' ? Icons.cancel_outlined : Icons.check_circle_outline, color: status == null ? s.muted : status == 'ABSENT' ? s.danger : s.success),
                  title: Text(status == null ? 'Attendance not marked yet' : '${child.firstName} is ${attendanceLabel[status]!.toLowerCase()} today'),
                );
              },
            ),
            const Divider(),
            AsyncView(
              value: schedule,
              onRetry: () => ref.invalidate(childSchedule(child.id)),
              builder: (t) => t.isWeeklyOff || t.slots.isEmpty
                  ? const ListTile(leading: Icon(Icons.weekend_outlined), title: Text('No classes today'))
                  : Column(children: [for (final slot in t.slots.where((x) => !x.isBreak).take(8)) _SlotTile(slot)]),
            ),
          ]),
        ),
        AsyncView(
          value: fees,
          onRetry: () => ref.invalidate(childFees(child.id)),
          builder: (f) => f.balancePaise <= 0
              ? const SizedBox.shrink()
              : Card(
                  child: ListTile(
                    leading: Icon(Icons.currency_rupee, color: f.overduePaise > 0 ? s.danger : null),
                    title: Text('${rupees(f.balancePaise)} due'),
                    subtitle: Text(f.overduePaise > 0 ? '${rupees(f.overduePaise)} is overdue' : 'Next: ${formatDate(f.invoices.where((i) => i.payable).map((i) => i.dueDate).fold<String>('9999-12-31', (a, b) => a.compareTo(b) < 0 ? a : b))}'),
                    trailing: FilledButton(onPressed: () => onOpenTab(2), child: const Text('Pay')),
                  ),
                ),
        ),
        SectionCard(
          title: 'Homework',
          action: 'All',
          onAction: () => onOpenTab(1),
          child: AsyncView(
            value: homework,
            onRetry: () => ref.invalidate(childHomework(child.id)),
            builder: (list) {
              final due = list.where((h) => h.dueDate == null || h.dueDate!.compareTo(today()) >= 0).take(3).toList();
              if (due.isEmpty) return const EmptyView(icon: Icons.task_alt, title: 'Nothing due');
              return Column(children: [
                for (final h in due) ListTile(title: Text(h.title), subtitle: Text([h.subject, if (h.dueDate != null) 'due ${formatDay(h.dueDate!)}'].join(' · ')), onTap: () => showHomework(context, h, studentId: child.id)),
              ]);
            },
          ),
        ),
        AsyncView(
          value: results,
          onRetry: () => ref.invalidate(childResults(child.id)),
          builder: (list) => list.isEmpty
              ? const SizedBox.shrink()
              : Card(
                  child: ListTile(
                    leading: const Icon(Icons.emoji_events_outlined),
                    title: Text('${list.first.examName}: ${percent(list.first.percentage)}${list.first.grade != null ? ' · ${list.first.grade}' : ''}'),
                    subtitle: const Text('Latest result'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => onOpenTab(1),
                  ),
                ),
        ),
      ],
    );
  }
}

class _SlotTile extends StatelessWidget {
  const _SlotTile(this.slot);
  final Slot slot;

  @override
  Widget build(BuildContext context) => ListTile(
        dense: true,
        leading: SizedBox(width: 48, child: Text(slot.startTime, style: Theme.of(context).textTheme.bodySmall)),
        title: Text(slot.subject ?? slot.periodName),
        subtitle: slot.teacher == null ? null : Text([slot.teacher, slot.room].whereType<String>().join(' · ')),
      );
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
