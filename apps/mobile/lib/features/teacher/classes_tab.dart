import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../widgets/common.dart';
import '../parent/parent_home.dart' show showHomework;
import 'marks_screen.dart';
import 'teacher_data.dart';

/// Classes tab (docs/06 §5): homework I set (and new homework), and marks entry.
class ClassesTab extends ConsumerWidget {
  const ClassesTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: const TabBar(tabs: [Tab(text: 'Homework'), Tab(text: 'Marks')]),
        floatingActionButton: me.can('homework.manage')
            ? FloatingActionButton.extended(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const HomeworkCreateScreen(), fullscreenDialog: true)),
                icon: const Icon(Icons.add),
                label: const Text('Homework'),
              )
            : null,
        body: const TabBarView(children: [_MyHomework(), _MarksList()]),
      ),
    );
  }
}

class _MyHomework extends ConsumerWidget {
  const _MyHomework();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(myHomework);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(myHomework),
      child: AsyncView(
        value: list,
        onRetry: () => ref.invalidate(myHomework),
        builder: (items) => items.isEmpty
            ? ListView(children: const [EmptyView(icon: Icons.menu_book_outlined, title: 'No homework set yet')])
            : ListView.separated(
                padding: const EdgeInsets.only(bottom: 88),
                itemCount: items.length,
                separatorBuilder: (_, _) => const Divider(),
                itemBuilder: (_, i) {
                  final h = items[i];
                  return ListTile(
                    title: Text(h.title),
                    subtitle: Text([h.subject, h.sections.join(', '), if (h.dueDate != null) 'due ${formatDay(h.dueDate!)}'].join(' · ')),
                    trailing: h.status == 'PUBLISHED' ? null : Pill(h.status == 'DRAFT' ? 'Draft' : 'Scheduled', tone: Tone.info),
                    onTap: () => showHomework(context, h),
                  );
                },
              ),
      ),
    );
  }
}

class _MarksList extends ConsumerWidget {
  const _MarksList();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sheets = ref.watch(myMarksSheets);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(myMarksSheets),
      child: AsyncView(
        value: sheets,
        onRetry: () => ref.invalidate(myMarksSheets),
        builder: (list) => list.isEmpty
            ? ListView(children: const [EmptyView(icon: Icons.edit_note, title: 'No marks to enter', subtitle: 'Sheets appear here when an exam opens for marks entry.')])
            : ListView.separated(
                itemCount: list.length,
                separatorBuilder: (_, _) => const Divider(),
                itemBuilder: (_, i) {
                  final s = list[i];
                  final done = s.entered >= s.total && s.total > 0;
                  return ListTile(
                    title: Text('${s.subject} · ${s.sectionLabel}'),
                    subtitle: Text('${s.examName} · ${s.entered} of ${s.total}'),
                    trailing: done ? const Pill('Done', tone: Tone.success) : const Icon(Icons.chevron_right),
                    onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => MarksEntryScreen(sheet: s))),
                  );
                },
              ),
      ),
    );
  }
}

/// Set homework: subject, sections, due date, photos from the camera or gallery (up to 5).
class HomeworkCreateScreen extends ConsumerStatefulWidget {
  const HomeworkCreateScreen({super.key});
  @override
  ConsumerState<HomeworkCreateScreen> createState() => _HomeworkCreateScreenState();
}

class _HomeworkCreateScreenState extends ConsumerState<HomeworkCreateScreen> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  String? _subjectId;
  final Set<String> _sections = {};
  DateTime? _due;
  final List<XFile> _photos = [];
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _addPhoto(ImageSource source) async {
    final f = await ImagePicker().pickImage(source: source, maxWidth: 2000, imageQuality: 80);
    if (f != null) setState(() => _photos.add(f));
  }

  Future<String> _upload(XFile f) async {
    final api = ref.read(apiProvider);
    final bytes = await f.readAsBytes();
    final mime = f.mimeType ?? (f.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    final ticket = await api.post<Json>('/files/upload-url', {'purpose': 'homework_attachment', 'fileName': f.name, 'mimeType': mime, 'sizeBytes': bytes.length});
    final upload = ticket['upload'] as Json;
    await api.upload(upload['url'] as String, (upload['headers'] as Map).cast<String, String>(), bytes);
    await api.post<Object?>('/files/${ticket['fileId']}/complete');
    return ticket['fileId'] as String;
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final ids = <String>[for (final p in _photos) await _upload(p)];
      await ref.read(apiProvider).post<Object?>('/homework', {
        'subjectId': _subjectId,
        'sectionIds': _sections.toList(),
        'title': _title.text.trim(),
        if (_description.text.trim().isNotEmpty) 'description': _description.text.trim(),
        if (_due != null) 'dueDate': isoDate(_due!),
        'attachmentFileIds': ids,
        'publish': 'NOW',
      });
      ref.invalidate(myHomework);
      if (!mounted) return;
      toast(context, 'Homework posted — parents are notified');
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final targets = ref.watch(homeworkTargets);
    return Scaffold(
      appBar: AppBar(title: const Text('New homework')),
      body: AsyncView(
        value: targets,
        onRetry: () => ref.invalidate(homeworkTargets),
        builder: (sections) {
          final subjects = {for (final s in sections) for (final x in s.subjects) x.id: x.name};
          // Only sections where the chosen subject is taught (by me).
          final allowed = sections.where((s) => _subjectId == null || s.subjects.any((x) => x.id == _subjectId)).toList();
          return ListView(padding: const EdgeInsets.all(16), children: [
            DropdownButtonFormField<String>(
              initialValue: _subjectId,
              decoration: const InputDecoration(labelText: 'Subject'),
              items: [for (final e in subjects.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
              onChanged: (v) => setState(() {
                _subjectId = v;
                _sections.removeWhere((id) => !sections.any((s) => s.id == id && s.subjects.any((x) => x.id == v)));
              }),
            ),
            const SizedBox(height: 12),
            Text('Sections', style: Theme.of(context).textTheme.bodySmall),
            Wrap(spacing: 8, children: [
              for (final s in allowed) FilterChip(label: Text(s.label), selected: _sections.contains(s.id), onSelected: (v) => setState(() => v ? _sections.add(s.id) : _sections.remove(s.id))),
            ]),
            const SizedBox(height: 12),
            TextField(controller: _title, maxLength: 200, decoration: const InputDecoration(labelText: 'Title', counterText: ''), onChanged: (_) => setState(() {})),
            const SizedBox(height: 12),
            TextField(controller: _description, minLines: 3, maxLines: 8, decoration: const InputDecoration(labelText: 'Details (optional)')),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event),
              title: Text(_due == null ? 'No due date' : 'Due ${formatDate(isoDate(_due!))}'),
              trailing: TextButton(
                onPressed: () async {
                  final d = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 120)), initialDate: _due ?? DateTime.now().add(const Duration(days: 1)));
                  if (d != null) setState(() => _due = d);
                },
                child: const Text('Choose'),
              ),
            ),
            const Divider(),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final (i, p) in _photos.indexed) InputChip(label: Text(p.name, overflow: TextOverflow.ellipsis), avatar: const Icon(Icons.image_outlined), onDeleted: () => setState(() => _photos.removeAt(i))),
              if (_photos.length < 5) ...[
                ActionChip(avatar: const Icon(Icons.photo_camera_outlined), label: const Text('Camera'), onPressed: () => _addPhoto(ImageSource.camera)),
                ActionChip(avatar: const Icon(Icons.photo_library_outlined), label: const Text('Gallery'), onPressed: () => _addPhoto(ImageSource.gallery)),
              ],
            ]),
            const SizedBox(height: 24),
            FilledButton(onPressed: _busy || _subjectId == null || _sections.isEmpty || _title.text.trim().isEmpty ? null : _save, child: Text(_busy ? 'Posting…' : 'Post homework')),
          ]);
        },
      ),
    );
  }
}
