import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

void main() {
  // Screens show their own "Try again"; no silent automatic retries of failed requests.
  runApp(ProviderScope(retry: (_, _) => null, child: const SchoolOsApp()));
}
