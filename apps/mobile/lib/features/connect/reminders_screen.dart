import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'connect_data.dart';

String reminderWhen(DateTime at) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(at.year, at.month, at.day);
  final label = day == today ? 'Today' : day == today.add(const Duration(days: 1)) ? 'Tomorrow' : DateFormat('EEE, d MMM').format(at);
  return '$label, ${DateFormat('h:mm a').format(at)}';
}

const _presets = ['Pick up from school', 'School bus', 'Parent–teacher meeting', 'Pay school fees', 'Pack sports kit', 'School event'];

/// Personal alarms: "Pick up Rahul at 1:30 PM", Monday to Saturday. The alert arrives as a
/// notification at that time.
class RemindersScreen extends ConsumerWidget {
  const RemindersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(title: const Text('Reminders'), bottom: const TabBar(tabs: [Tab(text: 'Upcoming'), Tab(text: 'Done')])),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ReminderFormScreen())),
          icon: const Icon(Icons.alarm_add),
          label: const Text('New'),
        ),
        body: const TabBarView(children: [_ReminderList(status: 'active'), _ReminderList(status: 'done')]),
      ),
    );
  }
}

class _ReminderList extends ConsumerWidget {
  const _ReminderList({required this.status});
  final String status;

  Future<void> _act(BuildContext context, WidgetRef ref, Reminder r, String action) async {
    try {
      if (action == 'done') await ref.read(apiProvider).patch<Json>('/reminders/${r.id}', {'completed': true});
      if (action == 'delete') await ref.read(apiProvider).delete<Json>('/reminders/${r.id}');
      ref.invalidate(remindersProvider);
    } catch (e) {
      if (context.mounted) toast(context, errorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(remindersProvider(status));
    final s = StatusColors.of(context);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(remindersProvider(status)),
      child: AsyncView(
        value: list,
        onRetry: () => ref.invalidate(remindersProvider(status)),
        builder: (items) => items.isEmpty
            ? ListView(children: [EmptyView(icon: Icons.alarm, title: status == 'active' ? 'No reminders set' : 'Nothing done yet', subtitle: status == 'active' ? 'For example: “Pick up Rahul at 1:30 PM”, Monday to Saturday.' : null)])
            : ListView.separated(
                padding: const EdgeInsets.only(bottom: 88),
                itemCount: items.length,
                separatorBuilder: (_, _) => const Divider(),
                itemBuilder: (_, i) {
                  final r = items[i];
                  final done = r.completedAt != null;
                  return Dismissible(
                    key: ValueKey(r.id),
                    direction: DismissDirection.endToStart,
                    background: Container(color: s.danger, alignment: Alignment.centerRight, padding: const EdgeInsets.only(right: 20), child: const Icon(Icons.delete_outline, color: Colors.white)),
                    onDismissed: (_) => _act(context, ref, r, 'delete'),
                    child: ListTile(
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReminderFormScreen(existing: r))),
                      leading: CircleAvatar(backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: done ? 0.05 : 0.12), child: Icon(Icons.alarm, color: done ? s.muted : Theme.of(context).colorScheme.primary)),
                      title: Text(r.title, style: TextStyle(decoration: done ? TextDecoration.lineThrough : null, fontWeight: FontWeight.w600)),
                      subtitle: Text([reminderWhen(r.remindAt), if (r.repeat != 'NONE') reminderRepeatLabel[r.repeat]!, if (r.studentName != null) r.studentName!.split(' ').first, if (r.notes != null) r.notes!].join(' · ')),
                      trailing: done ? null : IconButton(tooltip: 'Mark done', icon: const Icon(Icons.check_circle_outline), onPressed: () => _act(context, ref, r, 'done')),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class ReminderFormScreen extends ConsumerStatefulWidget {
  const ReminderFormScreen({super.key, this.existing});
  final Reminder? existing;
  @override
  ConsumerState<ReminderFormScreen> createState() => _ReminderFormScreenState();
}

class _ReminderFormScreenState extends ConsumerState<ReminderFormScreen> {
  late final _title = TextEditingController(text: widget.existing?.title ?? '');
  late final _notes = TextEditingController(text: widget.existing?.notes ?? '');
  late DateTime _at = widget.existing?.remindAt ?? DateTime.now().copyWith(hour: 13, minute: 30, second: 0, millisecond: 0, microsecond: 0).add(DateTime.now().hour >= 13 ? const Duration(days: 1) : Duration.zero);
  late String _repeat = widget.existing?.repeat ?? 'NONE';
  late String? _studentId = widget.existing?.studentId;
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final body = {'title': _title.text.trim(), 'notes': _notes.text.trim(), 'remindAt': _at.toUtc().toIso8601String(), 'repeat': _repeat, 'studentId': _studentId};
      final e = widget.existing;
      if (e == null) {
        await ref.read(apiProvider).post<Json>('/reminders', body);
      } else {
        await ref.read(apiProvider).patch<Json>('/reminders/${e.id}', {...body, if (e.completedAt != null) 'completed': false});
      }
      ref.invalidate(remindersProvider);
      if (!mounted) return;
      toast(context, 'Reminder set for ${reminderWhen(_at)}');
      Navigator.pop(context);
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final kids = ref.watch(meProvider).children;
    return Scaffold(
      appBar: AppBar(title: Text(widget.existing == null ? 'New reminder' : 'Edit reminder')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(controller: _title, maxLength: 120, autofocus: widget.existing == null, onChanged: (_) => setState(() {}), textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Remind me to')),
        if (widget.existing == null)
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final p in _presets)
              ActionChip(
                label: Text(p),
                onPressed: () => setState(() {
                  _title.text = p;
                }),
              ),
          ]),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              icon: const Icon(Icons.event),
              label: Text(DateFormat('EEE, d MMM').format(_at)),
              onPressed: () async {
                final d = await showDatePicker(context: context, initialDate: _at.isBefore(DateTime.now()) ? DateTime.now() : _at, firstDate: DateTime.now().subtract(const Duration(days: 1)), lastDate: DateTime.now().add(const Duration(days: 365)));
                if (d != null) setState(() => _at = DateTime(d.year, d.month, d.day, _at.hour, _at.minute));
              },
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              icon: const Icon(Icons.schedule),
              label: Text(DateFormat('h:mm a').format(_at)),
              onPressed: () async {
                final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_at));
                if (t != null) setState(() => _at = DateTime(_at.year, _at.month, _at.day, t.hour, t.minute));
              },
            ),
          ),
        ]),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _repeat,
          decoration: const InputDecoration(labelText: 'Repeat'),
          items: [for (final e in reminderRepeatLabel.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
          onChanged: (v) => setState(() => _repeat = v!),
        ),
        if (kids.isNotEmpty) ...[
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            initialValue: _studentId,
            decoration: const InputDecoration(labelText: 'Child'),
            items: [const DropdownMenuItem(value: null, child: Text('—')), for (final k in kids) DropdownMenuItem(value: k.id, child: Text(k.firstName))],
            onChanged: (v) => setState(() => _studentId = v),
          ),
        ],
        const SizedBox(height: 12),
        TextField(controller: _notes, maxLength: 500, decoration: const InputDecoration(labelText: 'Note (shown in the alert)')),
        const SizedBox(height: 12),
        FilledButton.icon(onPressed: _busy || _title.text.trim().isEmpty ? null : _save, icon: const Icon(Icons.alarm_on), label: Text(_busy ? 'Saving…' : 'Set reminder')),
        const SizedBox(height: 8),
        Text('The reminder arrives as a notification at this time.', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
      ]),
    );
  }
}
