import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'connect_data.dart';

/// Parent–teacher video meetings: upcoming with a Join button (opens Jitsi in the browser or the
/// Jitsi app), past and cancelled. Teachers can book, move and cancel.
class MeetingsScreen extends ConsumerWidget {
  const MeetingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canManage = ref.watch(meProvider).can('meeting.manage');
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(title: const Text('Meetings'), bottom: const TabBar(tabs: [Tab(text: 'Upcoming'), Tab(text: 'Past')])),
        floatingActionButton: canManage
            ? FloatingActionButton.extended(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const MeetingFormScreen())),
                icon: const Icon(Icons.video_call_outlined),
                label: const Text('Schedule'),
              )
            : null,
        body: const TabBarView(children: [_MeetingList(when: 'upcoming'), _MeetingList(when: 'past')]),
      ),
    );
  }
}

class _MeetingList extends ConsumerWidget {
  const _MeetingList({required this.when});
  final String when;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(meetingsProvider(when));
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(meetingsProvider(when)),
      child: AsyncView(
        value: list,
        onRetry: () => ref.invalidate(meetingsProvider(when)),
        builder: (items) => items.isEmpty
            ? ListView(children: [EmptyView(icon: Icons.videocam_outlined, title: when == 'upcoming' ? 'No meetings coming up' : 'No past meetings', subtitle: when == 'upcoming' ? 'When a meeting is booked you get a notification and it appears here.' : null)])
            : ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 88), children: [for (final m in items) Padding(padding: const EdgeInsets.only(bottom: 12), child: MeetingCard(m: m))]),
      ),
    );
  }
}

class MeetingCard extends ConsumerWidget {
  const MeetingCard({super.key, required this.m});
  final Meeting m;

  Future<void> _act(BuildContext context, WidgetRef ref, String action) async {
    try {
      if (action == 'cancel') {
        final reason = await showDialog<String>(context: context, builder: (_) => const _CancelDialog());
        if (reason == null) return;
        await ref.read(apiProvider).post<Json>('/meetings/${m.id}/cancel', {'reason': reason});
        if (context.mounted) toast(context, 'Cancelled — the parents have been told.');
      } else if (action == 'complete') {
        await ref.read(apiProvider).post<Json>('/meetings/${m.id}/complete');
      } else if (action == 'edit') {
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => MeetingFormScreen(existing: m)));
      }
      ref.invalidate(meetingsProvider);
    } catch (e) {
      if (context.mounted) toast(context, errorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = StatusColors.of(context);
    final end = m.scheduledAt.add(Duration(minutes: m.durationMinutes));
    final time = DateFormat('h:mm a');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 56,
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: BoxDecoration(color: (m.joinable ? s.success : Theme.of(context).colorScheme.primary).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
              child: Column(children: [
                Text(DateFormat('EEE').format(m.scheduledAt).toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                Text('${m.scheduledAt.day}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                Text(DateFormat('MMM').format(m.scheduledAt), style: const TextStyle(fontSize: 11)),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(m.title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('${time.format(m.scheduledAt)} – ${time.format(end)} · ${m.organizer.name}', style: Theme.of(context).textTheme.bodySmall),
                Text('About ${m.student.name}${m.student.classLabel == null ? '' : ' (${m.student.classLabel})'}', style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 6),
                Wrap(spacing: 6, children: [
                  Pill(switch (m.status) { 'CANCELLED' => 'Cancelled', 'COMPLETED' => 'Held', _ => 'Scheduled' }, tone: switch (m.status) { 'CANCELLED' => Tone.danger, 'COMPLETED' => Tone.success, _ => Tone.info }),
                  Pill(conversationCategoryLabel[m.category] ?? m.category),
                ]),
              ]),
            ),
            if (m.canManage)
              PopupMenuButton<String>(
                onSelected: (a) => _act(context, ref, a),
                itemBuilder: (_) => [
                  const PopupMenuItem(value: 'edit', child: Text('Reschedule or edit')),
                  if (m.scheduledAt.isBefore(DateTime.now())) const PopupMenuItem(value: 'complete', child: Text('Mark as held')),
                  const PopupMenuItem(value: 'cancel', child: Text('Cancel meeting')),
                ],
              ),
          ]),
          if (m.agenda != null) ...[const SizedBox(height: 10), Text(m.agenda!)],
          if (m.cancelReason != null) ...[const SizedBox(height: 8), Text('Reason: ${m.cancelReason}', style: TextStyle(color: s.danger))],
          if (m.joinUrl != null) ...[
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: m.joinable ? () => launchUrl(Uri.parse(m.joinUrl!), mode: LaunchMode.externalApplication) : null,
              icon: const Icon(Icons.videocam),
              label: Text(m.joinable ? 'Join video meeting' : 'Join opens 15 minutes before'),
            ),
          ],
        ]),
      ),
    );
  }
}

class _CancelDialog extends StatefulWidget {
  const _CancelDialog();
  @override
  State<_CancelDialog> createState() => _CancelDialogState();
}

class _CancelDialogState extends State<_CancelDialog> {
  final _reason = TextEditingController();
  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Cancel this meeting?'),
        content: TextField(controller: _reason, maxLength: 300, decoration: const InputDecoration(labelText: 'Reason (sent to the parents)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep it')),
          FilledButton(onPressed: () => Navigator.pop(context, _reason.text.trim()), child: const Text('Cancel meeting')),
        ],
      );
}

/// Book or reschedule (teachers). Parents are notified straight away.
class MeetingFormScreen extends ConsumerStatefulWidget {
  const MeetingFormScreen({super.key, this.existing});
  final Meeting? existing;
  @override
  ConsumerState<MeetingFormScreen> createState() => _MeetingFormScreenState();
}

class _MeetingFormScreenState extends ConsumerState<MeetingFormScreen> {
  late final _title = TextEditingController(text: widget.existing?.title ?? 'Parent–teacher meeting');
  late final _agenda = TextEditingController(text: widget.existing?.agenda ?? '');
  late String _category = widget.existing?.category ?? 'ACADEMIC';
  late DateTime _at = widget.existing?.scheduledAt ?? DateTime.now().add(const Duration(days: 1)).copyWith(hour: 16, minute: 0, second: 0, millisecond: 0, microsecond: 0);
  late int _duration = widget.existing?.durationMinutes ?? 30;
  StudentRef? _student;
  String _q = '';
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _agenda.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final body = {'title': _title.text.trim(), 'agenda': _agenda.text.trim(), 'category': _category, 'scheduledAt': _at.toUtc().toIso8601String(), 'durationMinutes': _duration};
      if (widget.existing != null) {
        await ref.read(apiProvider).patch<Json>('/meetings/${widget.existing!.id}', body);
      } else {
        await ref.read(apiProvider).post<Json>('/meetings', {...body, 'studentId': _student!.id});
      }
      ref.invalidate(meetingsProvider);
      if (!mounted) return;
      toast(context, widget.existing == null ? 'Booked — the parents have been notified.' : 'Saved — parents are told if the time changed.');
      Navigator.pop(context);
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.existing != null;
    return Scaffold(
      appBar: AppBar(title: Text(editing ? 'Reschedule' : 'Schedule a meeting')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (!editing) ...[
          if (_student == null) ...[
            TextField(decoration: const InputDecoration(labelText: "Student's name or admission no.", prefixIcon: Icon(Icons.search)), onChanged: (v) => setState(() => _q = v)),
            AsyncView(
              value: ref.watch(studentSearchProvider(_q)),
              builder: (rows) => Column(children: [for (final r in rows) ListTile(title: Text(r.name), subtitle: Text(r.classLabel ?? ''), onTap: () => setState(() => _student = r))]),
            ),
          ] else
            ListTile(contentPadding: EdgeInsets.zero, title: Text(_student!.name), subtitle: Text(_student!.classLabel ?? ''), trailing: TextButton(onPressed: () => setState(() => _student = null), child: const Text('Change'))),
          const SizedBox(height: 12),
        ],
        TextField(controller: _title, maxLength: 120, decoration: const InputDecoration(labelText: 'Title'), onChanged: (_) => setState(() {})),
        DropdownButtonFormField<String>(
          initialValue: _category,
          decoration: const InputDecoration(labelText: 'Topic'),
          items: [for (final c in conversationCategories) DropdownMenuItem(value: c, child: Text(conversationCategoryLabel[c]!))],
          onChanged: (v) => setState(() => _category = v!),
        ),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              icon: const Icon(Icons.event),
              label: Text(DateFormat('EEE, d MMM').format(_at)),
              onPressed: () async {
                final d = await showDatePicker(context: context, initialDate: _at, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)));
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
        DropdownButtonFormField<int>(
          initialValue: _duration,
          decoration: const InputDecoration(labelText: 'Length'),
          items: [for (final m in [15, 20, 30, 45, 60]) DropdownMenuItem(value: m, child: Text('$m minutes'))],
          onChanged: (v) => setState(() => _duration = v!),
        ),
        const SizedBox(height: 12),
        TextField(controller: _agenda, minLines: 2, maxLines: 5, maxLength: 1000, decoration: const InputDecoration(labelText: 'What to discuss (parents see this)', alignLabelWithHint: true)),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _busy || _title.text.trim().length < 3 || (!editing && _student == null) ? null : _save,
          child: Text(_busy ? 'Saving…' : editing ? 'Save' : 'Book and notify parents'),
        ),
      ]),
    );
  }
}
