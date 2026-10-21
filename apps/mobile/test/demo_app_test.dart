import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:schoolos/app.dart';
import 'package:schoolos/core/demo_api.dart';
import 'package:schoolos/core/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

/// Assets read ahead of time: widget tests run on a fake clock and can't wait for file reads.
class _Preloaded extends CachingAssetBundle {
  _Preloaded(this.files);
  final Map<String, String> files;
  @override
  Future<ByteData> load(String key) async => ByteData.sublistView(Uint8List.fromList(files[key]!.codeUnits));
  @override
  Future<String> loadString(String key, {bool cache = true}) async => files[key]!;
}

/// The whole app on the demo data: sign in as each demo user and open every tab.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> walk(WidgetTester tester, String who, List<String> tabs) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final tokens = MemoryTokenStore();
    final file = 'assets/demo/$who.json';
    final bundle = _Preloaded({file: (await tester.runAsync(() => rootBundle.loadString(file)))!});
    await tester.pumpWidget(ProviderScope(
      retry: (_, _) => null,
      overrides: [apiProvider.overrideWithValue(DemoApi(tokens, bundle: bundle)), tokenStoreProvider.overrideWithValue(tokens)],
      child: const SchoolOsApp(),
    ));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Mobile number or email'), '$who@demo.school');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'demo');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Profile'), findsOneWidget);
    for (final tab in tabs) {
      await tester.tap(find.byTooltip(tab).last);
      await tester.pumpAndSettle();
      expect(find.text('Try again'), findsNothing, reason: '$tab shows an error');
      expect(tester.takeException(), isNull);
    }
  }

  testWidgets('parent: every tab opens with data', (tester) => walk(tester, 'parent', ['Academics', 'Fees', 'Alerts', 'Profile', 'Home']));
  testWidgets('teacher: every tab opens with data', (tester) => walk(tester, 'teacher', ['Attendance', 'Classes', 'Alerts', 'Profile', 'Home']));
}
