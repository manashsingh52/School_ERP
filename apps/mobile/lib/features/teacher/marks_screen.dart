import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_error.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'teacher_data.dart';

/// Marks entry for one subject in one section (docs/06 §5): numeric keypad, Next moves down,
/// A = absent. Saves with the sheet's version; if someone else saved meanwhile, reload.
class MarksEntryScreen extends ConsumerStatefulWidget {
  const MarksEntryScreen({super.key, required this.sheet});
  final MarksSheetRef sheet;
  @override
  ConsumerState<MarksEntryScreen> createState() => _MarksEntryScreenState();
}

class _MarksEntryScreenState extends ConsumerState<MarksEntryScreen> {
  MarksSheet? _sheet;
  String? _error;
  bool _saving = false;
  bool _dirty = false;
  final Map<String, TextEditingController> _ctl = {};
  final Map<String, String?> _fieldError = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _ctl.values) {
      c.dispose();
    }
    super.dispose();
  }

  String _text(MarksRow r) => r.absent ? 'A' : r.exempt ? 'E' : r.marks == null ? '' : (r.marks! % 1 == 0 ? r.marks!.toInt().toString() : r.marks!.toString());

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final s = MarksSheet.fromJson(await ref.read(apiProvider).get<Json>('/exams/marks', query: {'examSubjectId': widget.sheet.examSubjectId, 'sectionId': widget.sheet.sectionId}));
      for (final r in s.students) {
        (_ctl[r.studentId] ??= TextEditingController()).text = _text(r);
      }
      setState(() {
        _sheet = s;
        _dirty = false;
        _fieldError.clear();
      });
    } catch (e) {
      setState(() => _error = errorText(e));
    }
  }

  /// "" → not entered, "A" → absent, "E" → exempt, number within 0…max.
  String? _validate(String raw, double max) {
    final t = raw.trim().toUpperCase();
    if (t.isEmpty || t == 'A' || t == 'E') return null;
    final n = double.tryParse(t);
    if (n == null) return 'Number, A or E';
    if (n < 0 || n > max) return '0–${max % 1 == 0 ? max.toInt() : max}';
    return null;
  }

  Future<void> _save() async {
    final s = _sheet!;
    final errors = {for (final r in s.students) r.studentId: _validate(_ctl[r.studentId]!.text, s.maxMarks)};
    setState(() => _fieldError
      ..clear()
      ..addAll(errors));
    if (errors.values.any((e) => e != null)) return;
    setState(() => _saving = true);
    try {
      final entries = [
        for (final r in s.students)
          () {
            final t = _ctl[r.studentId]!.text.trim().toUpperCase();
            return {'studentId': r.studentId, 'marks': t.isEmpty || t == 'A' || t == 'E' ? null : double.parse(t), 'absent': t == 'A', 'exempt': t == 'E'};
          }(),
      ];
      final saved = MarksSheet.fromJson(await ref.read(apiProvider).put<Json>('/exams/marks', {'examSubjectId': widget.sheet.examSubjectId, 'sectionId': widget.sheet.sectionId, 'version': s.version, 'entries': entries}));
      setState(() {
        _sheet = saved;
        _dirty = false;
      });
      ref.invalidate(myMarksSheets);
      if (mounted) toast(context, 'Marks saved');
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'VERSION_CONFLICT') {
        toast(context, 'Someone else saved these marks just now — reloading. Re-enter your changes.', error: true);
        await _load();
      } else {
        toast(context, e.message, error: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _sheet;
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final leave = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(title: const Text('Leave without saving?'), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Stay')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Leave'))]));
        if (leave == true && context.mounted) Navigator.of(context).pop();
      },
      child: Scaffold(
        appBar: AppBar(title: Text('${widget.sheet.subject} · ${widget.sheet.sectionLabel}')),
        body: _error != null
            ? ErrorView(message: _error!, onRetry: _load)
            : s == null
                ? const Center(child: CircularProgressIndicator())
                : Column(children: [
                    ListTile(
                      title: Text(s.examName),
                      subtitle: Text('Out of ${_n(s.maxMarks)} · pass ${_n(s.passMarks)} · A = absent, E = exempt'),
                    ),
                    if (!s.editable) MaterialBanner(content: Text(s.lockedReason ?? 'These marks are locked.'), leading: const Icon(Icons.lock_outline), actions: const [SizedBox.shrink()]),
                    const Divider(),
                    Expanded(
                      child: ListView.separated(
                        itemCount: s.students.length,
                        separatorBuilder: (_, _) => const Divider(),
                        itemBuilder: (_, i) {
                          final r = s.students[i];
                          final value = double.tryParse(_ctl[r.studentId]!.text);
                          final failing = value != null && value < s.passMarks;
                          return ListTile(
                            leading: SizedBox(width: 28, child: Text(r.rollNo?.toString() ?? '', style: Theme.of(context).textTheme.bodySmall)),
                            title: Text(r.name),
                            trailing: SizedBox(
                              width: 92,
                              child: TextField(
                                controller: _ctl[r.studentId],
                                enabled: s.editable,
                                textAlign: TextAlign.center,
                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.aAeE]'))],
                                textInputAction: i == s.students.length - 1 ? TextInputAction.done : TextInputAction.next,
                                style: TextStyle(fontWeight: FontWeight.w600, color: failing ? StatusColors.of(context).danger : null),
                                decoration: InputDecoration(isDense: true, errorText: _fieldError[r.studentId], errorMaxLines: 2),
                                onChanged: (_) => setState(() => _dirty = true),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    if (s.editable)
                      SafeArea(
                        top: false,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                          child: FilledButton(onPressed: _saving || !_dirty ? null : _save, child: Text(_saving ? 'Saving…' : 'Save marks')),
                        ),
                      ),
                  ]),
      ),
    );
  }
}

String _n(double v) => v % 1 == 0 ? v.toInt().toString() : v.toString();
