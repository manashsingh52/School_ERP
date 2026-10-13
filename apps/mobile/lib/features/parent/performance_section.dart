import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/charts.dart';
import '../../widgets/common.dart';
import '../../widgets/home_kit.dart';
import '../connect/connect_data.dart';
import '../connect/messages_screen.dart';
import 'parent_data.dart';

Color pctColor(BuildContext context, double? p) {
  final s = StatusColors.of(context);
  return p == null
      ? s.muted
      : p >= 75
      ? s.success
      : p >= 50
      ? s.warning
      : s.danger;
}

String _n(double? v) => v == null
    ? '—'
    : (v % 1 == 0 ? v.toInt().toString() : v.toStringAsFixed(1));

/// Results tab, top: the performance radar (tap a subject), progress across exams, and every
/// subject opening into its unit tests and exams with the section average. Updated from the
/// server whenever results are computed or published.
class PerformanceSection extends ConsumerStatefulWidget {
  const PerformanceSection({super.key, required this.childId});
  final String childId;
  @override
  ConsumerState<PerformanceSection> createState() => _PerformanceSectionState();
}

class _PerformanceSectionState extends ConsumerState<PerformanceSection> {
  String? _open;

  @override
  Widget build(BuildContext context) {
    final perf = ref.watch(childPerformance(widget.childId));
    final teachers = ref.watch(meProvider).can('message.use') ? ref.watch(contactsProvider(widget.childId)).value : null;
    return AsyncView(
      value: perf,
      onRetry: () => ref.invalidate(childPerformance(widget.childId)),
      builder: (p) {
        if (p.exams.isEmpty) return const SizedBox.shrink();
        final s = StatusColors.of(context);
        final text = Theme.of(context).textTheme;
        final selected = p.subjects.indexWhere((x) => x.id == _open);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Performance Radar',
                                style: text.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Text(
                                p.subjects.length >= 3
                                    ? 'Tap points for details'
                                    : 'Average in each subject',
                                style: text.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: pctColor(
                              context,
                              p.overallPct,
                            ).withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(
                              color: pctColor(
                                context,
                                p.overallPct,
                              ).withValues(alpha: 0.4),
                            ),
                          ),
                          child: Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: percent(p.overallPct),
                                  style: TextStyle(
                                    color: pctColor(context, p.overallPct),
                                    fontWeight: FontWeight.w800,
                                    fontSize: 18,
                                  ),
                                ),
                                TextSpan(
                                  text: ' avg',
                                  style: TextStyle(
                                    color: pctColor(context, p.overallPct),
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (p.subjects.length >= 3)
                      RadarChart(
                        values: [
                          for (final x in p.subjects)
                            RadarValue(
                              x.name,
                              x.averagePct,
                              x.sectionAveragePct,
                            ),
                        ],
                        selected: selected >= 0 ? selected : null,
                        onSelect: (i) =>
                            setState(() => _open = p.subjects[i].id),
                      )
                    else
                      for (final x in p.subjects)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  Expanded(child: Text(x.name)),
                                  Text(
                                    percent(x.averagePct),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(99),
                                child: LinearProgressIndicator(
                                  value: (x.averagePct ?? 0) / 100,
                                  minHeight: 8,
                                  color: s.success,
                                  backgroundColor: s.subtle,
                                ),
                              ),
                            ],
                          ),
                        ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(width: 18, height: 3, color: s.success),
                        const SizedBox(width: 6),
                        Text('Your child', style: text.bodySmall),
                        const SizedBox(width: 16),
                        Text(
                          '- - -',
                          style: text.bodySmall?.copyWith(
                            color: s.muted,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text('Section average', style: text.bodySmall),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Chip(
                  avatar: const Icon(Icons.menu_book_outlined, size: 18),
                  label: Text('${p.subjects.length} subjects'),
                ),
                Chip(
                  avatar: const Icon(Icons.description_outlined, size: 18),
                  label: Text('${p.exams.length} exams'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            for (final x in p.subjects) ...[
              const SizedBox(height: 8),
              _SubjectCard(
                subject: x,
                teacher: teachers?.where((t) => t.subjects.contains(x.name)).firstOrNull,
                open: _open == x.id,
                onToggle: () =>
                    setState(() => _open = _open == x.id ? null : x.id),
              ),
            ],
            if (p.exams.length >= 2) ...[
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Progress across exams',
                        style: text.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        'Overall % in each test, oldest first',
                        style: text.bodySmall,
                      ),
                      const SizedBox(height: 12),
                      ProgressLine(
                        points: [
                          for (final e in p.exams)
                            ProgressValue(
                              e.name,
                              e.percentage,
                              e.sectionAveragePct,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _SubjectCard extends StatelessWidget {
  const _SubjectCard({
    required this.subject,
    required this.open,
    required this.onToggle,
    this.teacher,
  });
  final PerformanceSubject subject;
  /// Who teaches this subject to the child (for "Message").
  final MessageContact? teacher;
  final bool open;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final s = StatusColors.of(context);
    final text = Theme.of(context).textTheme;
    final trend = switch (subject.trend) {
      'up' => (Icons.trending_up, 'Improving', s.success),
      'down' => (Icons.trending_down, 'Dropped', s.danger),
      'steady' => (Icons.trending_flat, 'Steady', s.muted),
      _ => null,
    };
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          subject.name,
                          style: text.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Wrap(
                          spacing: 6,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Icon(
                              Icons.description_outlined,
                              size: 15,
                              color: s.muted,
                            ),
                            Text(
                              '${subject.exams.length} exam${subject.exams.length == 1 ? '' : 's'}',
                              style: text.bodySmall,
                            ),
                            Text('•', style: text.bodySmall),
                            Text(
                              percent(subject.averagePct),
                              style: TextStyle(
                                color: pctColor(context, subject.averagePct),
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (trend != null) ...[
                              Icon(trend.$1, size: 16, color: trend.$3),
                              Text(
                                trend.$2,
                                style: TextStyle(color: trend.$3, fontSize: 12),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                  AnimatedRotation(
                    turns: open ? 0.5 : 0,
                    duration: const Duration(milliseconds: 150),
                    child: Icon(Icons.expand_more, color: s.muted),
                  ),
                ],
              ),
            ),
          ),
          if (open) ...[
            const Divider(),
            for (final e in subject.exams)
              ListTile(
                dense: true,
                title: Text(e.examName),
                subtitle: Text(
                  e.sectionAveragePct == null
                      ? (e.grade == null ? '' : 'Grade ${e.grade}')
                      : '${e.grade == null ? '' : 'Grade ${e.grade} · '}Section ${percent(e.sectionAveragePct)}',
                ),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      e.exempt
                          ? 'Exempt'
                          : e.absent
                          ? 'Absent'
                          : '${_n(e.marks)} / ${_n(e.maxMarks)}',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: e.absent ? s.danger : null,
                      ),
                    ),
                    Text(
                      percent(e.percent),
                      style: TextStyle(
                        color: pctColor(context, e.percent),
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            if (subject.sectionAveragePct != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Text(
                  'Section average in ${subject.name}: ${percent(subject.sectionAveragePct)}',
                  style: text.bodySmall,
                ),
              ),
            if (teacher != null)
              ListTile(
                leading: GradientAvatar(name: teacher!.name, size: 36),
                title: Text(teacher!.name),
                subtitle: Text(teacher!.available ? '${subject.name} teacher' : '${subject.name} teacher · not on the app yet'),
                trailing: teacher!.available
                    ? FilledButton.tonal(
                        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => NewMessageScreen(toMemberId: teacher!.memberId, subject: 'About ${subject.name}', category: 'ACADEMIC'))),
                        child: const Text('Message'),
                      )
                    : null,
              ),
          ],
        ],
      ),
    );
  }
}
