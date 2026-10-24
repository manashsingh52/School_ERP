import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../widgets/common.dart';
import '../parent/parent_data.dart';

final sessionsProvider = FutureProvider.autoDispose<List<SessionItem>>((ref) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/me/sessions');
  return rows.cast<Json>().map(SessionItem.fromJson).toList();
});

/// Profile (docs/06 §4–5): who I am, school and role switch, documents, devices, sign out.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    final mode = ref.watch(modeProvider);
    final child = ref.watch(childProvider);
    final session = ref.read(sessionProvider.notifier);
    return ListView(padding: const EdgeInsets.all(16), children: [
      Card(
        child: ListTile(
          leading: CircleAvatar(child: Text(me.user.name[0])),
          title: Text(me.user.name),
          subtitle: Text([me.user.phone, me.user.email, me.membership?.school.name].whereType<String>().join('\n')),
          isThreeLine: true,
        ),
      ),
      const SizedBox(height: 12),
      if (me.isParent && me.isTeacher)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: SegmentedButton<AppMode>(
              segments: const [ButtonSegment(value: AppMode.teacher, label: Text('Teacher'), icon: Icon(Icons.school_outlined)), ButtonSegment(value: AppMode.parent, label: Text('Parent'), icon: Icon(Icons.family_restroom))],
              selected: {mode},
              onSelectionChanged: (v) => ref.read(modeProvider.notifier).set(v.first),
            ),
          ),
        ),
      if (mode == AppMode.parent && child != null) ...[
        const SizedBox(height: 12),
        SectionCard(title: "${child.firstName}'s documents", child: _Documents(childId: child.id)),
      ],
      const SizedBox(height: 12),
      SectionCard(title: 'Signed-in devices', child: const _Sessions()),
      const SizedBox(height: 12),
      Card(
        child: Column(children: [
          if (me.memberships.length > 1) ListTile(leading: const Icon(Icons.swap_horiz), title: const Text('Switch school'), onTap: session.switchSchool),
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('Sign out'),
            onTap: () async {
              final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(title: const Text('Sign out of Bastaa?'), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out'))]));
              if (ok == true) await session.signOut();
            },
          ),
        ]),
      ),
      const SizedBox(height: 16),
      Text('Bastaa $appVersion', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
    ]);
  }
}

class _Documents extends ConsumerWidget {
  const _Documents({required this.childId});
  final String childId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final docs = ref.watch(childDocuments(childId));
    return AsyncView(
      value: docs,
      onRetry: () => ref.invalidate(childDocuments(childId)),
      builder: (list) => list.isEmpty
          ? const EmptyView(icon: Icons.folder_open, title: 'Nothing shared yet')
          : Column(children: [
              for (final d in list)
                ListTile(
                  leading: const Icon(Icons.description_outlined),
                  title: Text(d.title),
                  subtitle: Text(formatDate(d.createdAt)),
                  onTap: () => openLink(context, () async => (await ref.read(apiProvider).get<Json>('/documents/${d.id}/download'))['url'] as String),
                ),
            ]),
    );
  }
}

class _Sessions extends ConsumerWidget {
  const _Sessions();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(sessionsProvider);
    return AsyncView(
      value: list,
      onRetry: () => ref.invalidate(sessionsProvider),
      builder: (items) => Column(children: [
        for (final s in items)
          ListTile(
            leading: Icon(s.platform == 'WEB' ? Icons.laptop : Icons.smartphone),
            title: Text(s.deviceName ?? (s.platform == 'WEB' ? 'Web browser' : 'Phone')),
            subtitle: Text(s.current ? 'This device' : 'Last used ${timeAgo(s.lastUsedAt)}'),
            trailing: s.current
                ? null
                : TextButton(
                    onPressed: () async {
                      try {
                        await ref.read(apiProvider).delete<Object?>('/me/sessions/${s.id}');
                        ref.invalidate(sessionsProvider);
                      } catch (e) {
                        if (context.mounted) toast(context, errorText(e), error: true);
                      }
                    },
                    child: const Text('Sign out'),
                  ),
          ),
      ]),
    );
  }
}
