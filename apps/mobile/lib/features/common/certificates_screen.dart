import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/home_kit.dart';
import '../parent/parent_data.dart';
import '../teacher/teacher_data.dart';

const certificateGold = Color(0xFFC9962B);
const _positions = ['1st place', '2nd place', '3rd place', 'Winner', 'Runner-up', 'Special mention'];

final myCertificates = FutureProvider.autoDispose<List<Certificate>>((ref) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/certificates', query: {'mine': 'true', 'pageSize': 100});
  return rows.cast<Json>().map(Certificate.fromJson).toList();
});

/// Students of one section, for ticking who gets a certificate.
final sectionStudents = FutureProvider.autoDispose.family<List<({String id, String name, int? rollNo})>, String>((ref, sectionId) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/students', query: {'sectionId': sectionId, 'status': 'ACTIVE', 'pageSize': 100});
  return [
    for (final s in rows.cast<Json>()) (id: s['id'] as String, name: [s['firstName'], s['lastName']].whereType<String>().join(' '), rollNo: s['rollNo'] as int?),
  ];
});

/// Opened from a notification: the parent's Achievements, or a teacher's certificates.
class CertificatesScreen extends ConsumerWidget {
  const CertificatesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => ref.watch(modeProvider) == AppMode.parent ? const AchievementsScreen() : const TeacherCertificatesScreen();
}

/// A parent's view: every certificate the school has given the child, newest first.
class AchievementsScreen extends ConsumerWidget {
  const AchievementsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final child = ref.watch(childProvider);
    if (child == null) return Scaffold(appBar: AppBar(title: const Text('Achievements')), body: const EmptyView(icon: Icons.family_restroom, title: 'No children linked yet'));
    final certs = ref.watch(childCertificates(child.id));
    return Scaffold(
      appBar: AppBar(title: Text("${child.firstName}'s achievements")),
      body: AsyncView(
        value: certs,
        onRetry: () => ref.invalidate(childCertificates(child.id)),
        builder: (list) {
          final wins = list.where((c) => c.isAchievement).length;
          return Refreshable(
            onRefresh: () async => ref.invalidate(childCertificates(child.id)),
            children: [
              if (list.isEmpty)
                Card(child: EmptyView(icon: Icons.emoji_events_outlined, title: 'No certificates yet', subtitle: 'When ${child.firstName} takes part in or wins a competition, the certificate shows up here.'))
              else ...[
                _Summary(wins: wins, taken: list.length - wins),
                for (final c in list) CertificateCard(certificate: c),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.wins, required this.taken});
  final int wins, taken;

  @override
  Widget build(BuildContext context) {
    Widget cell(IconData icon, Color color, int n, String label) => Expanded(
          child: Row(children: [
            Icon(icon, color: color, size: 30),
            const SizedBox(width: 10),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$n', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              Text(label, style: TextStyle(color: StatusColors.of(context).muted, fontSize: 13)),
            ]),
          ]),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(children: [
          cell(Icons.emoji_events_rounded, certificateGold, wins, wins == 1 ? 'Prize' : 'Prizes'),
          cell(Icons.military_tech_rounded, FeatureColors.blue, taken, 'Took part'),
        ]),
      ),
    );
  }
}

/// One certificate; tap to open the PDF.
class CertificateCard extends ConsumerWidget {
  const CertificateCard({super.key, required this.certificate, this.showStudent = false, this.onLongPress});
  final Certificate certificate;
  final bool showStudent;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = certificate;
    return GestureDetector(
      onLongPress: onLongPress,
      child: AccentCard(
        accent: c.isAchievement ? certificateGold : FeatureColors.blue,
        title: showStudent ? '${c.studentName} · ${c.eventName}' : c.eventName,
        subtitle: [formatDate(c.eventDate), 'From ${c.issuedBy}', if (c.note != null) c.note!].join(' · '),
        chip: c.isAchievement ? c.position : 'Participation',
        chipIcon: c.isAchievement ? Icons.emoji_events_rounded : Icons.military_tech_rounded,
        trailing: const Icon(Icons.picture_as_pdf_outlined),
        onTap: () => openLink(context, () async => (await ref.read(apiProvider).get<Json>('/certificates/${c.id}/download'))['url'] as String),
      ),
    );
  }
}

/// A teacher's certificates (the ones they issued), and the button to issue more.
class TeacherCertificatesScreen extends ConsumerWidget {
  const TeacherCertificatesScreen({super.key});

  Future<void> _withdraw(BuildContext context, WidgetRef ref, Certificate c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw certificate?'),
        content: Text("${c.studentName}'s certificate for “${c.eventName}”. Parents will no longer see it."),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Withdraw'))],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(apiProvider).delete<Object?>('/certificates/${c.id}');
      ref.invalidate(myCertificates);
      if (context.mounted) toast(context, 'Certificate withdrawn');
    } catch (e) {
      if (context.mounted) toast(context, errorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final certs = ref.watch(myCertificates);
    return Scaffold(
      appBar: AppBar(title: const Text('Certificates')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const IssueCertificateScreen())),
        icon: const Icon(Icons.workspace_premium_rounded),
        label: const Text('Issue certificate'),
      ),
      body: AsyncView(
        value: certs,
        onRetry: () => ref.invalidate(myCertificates),
        builder: (list) => Refreshable(
          onRefresh: () async => ref.invalidate(myCertificates),
          children: [
            if (list.isEmpty)
              const Card(child: EmptyView(icon: Icons.workspace_premium_outlined, title: 'No certificates yet', subtitle: 'Issue one for a competition, sports day or any event — to one student or the whole team. Parents are told at once.'))
            else
              for (final c in list) CertificateCard(certificate: c, showStudent: true, onLongPress: c.canDelete ? () => _withdraw(context, ref, c) : null),
            const SizedBox(height: 64),
          ],
        ),
      ),
    );
  }
}

/// Issue: the type first, then the event, date, position (achievements) and who gets it.
class IssueCertificateScreen extends ConsumerStatefulWidget {
  const IssueCertificateScreen({super.key});
  @override
  ConsumerState<IssueCertificateScreen> createState() => _IssueCertificateScreenState();
}

class _IssueCertificateScreenState extends ConsumerState<IssueCertificateScreen> {
  String? _kind;
  final _event = TextEditingController();
  final _position = TextEditingController();
  final _note = TextEditingController();
  DateTime _date = DateTime.now();
  String? _sectionId;
  final _picked = <String>{};
  bool _busy = false;

  @override
  void dispose() {
    _event.dispose();
    _position.dispose();
    _note.dispose();
    super.dispose();
  }

  bool get _ready => _event.text.trim().length >= 2 && _picked.isNotEmpty && (_kind != 'ACHIEVEMENT' || _position.text.trim().isNotEmpty);

  Future<void> _issue() async {
    setState(() => _busy = true);
    try {
      final rows = await ref.read(apiProvider).post<List<dynamic>>('/certificates', {
        'kind': _kind,
        'eventName': _event.text.trim(),
        'eventDate': isoDate(_date),
        if (_kind == 'ACHIEVEMENT') 'position': _position.text.trim(),
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        'studentIds': _picked.toList(),
      });
      ref.invalidate(myCertificates);
      if (!mounted) return;
      toast(context, rows.length == 1 ? 'Certificate issued · parents will be told' : '${rows.length} certificates issued · parents will be told');
      Navigator.pop(context);
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_kind == null) return _chooseKind(context);
    final sections = ref.watch(markableSections);
    return Scaffold(
      appBar: AppBar(
        title: Text(_kind == 'ACHIEVEMENT' ? 'Achievement certificate' : 'Participation certificate'),
        leading: BackButton(onPressed: () => setState(() => _kind = null)),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton.icon(
            onPressed: _busy || !_ready ? null : _issue,
            icon: const Icon(Icons.workspace_premium_rounded),
            label: Text(_picked.length > 1 ? 'Issue ${_picked.length} certificates' : 'Issue certificate'),
          ),
        ),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(controller: _event, maxLength: 120, autofocus: true, onChanged: (_) => setState(() {}), textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Competition or event', hintText: 'e.g. Inter-school Science Quiz')),
        OutlinedButton.icon(
          icon: const Icon(Icons.event),
          label: Text('Held on ${DateFormat('EEE, d MMM yyyy').format(_date)}'),
          onPressed: () async {
            final d = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime.now().subtract(const Duration(days: 365)), lastDate: DateTime.now().add(const Duration(days: 30)));
            if (d != null) setState(() => _date = d);
          },
        ),
        if (_kind == 'ACHIEVEMENT') ...[
          const SizedBox(height: 16),
          TextField(controller: _position, maxLength: 40, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Position', hintText: 'e.g. 1st place')),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final p in _positions) ChoiceChip(label: Text(p), selected: _position.text == p, onSelected: (_) => setState(() => _position.text = p)),
          ]),
        ],
        const SizedBox(height: 16),
        TextField(controller: _note, maxLength: 160, decoration: const InputDecoration(labelText: 'Extra line (optional)', hintText: 'e.g. District level, organised by …')),
        const SizedBox(height: 8),
        AsyncView(
          value: sections,
          onRetry: () => ref.invalidate(markableSections),
          builder: (list) {
            if (list.isEmpty) return const EmptyView(icon: Icons.groups_outlined, title: 'No classes', subtitle: 'You can issue certificates to students of the classes you teach.');
            final sectionId = _sectionId ?? list.first.sectionId;
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              DropdownButtonFormField<String>(
                initialValue: sectionId,
                decoration: const InputDecoration(labelText: 'Class'),
                items: [for (final s in list) DropdownMenuItem(value: s.sectionId, child: Text(s.label))],
                onChanged: (v) => setState(() {
                  _sectionId = v;
                  _picked.clear();
                }),
              ),
              const SizedBox(height: 8),
              _Roster(sectionId: sectionId, picked: _picked, onChanged: () => setState(() {})),
            ]);
          },
        ),
      ]),
    );
  }

  Widget _chooseKind(BuildContext context) {
    Widget option(String kind, IconData icon, Color color, String title, String text) => Card(
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => setState(() => _kind = kind),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(children: [
                Icon(icon, size: 40, color: color),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(text, style: TextStyle(color: StatusColors.of(context).muted)),
                  ]),
                ),
                const Icon(Icons.chevron_right),
              ]),
            ),
          ),
        );
    return Scaffold(
      appBar: AppBar(title: const Text('Issue a certificate')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('What is it for?', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        option('PARTICIPATION', Icons.military_tech_rounded, FeatureColors.blue, 'Participation', 'For taking part in a competition, event or activity.'),
        const SizedBox(height: 8),
        option('ACHIEVEMENT', Icons.emoji_events_rounded, certificateGold, 'Achievement', 'For a position or prize: 1st place, winner, runner-up…'),
      ]),
    );
  }
}

class _Roster extends ConsumerWidget {
  const _Roster({required this.sectionId, required this.picked, required this.onChanged});
  final String sectionId;
  final Set<String> picked;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncView(
      value: ref.watch(sectionStudents(sectionId)),
      onRetry: () => ref.invalidate(sectionStudents(sectionId)),
      builder: (students) {
        if (students.isEmpty) return const EmptyView(icon: Icons.person_off_outlined, title: 'No students in this class');
        final all = students.every((s) => picked.contains(s.id));
        return Card(
          child: Column(children: [
            CheckboxListTile(
              value: all,
              title: Text('Select all (${students.length})', style: const TextStyle(fontWeight: FontWeight.w600)),
              onChanged: (v) {
                if (v == true) {
                  picked.addAll(students.map((s) => s.id));
                } else {
                  picked.clear();
                }
                onChanged();
              },
            ),
            const Divider(height: 1),
            for (final s in students)
              CheckboxListTile(
                value: picked.contains(s.id),
                title: Text(s.rollNo == null ? s.name : '${s.rollNo}. ${s.name}'),
                onChanged: (v) {
                  if (v == true) {
                    picked.add(s.id);
                  } else {
                    picked.remove(s.id);
                  }
                  onChanged();
                },
              ),
          ]),
        );
      },
    );
  }
}
