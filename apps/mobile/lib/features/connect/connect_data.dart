import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/session.dart';

/// Messages, meetings and reminders — shared by parents and teachers.

final conversationsProvider = FutureProvider.autoDispose.family<List<Conversation>, String?>((ref, status) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/conversations', query: {'pageSize': 50, 'status': status});
  return rows.cast<Json>().map(Conversation.fromJson).toList();
});

final conversationProvider = FutureProvider.autoDispose.family<Conversation, String>((ref, id) async => Conversation.fromJson(await ref.read(apiProvider).get<Json>('/conversations/$id')));

final unreadMessagesProvider = FutureProvider.autoDispose<int>((ref) async {
  final me = ref.watch(meProvider);
  if (!me.can('message.use')) return 0;
  return ((await ref.read(apiProvider).get<Json>('/conversations/unread'))['count'] as num).toInt();
});

final contactsProvider = FutureProvider.autoDispose.family<List<MessageContact>, String>((ref, studentId) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/conversations/contacts', query: {'studentId': studentId});
  return rows.cast<Json>().map(MessageContact.fromJson).toList();
});

final meetingsProvider = FutureProvider.autoDispose.family<List<Meeting>, String>((ref, when) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/meetings', query: {'when': when});
  return rows.cast<Json>().map(Meeting.fromJson).toList();
});

final remindersProvider = FutureProvider.autoDispose.family<List<Reminder>, String>((ref, status) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/reminders', query: {'status': status});
  return rows.cast<Json>().map(Reminder.fromJson).toList();
});

/// Staff pick a student by name or admission number.
final studentSearchProvider = FutureProvider.autoDispose.family<List<StudentRef>, String>((ref, q) async {
  if (q.trim().length < 2) return const [];
  final r = await ref.read(apiProvider).get<Json>('/search', query: {'q': q.trim()});
  return [
    for (final s in (r['students'] as List).cast<Json>())
      StudentRef(id: s['id'] as String, name: s['name'] as String, classLabel: [s['className'], s['sectionName']].whereType<String>().map((x) => x.replaceFirst(RegExp(r'^Class\s+', caseSensitive: false), '')).join('-')),
  ];
});

/// Calendar entries between two dates ("2026-10-01", "2026-10-31").
final calendarProvider = FutureProvider.autoDispose.family<List<CalendarItem>, (String, String)>((ref, range) async {
  final rows = await ref.read(apiProvider).get<List<dynamic>>('/calendar', query: {'from': range.$1, 'to': range.$2});
  return rows.cast<Json>().map(CalendarItem.fromJson).toList();
});
