import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Colour per feature, so every shortcut is recognisable at a glance (same in both themes).
class FeatureColors {
  static const blue = Color(0xFF3B82F6), orange = Color(0xFFF59E0B), red = Color(0xFFEF4444), purple = Color(0xFF8B5CF6);
  static const sky = Color(0xFF38BDF8), green = Color(0xFF22C55E), indigo = Color(0xFF6366F1), pink = Color(0xFFF43F5E), teal = Color(0xFF14B8A6);
}

String greetingFor(DateTime now) => now.hour < 12 ? 'Good Morning' : now.hour < 17 ? 'Good Afternoon' : 'Good Evening';

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  return (parts.first[0] + (parts.length > 1 ? parts.last[0] : '')).toUpperCase();
}

/// Round avatar with initials on a gradient made from the school colour.
class GradientAvatar extends StatelessWidget {
  const GradientAvatar({super.key, required this.name, this.size = 64});
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    final hsl = HSLColor.fromColor(accent);
    final second = hsl.withHue((hsl.hue + 40) % 360).withLightness(math.min(0.65, hsl.lightness + 0.12)).toColor();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(colors: [accent, second], begin: Alignment.topLeft, end: Alignment.bottomRight),
        boxShadow: [BoxShadow(color: accent.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Text(initials(name), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.36)),
    );
  }
}

/// "Good Evening / Name / Section …" with round icon actions on the right.
class HomeHeader extends StatelessWidget {
  const HomeHeader({super.key, required this.greeting, required this.name, required this.subtitle, required this.avatarName, this.onTapIdentity, this.actions = const []});
  final String greeting, name, subtitle, avatarName;
  final VoidCallback? onTapIdentity;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = StatusColors.of(context).muted;
    return Row(children: [
      Expanded(
        child: InkWell(
          onTap: onTapIdentity,
          borderRadius: BorderRadius.circular(16),
          child: Row(children: [
            GradientAvatar(name: avatarName),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(greeting, style: text.bodyMedium?.copyWith(color: muted)),
                Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: 0.2)),
                Row(children: [
                  Flexible(child: Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodyMedium?.copyWith(color: muted))),
                  if (onTapIdentity != null) Icon(Icons.expand_more, size: 18, color: muted),
                ]),
              ]),
            ),
          ]),
        ),
      ),
      ...actions,
    ]);
  }
}

class HeaderAction extends StatelessWidget {
  const HeaderAction({super.key, required this.icon, required this.tooltip, required this.onPressed, this.badge = 0});
  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;
  final int badge;

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: tooltip,
        onPressed: onPressed,
        iconSize: 28,
        icon: Badge(isLabelVisible: badge > 0, label: Text('$badge'), child: Icon(icon)),
      );
}

class Feature {
  const Feature(this.label, this.icon, this.color, this.onTap, {this.badge = 0});
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final int badge;
}

/// The big card under the header: two info lines and a headline number on top, then a grid of
/// colourful shortcuts (four per row, hairline separators).
class FeatureCard extends StatelessWidget {
  const FeatureCard({super.key, required this.lines, required this.metricLabel, required this.metricValue, this.metricColor, required this.features, this.onTapInfo});
  final List<(IconData, String)> lines;
  final String metricLabel, metricValue;
  final Color? metricColor;
  final List<Feature> features;
  final VoidCallback? onTapInfo;

  @override
  Widget build(BuildContext context) {
    final s = StatusColors.of(context);
    final text = Theme.of(context).textTheme;
    final rows = <List<Feature>>[for (var i = 0; i < features.length; i += 4) features.sublist(i, math.min(i + 4, features.length))];
    return Container(
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(24), border: Border.all(color: s.border)),
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 10),
      child: Column(children: [
        InkWell(
          onTap: onTapInfo,
          borderRadius: BorderRadius.circular(12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                for (final (icon, line) in lines)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(children: [
                      Icon(icon, size: 18, color: s.muted),
                      const SizedBox(width: 10),
                      Expanded(child: Text(line, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodyLarge?.copyWith(color: lines.first.$2 == line ? null : s.muted))),
                    ]),
                  ),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(metricLabel.toUpperCase(), style: text.labelMedium?.copyWith(color: s.muted, letterSpacing: 0.8)),
              Text(metricValue, style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, color: metricColor, height: 1.15)),
            ]),
          ]),
        ),
        const SizedBox(height: 6),
        Divider(color: s.border),
        for (var r = 0; r < rows.length; r++) ...[
          if (r > 0) Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Divider(color: s.border.withValues(alpha: 0.6))),
          IntrinsicHeight(
            child: Row(children: [
              for (var i = 0; i < 4; i++) ...[
                if (i > 0) VerticalDivider(width: 1, thickness: 1, indent: 10, endIndent: 10, color: s.border.withValues(alpha: 0.6)),
                Expanded(child: i < rows[r].length ? _FeatureTile(f: rows[r][i]) : const SizedBox.shrink()),
              ],
            ]),
          ),
        ],
      ]),
    );
  }
}

class _FeatureTile extends StatelessWidget {
  const _FeatureTile({required this.f});
  final Feature f;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: f.onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Badge(isLabelVisible: f.badge > 0, label: Text('${f.badge}'), child: Icon(f.icon, size: 34, color: f.color)),
            const SizedBox(height: 10),
            Text(f.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
          ]),
        ),
      );
}

/// Section title with a quiet caption and an optional action on the right ("Filter", "All").
class HomeSectionTitle extends StatelessWidget {
  const HomeSectionTitle({super.key, required this.title, this.caption, this.action, this.actionIcon, this.onAction});
  final String title;
  final String? caption, action;
  final IconData? actionIcon;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final muted = StatusColors.of(context).muted;
    return Padding(
      padding: const EdgeInsets.only(top: 8, left: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            if (caption != null) Text(caption!, style: TextStyle(color: muted)),
          ]),
        ),
        if (action != null)
          TextButton.icon(onPressed: onAction, icon: Icon(actionIcon ?? Icons.tune, size: 20, color: muted), label: Text(action!, style: TextStyle(color: muted, fontSize: 15))),
      ]),
    );
  }
}

/// A ring with a number in the middle and a small caption below ("72" over "18/25").
class ScoreRing extends StatelessWidget {
  const ScoreRing({super.key, required this.value, required this.center, this.caption, required this.color, this.size = 64});
  /// 0–1, or null for an empty ring.
  final double? value;
  final String center;
  final String? caption;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final s = StatusColors.of(context);
    return Column(mainAxisSize: MainAxisSize.min, children: [
      SizedBox(
        width: size,
        height: size,
        child: Stack(alignment: Alignment.center, children: [
          SizedBox.expand(child: CircularProgressIndicator(value: 1, strokeWidth: 6, color: s.subtle)),
          SizedBox.expand(child: CircularProgressIndicator(value: (value ?? 0).clamp(0, 1), strokeWidth: 6, color: color, strokeCap: StrokeCap.round)),
          Text(center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
        ]),
      ),
      if (caption != null) ...[const SizedBox(height: 6), Text(caption!, style: TextStyle(color: s.muted, fontWeight: FontWeight.w600))],
    ]);
  }
}

/// Card with a coloured edge on the left, a status chip, and a ring on the right.
class AccentCard extends StatelessWidget {
  const AccentCard({super.key, required this.accent, required this.title, required this.subtitle, this.chip, this.chipIcon, this.trailing, this.onTap});
  final Color accent;
  final String title, subtitle;
  final String? chip;
  final IconData? chipIcon;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final s = StatusColors.of(context);
    final text = Theme.of(context).textTheme;
    return Material(
      color: Theme.of(context).colorScheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: BorderSide(color: s.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(width: 5, color: accent),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 10, 16),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                      Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600, height: 1.25)),
                      const SizedBox(height: 6),
                      Text(subtitle, style: TextStyle(color: s.muted)),
                      if (chip != null) ...[
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(color: accent.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99), border: Border.all(color: accent.withValues(alpha: 0.35))),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            if (chipIcon != null) ...[Icon(chipIcon, size: 16, color: accent), const SizedBox(width: 6)],
                            Flexible(child: Text(chip!, style: TextStyle(color: accent, fontWeight: FontWeight.w600))),
                          ]),
                        ),
                      ],
                    ]),
                  ),
                  if (trailing != null) ...[const SizedBox(width: 10), trailing!],
                  if (onTap != null) Icon(Icons.chevron_right, color: s.muted),
                ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class PillNavItem {
  const PillNavItem(this.icon, this.selectedIcon, this.label, {this.badge = 0});
  final IconData icon, selectedIcon;
  final String label;
  final int badge;
}

/// Bottom bar: icons only, the current page in a pill with its name (labels stay available to
/// screen readers and as tooltips).
class PillNavBar extends StatelessWidget {
  const PillNavBar({super.key, required this.items, required this.selected, required this.onSelect});
  final List<PillNavItem> items;
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = StatusColors.of(context);
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: BoxDecoration(border: Border(top: BorderSide(color: s.border))),
          padding: const EdgeInsets.fromLTRB(8, 10, 8, 10),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
            for (var i = 0; i < items.length; i++)
              Tooltip(
                message: items[i].label,
                child: Semantics(
                  label: items[i].label,
                  selected: i == selected,
                  button: true,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(28),
                    onTap: () => onSelect(i),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      curve: Curves.easeOut,
                      padding: EdgeInsets.symmetric(horizontal: i == selected ? 20 : 14, vertical: 12),
                      decoration: BoxDecoration(color: i == selected ? s.subtle : Colors.transparent, borderRadius: BorderRadius.circular(28)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Badge(
                          isLabelVisible: items[i].badge > 0,
                          label: Text('${items[i].badge}'),
                          child: Icon(i == selected ? items[i].selectedIcon : items[i].icon, size: 27, color: i == selected ? scheme.onSurface : s.muted),
                        ),
                        if (i == selected) ...[const SizedBox(width: 8), Text(items[i].label, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15.5, color: scheme.onSurface))],
                      ]),
                    ),
                  ),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}
