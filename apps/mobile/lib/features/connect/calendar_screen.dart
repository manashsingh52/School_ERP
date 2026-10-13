import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/home_kit.dart';
import 'connect_data.dart';

/// One colour per kind of day, the same on every screen.
Color kindColor(String kind) => switch (kind) {
      'HOLIDAY' => FeatureColors.red,
      'VACATION' => FeatureColors.orange,
      'EXAM' => FeatureColors.purple,
      'PTM' => FeatureColors.green,
      'EVENT' => FeatureColors.blue,
      _ => FeatureColors.teal,
    };

IconData kindIcon(String kind) => switch (kind) {
      'HOLIDAY' => Icons.celebration_rounded,
      'VACATION' => Icons.beach_access_rounded,
      'EXAM' => Icons.edit_note_rounded,
      'PTM' => Icons.groups_rounded,
      'EVENT' => Icons.event_rounded,
      _ => Icons.push_pin_rounded,
    };

String _range(CalendarItem i) {
  final f = DateFormat('EEE, d MMM');
  final a = DateTime.parse(i.startDate), b = DateTime.parse(i.endDate);
  return i.startDate == i.endDate ? f.format(a) : '${f.format(a)} – ${f.format(b)}';
}

/// The school calendar: holidays and vacations, exams (with the child's papers), events and
/// parent–teacher meetings — a month at a time, plus what's coming up.
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});
  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  String? _picked;

  @override
  Widget build(BuildContext context) {
    final first = _month;
    final last = DateTime(first.year, first.month + 1, 0);
    final range = (isoDate(first), isoDate(last));
    final items = ref.watch(calendarProvider(range));
    final now = today();
    final upcoming = ref.watch(calendarProvider((now, isoDate(DateTime.now().add(const Duration(days: 120))))));
    final s = StatusColors.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Calendar')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(calendarProvider);
        },
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
          Row(children: [
            IconButton(tooltip: 'Previous month', onPressed: () => setState(() {
                  _month = DateTime(_month.year, _month.month - 1);
                  _picked = null;
                }), icon: const Icon(Icons.chevron_left)),
            Expanded(child: Text(DateFormat('MMMM yyyy').format(_month), textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700))),
            IconButton(tooltip: 'Next month', onPressed: () => setState(() {
                  _month = DateTime(_month.year, _month.month + 1);
                  _picked = null;
                }), icon: const Icon(Icons.chevron_right)),
          ]),
          Wrap(alignment: WrapAlignment.center, spacing: 12, runSpacing: 4, children: [
            for (final k in ['HOLIDAY', 'VACATION', 'EXAM', 'EVENT', 'PTM'])
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 9, height: 9, decoration: BoxDecoration(color: kindColor(k), shape: BoxShape.circle)),
                const SizedBox(width: 5),
                Text(calendarKindLabel[k]!.split(' ').first, style: Theme.of(context).textTheme.bodySmall),
              ]),
          ]),
          const SizedBox(height: 10),
          AsyncView(
            value: items,
            onRetry: () => ref.invalidate(calendarProvider(range)),
            builder: (list) {
              final lead = first.weekday - 1;
              final listed = _picked == null ? list.where((i) => i.source != 'PAPER').toList() : list.where((i) => i.covers(_picked!)).toList();
              return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Column(children: [
                      Row(children: [for (final d in ['M', 'T', 'W', 'T', 'F', 'S', 'S']) Expanded(child: Center(child: Text(d, style: Theme.of(context).textTheme.bodySmall)))]),
                      const SizedBox(height: 6),
                      GridView.count(
                        crossAxisCount: 7,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        childAspectRatio: 0.82,
                        children: [
                          for (var i = 0; i < lead; i++) const SizedBox.shrink(),
                          for (var d = 1; d <= last.day; d++)
                            Builder(builder: (context) {
                              final date = isoDate(DateTime(first.year, first.month, d));
                              final day = list.where((x) => x.covers(date)).toList();
                              final off = day.any((x) => x.isDayOff);
                              final sunday = DateTime(first.year, first.month, d).weekday == DateTime.sunday;
                              final isToday = date == now;
                              final selected = date == _picked;
                              return Semantics(
                                button: true,
                                label: '$d ${day.map((x) => x.title).join(', ')}',
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(10),
                                  onTap: () => setState(() => _picked = selected ? null : date),
                                  child: Container(
                                    margin: const EdgeInsets.all(2),
                                    decoration: BoxDecoration(
                                      color: off ? FeatureColors.red.withValues(alpha: 0.12) : null,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: selected ? scheme.primary : Colors.transparent, width: 1.5),
                                    ),
                                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                                      Container(
                                        width: 26,
                                        height: 26,
                                        alignment: Alignment.center,
                                        decoration: isToday ? BoxDecoration(color: scheme.primary, shape: BoxShape.circle) : null,
                                        child: Text('$d', style: TextStyle(fontWeight: isToday || off ? FontWeight.w700 : null, color: isToday ? scheme.onPrimary : off || sunday ? FeatureColors.red : null)),
                                      ),
                                      const SizedBox(height: 3),
                                      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                                        for (final x in day.take(3)) Container(width: 6, height: 6, margin: const EdgeInsets.symmetric(horizontal: 1), decoration: BoxDecoration(color: kindColor(x.kind), shape: BoxShape.circle)),
                                      ]),
                                    ]),
                                  ),
                                ),
                              );
                            }),
                        ],
                      ),
                    ]),
                  ),
                ),
                const SizedBox(height: 16),
                HomeSectionTitle(
                  title: _picked == null ? 'This month' : DateFormat('EEEE, d MMMM').format(DateTime.parse(_picked!)),
                  caption: _picked == null ? '${listed.length} on the calendar' : null,
                  action: _picked == null ? null : 'Whole month',
                  actionIcon: Icons.calendar_view_month_rounded,
                  onAction: () => setState(() => _picked = null),
                ),
                const SizedBox(height: 10),
                if (listed.isEmpty)
                  Card(
                    child: EmptyView(
                      icon: Icons.event_available_rounded,
                      title: _picked == null ? 'Nothing planned this month' : (DateTime.parse(_picked!).weekday == DateTime.sunday ? 'Sunday' : 'A regular school day'),
                    ),
                  )
                else
                  for (final i in listed) Padding(padding: const EdgeInsets.only(bottom: 10), child: CalendarEntryCard(item: i)),
              ]);
            },
          ),
          const SizedBox(height: 12),
          const HomeSectionTitle(title: 'Coming up', caption: 'Holidays, exams and meetings in the next four months'),
          const SizedBox(height: 10),
          AsyncView(
            value: upcoming,
            onRetry: () => ref.invalidate(calendarProvider),
            builder: (list) {
              final next = list.where((i) => i.source != 'PAPER' && i.kind != 'EVENT' && i.kind != 'OTHER').take(8).toList();
              if (next.isEmpty) return const Card(child: EmptyView(icon: Icons.event_available_rounded, title: 'Nothing planned yet'));
              return Card(
                child: Column(children: [
                  for (final i in next)
                    ListTile(
                      leading: Container(
                        width: 46,
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        decoration: BoxDecoration(color: kindColor(i.kind).withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          Text(DateFormat('MMM').format(DateTime.parse(i.startDate)).toUpperCase(), style: TextStyle(fontSize: 10, color: kindColor(i.kind), fontWeight: FontWeight.w600)),
                          Text(DateTime.parse(i.startDate).day.toString(), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: kindColor(i.kind))),
                        ]),
                      ),
                      title: Text(i.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text('${calendarKindLabel[i.kind]}${i.days > 1 ? ' · ${i.days} days' : ''} · ${_inDays(i.startDate)}', style: TextStyle(color: s.muted)),
                    ),
                ]),
              );
            },
          ),
        ]),
      ),
    );
  }

  String _inDays(String date) {
    final d = DateTime.parse(date).difference(DateTime.parse(today())).inDays;
    return d <= 0 ? 'today' : d == 1 ? 'tomorrow' : 'in $d days';
  }
}

/// A calendar entry with a coloured edge, its dates and who it's for.
class CalendarEntryCard extends StatelessWidget {
  const CalendarEntryCard({super.key, required this.item});
  final CalendarItem item;

  @override
  Widget build(BuildContext context) {
    final c = kindColor(item.kind);
    return AccentCard(
      accent: c,
      title: item.title,
      subtitle: [_range(item), if (item.time != null) item.time!, item.audience, if (item.description != null) item.description!].join(' · '),
      chip: item.source == 'PAPER' ? 'Exam paper' : '${calendarKindLabel[item.kind]}${item.days > 1 ? ' · ${item.days} days' : ''}',
      chipIcon: kindIcon(item.kind),
    );
  }
}
