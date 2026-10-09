import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

class SchoolPickerScreen extends ConsumerStatefulWidget {
  const SchoolPickerScreen({super.key, required this.user, required this.memberships});
  final UserInfo user;
  final List<Membership> memberships;

  @override
  ConsumerState<SchoolPickerScreen> createState() => _SchoolPickerScreenState();
}

class _SchoolPickerScreenState extends ConsumerState<SchoolPickerScreen> {
  String? _busy;

  Future<void> _pick(Membership m) async {
    setState(() => _busy = m.id);
    try {
      await ref.read(sessionProvider.notifier).selectSchool(m.id);
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Choose a school'), actions: [TextButton(onPressed: () => ref.read(sessionProvider.notifier).signOut(), child: const Text('Sign out'))]),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Text('Hi ${widget.user.name.split(' ').first}, your account is linked to these schools.', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          for (final m in widget.memberships)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Card(
                child: ListTile(
                  leading: CircleAvatar(backgroundColor: parseHex(m.school.accentColor), foregroundColor: Colors.white, child: Text(m.school.name[0])),
                  title: Text(m.school.name),
                  subtitle: Text(m.roleNames.join(', ')),
                  trailing: _busy == m.id ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.chevron_right),
                  onTap: _busy == null ? () => _pick(m) : null,
                ),
              ),
            ),
        ]),
      );
}
