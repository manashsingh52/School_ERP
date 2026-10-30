import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/home_kit.dart';

final studentCard = FutureProvider.autoDispose.family<StudentCard, String>((ref, id) async => StudentCard.fromJson(await ref.read(apiProvider).get<Json>('/students/$id')));

/// "2026–27" for the school year running April to March.
String schoolYear(DateTime now) {
  final start = now.month >= 4 ? now.year : now.year - 1;
  return '$start–${(start + 1) % 100}';
}

const _relation = {'FATHER': 'Father', 'MOTHER': 'Mother'};

/// "+919000000005" → "+91 90000 00005", easier to read out at the gate.
String _phone(String? p) => p != null && RegExp(r'^\+91\d{10}$').hasMatch(p) ? '+91 ${p.substring(3, 8)} ${p.substring(8)}' : p ?? '';

/// A child's digital ID card, to show at the school gate at pick-up.
class IdCardScreen extends ConsumerWidget {
  const IdCardScreen({super.key, required this.child});
  final Child child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final card = ref.watch(studentCard(child.id));
    final school = ref.watch(meProvider).membership?.school;
    return Scaffold(
      appBar: AppBar(title: Text(tr('Student ID card'))),
      body: AsyncView(
        value: card,
        onRetry: () => ref.invalidate(studentCard(child.id)),
        builder: (c) => Refreshable(
          onRefresh: () async => ref.invalidate(studentCard(child.id)),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 360),
                child: _IdCard(card: c, schoolName: school?.name ?? '', accent: parseHex(school?.accentColor), classLabel: child.classLabel),
              ),
            ),
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 360),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Icon(Icons.verified_user_outlined, color: Theme.of(context).colorScheme.primary),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(tr('Show this card at the school gate when you pick up {name}. Turn up the screen brightness so the guard can read it.', {'name': c.firstName}), style: const TextStyle(height: 1.4)),
                          const SizedBox(height: 6),
                          Text(tr('If anything here is wrong, tell the school office.'), style: TextStyle(color: StatusColors.of(context).muted, fontSize: 13)),
                        ]),
                      ),
                    ]),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IdCard extends StatelessWidget {
  const _IdCard({required this.card, required this.schoolName, required this.accent, this.classLabel});
  final StudentCard card;
  final String schoolName;
  final Color accent;
  final String? classLabel;

  @override
  Widget build(BuildContext context) {
    // Printed-card look: always light, whatever the phone's theme.
    const ink = Color(0xFF18181B), muted = Color(0xFF71717A), line = Color(0xFFE4E4E7);
    final hsl = HSLColor.fromColor(accent);
    final deep = hsl.withLightness((hsl.lightness - 0.08).clamp(0.0, 1.0)).toColor();
    final cls = classLabel ?? [card.className?.replaceFirst('Class ', ''), card.sectionName].whereType<String>().join('-');
    final guardian = card.primaryGuardian;

    Widget field(String label, String? value, {Color? color}) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr(label).toUpperCase(), style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, letterSpacing: 0.6, color: muted)),
          const SizedBox(height: 3),
          Text(value == null || value.isEmpty ? '—' : value, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: color ?? ink)),
        ]);

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: line),
        boxShadow: [BoxShadow(color: accent.withValues(alpha: 0.22), blurRadius: 30, offset: const Offset(0, 14))],
      ),
      child: Column(children: [
        // School band, with the photo sitting on its edge.
        Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
          Container(
            height: 132,
            width: double.infinity,
            decoration: BoxDecoration(gradient: LinearGradient(colors: [accent, deep], begin: Alignment.topLeft, end: Alignment.bottomRight)),
            child: Stack(children: [
              Positioned(right: -30, top: -40, child: _Ring(size: 140, color: Colors.white.withValues(alpha: 0.10))),
              Positioned(left: -20, bottom: -50, child: _Ring(size: 110, color: Colors.white.withValues(alpha: 0.07))),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(11)),
                    child: Text(initials(schoolName), style: TextStyle(color: accent, fontWeight: FontWeight.w800, fontSize: 15)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(schoolName, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16, height: 1.2)),
                      const SizedBox(height: 4),
                      Text(tr('STUDENT IDENTITY CARD'), style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 10.5, fontWeight: FontWeight.w600, letterSpacing: 1.2)),
                    ]),
                  ),
                ]),
              ),
            ]),
          ),
          Positioned(top: 82, child: _Photo(url: card.photoUrl, name: card.name, accent: accent)),
        ]),
        const SizedBox(height: 62),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          child: Text(card.name, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: ink, height: 1.2)),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(color: accent.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(999)),
          child: Text(
            [tr('Class {c}', {'c': cls.isEmpty ? '—' : cls}), if (card.rollNo != null) '${tr('Roll no.')} ${card.rollNo}'].join('  ·  '),
            style: TextStyle(color: accent, fontWeight: FontWeight.w700, fontSize: 13),
          ),
        ),
        const SizedBox(height: 18),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(children: [
            Row(children: [
              Expanded(child: field('Admission no.', card.admissionNo)),
              const SizedBox(width: 12),
              Expanded(child: field('Date of birth', card.dateOfBirth == null ? null : formatDate(card.dateOfBirth!))),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: field('Blood group', card.bloodGroup, color: const Color(0xFFB91C1C))),
              const SizedBox(width: 12),
              Expanded(child: field(_relation[guardian?.relation] ?? 'Parent', guardian?.name)),
            ]),
            const SizedBox(height: 14),
            Row(children: [Expanded(child: field('Parent phone', _phone(guardian?.phone)))]),
          ]),
        ),
        const SizedBox(height: 18),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          decoration: BoxDecoration(color: accent.withValues(alpha: 0.07), border: const Border(top: BorderSide(color: line))),
          child: Row(children: [
            Icon(Icons.event_available_rounded, size: 18, color: accent),
            const SizedBox(width: 8),
            Expanded(child: Text(tr('Valid for {year}', {'year': schoolYear(DateTime.now())}), style: const TextStyle(fontWeight: FontWeight.w600, color: ink, fontSize: 13))),
            Text(card.admissionNo, style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()], fontWeight: FontWeight.w700, color: muted, letterSpacing: 1.5)),
          ]),
        ),
      ]),
    );
  }
}

class _Photo extends StatelessWidget {
  const _Photo({required this.url, required this.name, required this.accent});
  final String? url;
  final String name;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(gradient: LinearGradient(colors: [accent.withValues(alpha: 0.85), accent], begin: Alignment.topLeft, end: Alignment.bottomRight)),
      child: Text(initials(name), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 34)),
    );
    return Container(
      width: 104,
      height: 104,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 14, offset: const Offset(0, 6))]),
      child: ClipOval(child: url == null ? fallback : Image.network(url!, fit: BoxFit.cover, errorBuilder: (_, _, _) => fallback)),
    );
  }
}

class _Ring extends StatelessWidget {
  const _Ring({required this.size, required this.color});
  final double size;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(width: size, height: size, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: color, width: 18)));
}
