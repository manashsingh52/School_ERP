import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config.dart';
import 'core/format.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/school_picker_screen.dart';
import 'features/auth/update_screen.dart';
import 'features/shell/home_shell.dart';

class SchoolOsApp extends ConsumerWidget {
  const SchoolOsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final config = ref.watch(appConfigProvider).value;
    // The school's accent once inside a school; SchoolOS blue before that.
    final accent = parseHex(session is SignedIn ? session.me.membership?.school.accentColor : null);
    final outdated = config != null && compareVersions(appVersion, config.minVersion) < 0;
    return MaterialApp(
      title: 'SchoolOS',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light, accent),
      darkTheme: buildTheme(Brightness.dark, accent),
      home: outdated
          ? UpdateRequiredScreen(config: config)
          : switch (session) {
              SessionLoading() => const Scaffold(body: Center(child: CircularProgressIndicator())),
              SignedOut(:final message) => LoginScreen(key: ValueKey(message), message: message),
              ChoosingSchool(:final user, :final memberships) => SchoolPickerScreen(user: user, memberships: memberships),
              SignedIn() => const HomeShell(),
            },
    );
  }
}
