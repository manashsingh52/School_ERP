import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session.dart';

/// "Rahul · 8-A ▾" in the header; hidden when there's one child (docs/06 §4).
class ChildChip extends ConsumerWidget {
  const ChildChip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final children = ref.watch(meProvider).children;
    final child = ref.watch(childProvider);
    if (child == null) return const SizedBox.shrink();
    final label = Text([child.firstName, child.classLabel].whereType<String>().join(' · '));
    if (children.length < 2) return Padding(padding: const EdgeInsets.only(right: 16), child: Center(child: label));
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: PopupMenuButton<String>(
        tooltip: 'Choose child',
        onSelected: (id) => ref.read(childProvider.notifier).select(children.firstWhere((c) => c.id == id)),
        itemBuilder: (_) => [for (final c in children) PopupMenuItem(value: c.id, child: Text([c.name, c.classLabel].whereType<String>().join(' · ')))],
        child: Chip(label: label, avatar: const Icon(Icons.expand_more, size: 18)),
      ),
    );
  }
}
