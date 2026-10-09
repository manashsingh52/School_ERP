import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_error.dart';
import '../../core/attendance_queue.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'teacher_data.dart';

/// Attendance register (docs/08 W3): everyone starts present, tap the exceptions, submit.
/// Works without a connection: the class list is kept from the last visit and the submission is
/// queued (it carries a clientMutationId, so sending it twice never double-counts).
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, required this.sectionId, required this.label});
  final String sectionId, label;
  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _date = today();
  AttendanceRegister? _register;
  final Map<String, String> _status = {};
  bool _offline = false;
  bool _busy = false;
  String? _error;

  String get _cacheKey => 'roster_${widget.sectionId}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final json = await ref.read(apiProvider).get<Json>('/sections/${widget.sectionId}/attendance', query: {'date': _date});
      (await SharedPreferences.getInstance()).setString(_cacheKey, jsonEncode(json));
      _apply(AttendanceRegister.fromJson(json), offline: false);
    } on ApiException catch (e) {
      final cached = e.isNetwork ? (await SharedPreferences.getInstance()).getString(_cacheKey) : null;
      if (cached != null) {
        final old = AttendanceRegister.fromJson(jsonDecode(cached) as Json);
        // Yesterday's marks don't carry over: same class list, fresh register.
        _apply(AttendanceRegister(sectionId: old.sectionId, label: old.label, date: _date, status: 'NOT_TAKEN', editable: true, isWeeklyOff: false, students: [for (final s in old.students) RegisterStudent(studentId: s.studentId, name: s.name, rollNo: s.rollNo, admissionNo: s.admissionNo)]), offline: true);
      } else if (mounted) {
        setState(() => _error = e.message);
      }
    }
  }

  void _apply(AttendanceRegister r, {required bool offline}) {
    if (!mounted) return;
    setState(() {
      _register = r;
      _offline = offline;
      _status
        ..clear()
        ..addEntries(r.students.map((s) => MapEntry(s.studentId, s.status ?? 'PRESENT')));
    });
  }

  void _cycle(String id) {
    const order = ['PRESENT', 'ABSENT', 'LATE'];
    final cur = _status[id] ?? 'PRESENT';
    setState(() => _status[id] = order[(order.indexOf(cur) + 1) % order.length]);
  }

  Future<void> _choose(RegisterStudent s) async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(s.name, style: Theme.of(ctx).textTheme.titleMedium)),
          for (final st in attendanceStatuses) ListTile(leading: Pill(attendanceLabel[st]!, tone: attendanceTone[st]!), selected: _status[s.studentId] == st, onTap: () => Navigator.pop(ctx, st)),
        ]),
      ),
    );
    if (picked != null) setState(() => _status[s.studentId] = picked);
  }

  Future<void> _submit() async {
    final r = _register!;
    setState(() => _busy = true);
    try {
      final outcome = await ref.read(attendanceQueueProvider.notifier).submit(
            sectionId: r.sectionId,
            label: r.label,
            date: _date,
            records: [for (final s in r.students) {'studentId': s.studentId, 'status': _status[s.studentId] ?? 'PRESENT'}],
          );
      ref.invalidate(teacherDashboard);
      ref.invalidate(markableSections);
      if (!mounted) return;
      toast(context, outcome == SubmitOutcome.sent ? 'Attendance submitted — parents of absent students are notified' : "You're offline — saved on this phone and will sync automatically");
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _register;
    final s = StatusColors.of(context);
    final absent = _status.values.where((x) => x == 'ABSENT').length;
    return Scaffold(
      appBar: AppBar(title: Text('${widget.label} · ${formatDay(_date)}')),
      body: _error != null
          ? ErrorView(message: _error!, onRetry: _load)
          : r == null
              ? const Center(child: CircularProgressIndicator())
              : Column(children: [
                  if (_offline) MaterialBanner(content: const Text("Offline — using the class list saved on this phone. Your register will sync when you're back online."), leading: const Icon(Icons.cloud_off), actions: [TextButton(onPressed: _load, child: const Text('Retry'))]),
                  if (r.status == 'SUBMITTED' && !_offline) MaterialBanner(content: Text(r.editable ? 'Already submitted. Changes are recorded.' : r.lockedReason ?? 'Locked.'), leading: const Icon(Icons.check_circle_outline), actions: const [SizedBox.shrink()]),
                  if (r.isWeeklyOff) const MaterialBanner(content: Text('Today is a weekly off.'), actions: [SizedBox.shrink()]),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Row(children: [
                      Expanded(child: Text('${r.students.length - absent} present · $absent absent', style: Theme.of(context).textTheme.titleSmall)),
                      TextButton(onPressed: r.editable ? () => setState(() => _status.updateAll((_, _) => 'PRESENT')) : null, child: const Text('Mark all present')),
                    ]),
                  ),
                  Expanded(
                    child: ListView.separated(
                      itemCount: r.students.length,
                      separatorBuilder: (_, _) => const Divider(),
                      itemBuilder: (_, i) {
                        final st = r.students[i];
                        final status = _status[st.studentId] ?? 'PRESENT';
                        return ListTile(
                          leading: CircleAvatar(backgroundColor: s.subtle, child: Text(st.rollNo?.toString() ?? '–', style: const TextStyle(fontSize: 13))),
                          title: Text(st.name),
                          subtitle: Text('Adm. ${st.admissionNo}'),
                          trailing: Pill(attendanceLabel[status]!, tone: attendanceTone[status]!),
                          onTap: r.editable ? () => _cycle(st.studentId) : null,
                          onLongPress: r.editable ? () => _choose(st) : null,
                        );
                      },
                    ),
                  ),
                  if (r.editable)
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          Text('Tap to switch present → absent → late; hold for more options.', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
                          const SizedBox(height: 8),
                          FilledButton(onPressed: _busy || r.students.isEmpty ? null : _submit, child: Text(_busy ? 'Submitting…' : 'Submit attendance')),
                        ]),
                      ),
                    ),
                ]),
    );
  }
}
