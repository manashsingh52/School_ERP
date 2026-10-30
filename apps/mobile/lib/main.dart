import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config.dart';
import 'core/i18n.dart';

Future<void> main() async {
  if (misconfiguredRelease) {
    runApp(const MaterialApp(
      home: Scaffold(body: Center(child: Padding(padding: EdgeInsets.all(24), child: Text('This build of Bastaa has no server address. Build it with --dart-define=API_URL=https://… (or DEMO_MODE=true for the demo).', textAlign: TextAlign.center)))),
    ));
    return;
  }
  WidgetsFlutterBinding.ensureInitialized();
  await loadLang();
  // Screens show their own "Try again"; no silent automatic retries of failed requests.
  runApp(ProviderScope(retry: (_, _) => null, child: const SchoolOsApp()));
}
