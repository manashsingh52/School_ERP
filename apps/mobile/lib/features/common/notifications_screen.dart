import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../widgets/common.dart';

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/notifications', query: {'limit': 50});
  return rows.cast<Json>().map(AppNotification.fromJson).toList();
});

final unreadCountProvider = FutureProvider.autoDispose<int>((ref) async {
  final res = await ref.read(apiProvider).get<Object?>('/notifications/unread-count');
  return res is Map ? ((res['count'] as num?)?.toInt() ?? 0) : ((res as num?)?.toInt() ?? 0);
});

const _icons = {
  'attendance.absent': Icons.event_busy_outlined,
  'homework.published': Icons.menu_book_outlined,
  'results.published': Icons.emoji_events_outlined,
  'fee.due': Icons.currency_rupee,
  'fee.overdue': Icons.currency_rupee,
  'payment.received': Icons.receipt_long_outlined,
  'notice.published': Icons.campaign_outlined,
};

/// Inbox (docs/06 §4): tapping opens the screen the notification is about.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key, required this.onOpenRoute});
  final void Function(String route) onOpenRoute;
  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  String _filter = 'all';

  bool _matches(AppNotification n) => switch (_filter) {
        'notices' => n.event.startsWith('notice'),
        'fees' => n.event.startsWith('fee') || n.event.startsWith('payment') || n.event.startsWith('refund'),
        'academics' => n.event.startsWith('attendance') || n.event.startsWith('homework') || n.event.startsWith('results') || n.event.startsWith('exam'),
        _ => true,
      };

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(notificationsProvider);
    final api = ref.read(apiProvider);
    return Column(children: [
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Row(children: [
          for (final (k, l) in [('all', 'All'), ('notices', 'Notices'), ('fees', 'Fees'), ('academics', 'Academics')])
            Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(l), selected: _filter == k, onSelected: (_) => setState(() => _filter = k))),
          TextButton(
            onPressed: () async {
              await api.post<Object?>('/notifications/read-all');
              ref.invalidate(notificationsProvider);
              ref.invalidate(unreadCountProvider);
            },
            child: const Text('Mark all read'),
          ),
        ]),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(notificationsProvider);
            ref.invalidate(unreadCountProvider);
          },
          child: AsyncView(
            value: list,
            onRetry: () => ref.invalidate(notificationsProvider),
            builder: (items) {
              final shown = items.where(_matches).toList();
              if (shown.isEmpty) return ListView(children: const [EmptyView(icon: Icons.notifications_none, title: "You're all caught up")]);
              return ListView.separated(
                itemCount: shown.length,
                separatorBuilder: (_, _) => const Divider(),
                itemBuilder: (_, i) {
                  final n = shown[i];
                  final unread = n.readAt == null;
                  return ListTile(
                    leading: Icon(_icons[n.event] ?? Icons.notifications_none, color: unread ? Theme.of(context).colorScheme.primary : null),
                    title: Text(n.title, style: TextStyle(fontWeight: unread ? FontWeight.w600 : FontWeight.normal)),
                    subtitle: Text('${n.body}\n${timeAgo(n.createdAt)}', maxLines: 3, overflow: TextOverflow.ellipsis),
                    isThreeLine: true,
                    onTap: () async {
                      if (unread) {
                        setState(() => n.readAt = DateTime.now().toIso8601String());
                        api.post<Object?>('/notifications/${n.id}/read').then((_) => ref.invalidate(unreadCountProvider), onError: (_) {});
                      }
                      if (n.route != null) widget.onOpenRoute(n.route!);
                    },
                  );
                },
              );
            },
          ),
        ),
      ),
    ]);
  }
}
