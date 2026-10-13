import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/home_kit.dart';
import 'connect_data.dart';

Tone statusTone(String s) => switch (s) { 'OPEN' => Tone.info, 'IN_PROGRESS' => Tone.warning, _ => Tone.success };

/// Messages and complaints between parents and teachers (or the school office).
class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});
  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  String? _status;

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(conversationsProvider(_status));
    final parent = ref.watch(modeProvider) == AppMode.parent;
    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NewMessageScreen())),
        icon: const Icon(Icons.edit_outlined),
        label: const Text('New'),
      ),
      body: Column(children: [
        if (parent) const TeachersStrip(),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: Row(children: [
            for (final (value, label) in [(null, 'All'), ('OPEN', 'Open'), ('IN_PROGRESS', 'In progress'), ('RESOLVED', 'Resolved')])
              Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(label), selected: _status == value, onSelected: (_) => setState(() => _status = value))),
          ]),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(conversationsProvider(_status)),
            child: AsyncView(
              value: list,
              onRetry: () => ref.invalidate(conversationsProvider(_status)),
              builder: (items) => items.isEmpty
                  ? ListView(children: [
                      EmptyView(
                        icon: Icons.forum_outlined,
                        title: 'No messages yet',
                        subtitle: parent ? 'Ask a teacher a question, or raise a complaint with the school office.' : "Parents' questions to you appear here.",
                      ),
                    ])
                  : ListView.separated(
                      padding: const EdgeInsets.only(bottom: 88),
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const Divider(),
                      itemBuilder: (_, i) => _ConversationTile(c: items[i], onChanged: () => ref.invalidate(conversationsProvider(_status))),
                    ),
            ),
          ),
        ),
      ]),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.c, required this.onChanged});
  final Conversation c;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final s = StatusColors.of(context);
    return ListTile(
      onTap: () async {
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ThreadScreen(id: c.id)));
        onChanged();
      },
      leading: CircleAvatar(
        backgroundColor: (c.category == 'COMPLAINT' ? s.danger : Theme.of(context).colorScheme.primary).withValues(alpha: 0.12),
        child: Icon(c.category == 'COMPLAINT' ? Icons.report_outlined : Icons.chat_bubble_outline, color: c.category == 'COMPLAINT' ? s.danger : Theme.of(context).colorScheme.primary, size: 20),
      ),
      title: Row(children: [
        Expanded(child: Text(c.subject, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: c.unread ? FontWeight.w700 : FontWeight.w500))),
        if (c.unread) Container(width: 8, height: 8, margin: const EdgeInsets.only(left: 6), decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary, shape: BoxShape.circle)),
      ]),
      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${c.student.name.split(' ').first} · ${c.otherName} · ${timeAgo(c.lastMessageAt)}', maxLines: 1, overflow: TextOverflow.ellipsis),
        if (c.lastMessage != null) Text(c.lastMessage!, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 4),
        Wrap(spacing: 6, children: [Pill(conversationStatusLabel[c.status] ?? c.status, tone: statusTone(c.status)), Pill(conversationCategoryLabel[c.category] ?? c.category, tone: c.category == 'COMPLAINT' ? Tone.danger : Tone.neutral)]),
      ]),
      isThreeLine: true,
    );
  }
}

/// One conversation: the messages (with "Seen"), a reply box, and the status for staff.
class ThreadScreen extends ConsumerStatefulWidget {
  const ThreadScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends ConsumerState<ThreadScreen> {
  final _reply = TextEditingController();
  bool _busy = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // New replies show up while the thread is open.
    _poll = Timer.periodic(const Duration(seconds: 12), (_) => ref.invalidate(conversationProvider(widget.id)));
  }

  @override
  void dispose() {
    _poll?.cancel();
    _reply.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_reply.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).post<Json>('/conversations/${widget.id}/messages', {'body': _reply.text.trim()});
      _reply.clear();
      ref.invalidate(conversationProvider(widget.id));
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setStatus(String status) async {
    try {
      await ref.read(apiProvider).patch<Json>('/conversations/${widget.id}', {'status': status});
      ref.invalidate(conversationProvider(widget.id));
      if (mounted) toast(context, 'Marked ${conversationStatusLabel[status]!.toLowerCase()} — the parent has been told.');
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final thread = ref.watch(conversationProvider(widget.id));
    final s = StatusColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(thread.value?.subject ?? 'Conversation', maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          if (thread.value?.canChangeStatus == true)
            PopupMenuButton<String>(
              tooltip: 'Status',
              icon: const Icon(Icons.flag_outlined),
              onSelected: _setStatus,
              itemBuilder: (_) => [for (final st in ['OPEN', 'IN_PROGRESS', 'RESOLVED']) CheckedPopupMenuItem(value: st, checked: thread.value?.status == st, child: Text(conversationStatusLabel[st]!))],
            ),
        ],
      ),
      body: AsyncView(
        value: thread,
        onRetry: () => ref.invalidate(conversationProvider(widget.id)),
        builder: (c) => Column(children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            color: s.subtle,
            child: Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
              Pill(conversationStatusLabel[c.status] ?? c.status, tone: statusTone(c.status)),
              Pill(conversationCategoryLabel[c.category] ?? c.category, tone: c.category == 'COMPLAINT' ? Tone.danger : Tone.neutral),
              Text('About ${c.student.name.split(' ').first} · with ${c.otherName}', style: Theme.of(context).textTheme.bodySmall),
            ]),
          ),
          Expanded(
            child: ListView(
              reverse: true,
              padding: const EdgeInsets.all(12),
              children: [
                for (final m in c.messages.reversed)
                  Align(
                    alignment: m.fromMe ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                      decoration: BoxDecoration(
                        color: m.fromMe ? scheme.primary : scheme.surface,
                        border: m.fromMe ? null : Border.all(color: s.border),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        if (!m.fromMe) Text(m.senderName, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: scheme.onSurfaceVariant)),
                        Text(m.body, style: TextStyle(color: m.fromMe ? scheme.onPrimary : null)),
                        const SizedBox(height: 2),
                        Row(mainAxisSize: MainAxisSize.min, children: [
                          Text(DateFormat('d MMM, h:mm a').format(DateTime.parse(m.createdAt).toLocal()), style: TextStyle(fontSize: 11, color: m.fromMe ? scheme.onPrimary.withValues(alpha: 0.8) : s.muted)),
                          if (m.fromMe) ...[const SizedBox(width: 4), Icon(m.seen ? Icons.done_all : Icons.done, size: 14, color: scheme.onPrimary.withValues(alpha: 0.9))],
                        ]),
                      ]),
                    ),
                  ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 8, 8),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _reply,
                    minLines: 1,
                    maxLines: 5,
                    maxLength: 4000,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(
                      hintText: c.status == 'RESOLVED' && c.myRole == 'PARENT' ? 'Writing again reopens this' : 'Write a reply',
                      counterText: '',
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                IconButton.filled(tooltip: 'Send', onPressed: _busy ? null : _send, icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send)),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Start a conversation. Parents: about their child, to a teacher or the school office. Teachers:
/// pick a student, then one of the parents.
class NewMessageScreen extends ConsumerStatefulWidget {
  const NewMessageScreen({super.key, this.category = 'GENERAL', this.toMemberId, this.subject});
  final String category;
  /// Opened from a teacher's card or a subject: who to write to, and a starting subject line.
  final String? toMemberId;
  final String? subject;
  @override
  ConsumerState<NewMessageScreen> createState() => _NewMessageScreenState();
}

class _NewMessageScreenState extends ConsumerState<NewMessageScreen> {
  late String _category = widget.category;
  StudentRef? _student;
  late String? _to = widget.toMemberId;
  late final _subject = TextEditingController(text: widget.subject ?? '');
  final _body = TextEditingController();
  final _search = TextEditingController();
  String _q = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    if (ref.read(modeProvider) == AppMode.parent) {
      final child = ref.read(childProvider);
      if (child != null) _student = StudentRef(id: child.id, name: child.name, classLabel: child.classLabel);
    }
  }

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    _search.dispose();
    super.dispose();
  }

  Future<void> _send(List<MessageContact> contacts) async {
    setState(() => _busy = true);
    try {
      final first = contacts.where((c) => c.available).firstOrNull;
      final to = _to ?? (first == null ? null : (first.memberId ?? 'office'));
      final res = await ref.read(apiProvider).post<Json>('/conversations', {
        'studentId': _student!.id,
        'toMemberId': to == 'office' ? null : to,
        'category': _category,
        'subject': _subject.text.trim(),
        'body': _body.text.trim(),
      });
      ref.invalidate(conversationsProvider);
      if (!mounted) return;
      toast(context, _category == 'COMPLAINT' ? 'Complaint sent — follow its status in Messages.' : 'Message sent');
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => ThreadScreen(id: res['id'] as String)));
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final parent = ref.watch(modeProvider) == AppMode.parent;
    final kids = ref.watch(meProvider).children;
    final contacts = _student == null ? const AsyncValue<List<MessageContact>>.data([]) : ref.watch(contactsProvider(_student!.id));
    final list = contacts.value ?? const <MessageContact>[];
    final ready = _student != null && list.any((c) => c.available) && _subject.text.trim().length >= 3 && _body.text.trim().isNotEmpty;
    return Scaffold(
      appBar: AppBar(title: Text(_category == 'COMPLAINT' ? 'Raise a complaint' : 'New message')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (parent && kids.length > 1)
          DropdownButtonFormField<String>(
            initialValue: _student?.id,
            decoration: const InputDecoration(labelText: 'About'),
            items: [for (final k in kids) DropdownMenuItem(value: k.id, child: Text('${k.name}${k.classLabel == null ? '' : ' (${k.classLabel})'}'))],
            onChanged: (id) => setState(() {
              final k = kids.firstWhere((x) => x.id == id);
              _student = StudentRef(id: k.id, name: k.name, classLabel: k.classLabel);
              _to = null;
            }),
          ),
        if (!parent) ...[
          if (_student == null) ...[
            TextField(controller: _search, decoration: const InputDecoration(labelText: 'Student name or admission no.', prefixIcon: Icon(Icons.search)), onChanged: (v) => setState(() => _q = v)),
            AsyncView(
              value: ref.watch(studentSearchProvider(_q)),
              builder: (rows) => Column(children: [for (final r in rows) ListTile(title: Text(r.name), subtitle: Text(r.classLabel ?? ''), onTap: () => setState(() => _student = r))]),
            ),
          ] else
            ListTile(contentPadding: EdgeInsets.zero, title: Text(_student!.name), subtitle: Text(_student!.classLabel ?? ''), trailing: TextButton(onPressed: () => setState(() => _student = null), child: const Text('Change'))),
        ],
        if (_student != null) ...[
          const SizedBox(height: 12),
          AsyncView(
            value: contacts,
            onRetry: () => ref.invalidate(contactsProvider(_student!.id)),
            builder: (cs) => cs.isEmpty
                ? Text(parent ? 'No teachers found for this class yet.' : 'None of this child’s parents use the app yet.', style: Theme.of(context).textTheme.bodySmall)
                : DropdownButtonFormField<String>(
                    initialValue: _to ?? (cs.where((c) => c.available).firstOrNull?.memberId ?? 'office'),
                    isExpanded: true,
                    decoration: InputDecoration(labelText: parent ? 'To' : 'To which parent'),
                    items: [
                      for (final (i, c) in cs.indexed)
                        c.available
                            ? DropdownMenuItem(value: c.memberId ?? 'office', child: Text('${c.name} — ${c.role}', overflow: TextOverflow.ellipsis))
                            : DropdownMenuItem(value: 'off-$i', enabled: false, child: Text('${c.name} — ${c.role} (not on the app yet)', overflow: TextOverflow.ellipsis, style: TextStyle(color: StatusColors.of(context).muted))),
                    ],
                    onChanged: (v) => setState(() => _to = v),
                  ),
          ),
        ],
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _category,
          decoration: const InputDecoration(labelText: 'Topic'),
          items: [for (final c in conversationCategories) DropdownMenuItem(value: c, child: Text(conversationCategoryLabel[c]!))],
          onChanged: (v) => setState(() => _category = v!),
        ),
        const SizedBox(height: 12),
        TextField(controller: _subject, maxLength: 120, onChanged: (_) => setState(() {}), textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Subject')),
        TextField(controller: _body, minLines: 4, maxLines: 10, maxLength: 4000, onChanged: (_) => setState(() {}), textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Message', alignLabelWithHint: true)),
        const SizedBox(height: 12),
        FilledButton.icon(onPressed: ready && !_busy ? () => _send(list) : null, icon: const Icon(Icons.send), label: Text(_busy ? 'Sending…' : 'Send')),
      ]),
    );
  }
}

/// "Your child's teachers": the class teacher and subject teachers, tap one to write to them.
class TeachersStrip extends ConsumerWidget {
  const TeachersStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final child = ref.watch(childProvider);
    if (child == null) return const SizedBox.shrink();
    final contacts = ref.watch(contactsProvider(child.id)).value ?? const <MessageContact>[];
    final teachers = contacts.where((c) => c.isTeacher).toList();
    if (teachers.isEmpty) return const SizedBox.shrink();
    final s = StatusColors.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
        child: Text("${child.firstName}'s teachers", style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
      ),
      SizedBox(
        height: 128,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          itemCount: teachers.length,
          separatorBuilder: (_, _) => const SizedBox(width: 8),
          itemBuilder: (_, i) {
            final t = teachers[i];
            return SizedBox(
              width: 128,
              child: Card(
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: t.available
                      ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => NewMessageScreen(toMemberId: t.memberId, subject: t.subjects.isEmpty ? null : 'About ${t.subjects.first}')))
                      : () => toast(context, '${t.name} isn\'t on the app yet — write to the school office instead.'),
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Column(children: [
                      Opacity(opacity: t.available ? 1 : 0.45, child: GradientAvatar(name: t.name, size: 44)),
                      const SizedBox(height: 6),
                      Text(t.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      Text(t.available ? t.role : 'Not on the app', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: s.muted, fontSize: 12)),
                    ]),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    ]);
  }
}
