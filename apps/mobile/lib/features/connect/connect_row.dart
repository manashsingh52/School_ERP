import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session.dart';
import 'connect_data.dart';
import 'meetings_screen.dart';
import 'messages_screen.dart';
import 'reminders_screen.dart';

/// Opens the screen a notification's route points to (messages, meetings, reminders). True if handled.
bool openConnectRoute(BuildContext context, String route) {
  final Widget? screen = route.startsWith('/messages/')
      ? ThreadScreen(id: route.substring('/messages/'.length))
      : route.startsWith('/messages')
          ? const MessagesScreen()
          : route.startsWith('/meetings')
              ? const MeetingsScreen()
              : route.startsWith('/reminders')
                  ? const RemindersScreen()
                  : null;
  if (screen == null) return false;
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  return true;
}

/// Messages · Meetings · Reminders, on both home screens.
class ConnectRow extends ConsumerWidget {
  const ConnectRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    final unread = ref.watch(unreadMessagesProvider).value ?? 0;
    final next = me.can('meeting.view') ? ref.watch(meetingsProvider('upcoming')).value : null;
    Widget tile(IconData icon, String label, Widget screen, {int badge = 0, String? hint}) => Expanded(
          child: Card(
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () async {
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
                ref.invalidate(unreadMessagesProvider);
                ref.invalidate(meetingsProvider);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
                child: Column(children: [
                  Badge(isLabelVisible: badge > 0, label: Text('$badge'), child: Icon(icon, color: Theme.of(context).colorScheme.primary)),
                  const SizedBox(height: 6),
                  Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
                  // Always a second line, so the three tiles are the same height.
                  Text(hint ?? ' ', style: Theme.of(context).textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                ]),
              ),
            ),
          ),
        );
    return Row(children: [
      if (me.can('message.use')) tile(Icons.forum_outlined, 'Messages', const MessagesScreen(), badge: unread, hint: unread > 0 ? '$unread new' : null),
      if (me.can('meeting.view')) ...[const SizedBox(width: 8), tile(Icons.videocam_outlined, 'Meetings', const MeetingsScreen(), hint: next == null || next.isEmpty ? null : '${next.length} upcoming')],
      if (me.can('reminder.use')) ...[const SizedBox(width: 8), tile(Icons.alarm, 'Reminders', const RemindersScreen(), hint: 'Set alarms')],
    ]);
  }
}
