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

  Future<void> signIn(WidgetTester tester, String who) async {
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
  }

  Future<void> walk(WidgetTester tester, String who, List<String> tabs) async {
    await signIn(tester, who);
    for (final tab in tabs) {
      await tester.tap(find.byTooltip(tab).last);
      await tester.pumpAndSettle();
      expect(find.text('Try again'), findsNothing, reason: '$tab shows an error');
      expect(tester.takeException(), isNull);
    }
  }

  testWidgets('parent: every tab opens with data', (tester) => walk(tester, 'parent', ['Academics', 'Fees', 'Alerts', 'Profile', 'Home']));
  testWidgets('teacher: every tab opens with data', (tester) => walk(tester, 'teacher', ['Attendance', 'Classes', 'Alerts', 'Profile', 'Home']));

  testWidgets('parent: the ID card, Betu and Hindi', (tester) async {
    await signIn(tester, 'parent');
    await tester.tap(find.byTooltip('Profile').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Ananya Mishra'));
    await tester.pumpAndSettle();
    expect(find.text('STUDENT IDENTITY CARD'), findsOneWidget);
    expect(find.text('1376'), findsWidgets);
    expect(find.text('Rajesh Mishra'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Ask Betu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('How do I pay school fees?'));
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.textContaining('press Pay and finish in any UPI app'), findsOneWidget);
    await tester.tap(find.text('Open Fees'));
    await tester.pumpAndSettle();
    expect(find.text('Try again'), findsNothing);

    await tester.tap(find.byTooltip('Profile').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('हिन्दी'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('हिन्दी'));
    await tester.pumpAndSettle();
    // The app redraws in Hindi and stays on Profile.
    expect(find.text('छात्र ID कार्ड'), findsOneWidget);
    expect(find.byTooltip('होम'), findsOneWidget);
    await tester.ensureVisible(find.text('English'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(find.text('Student ID card'), findsOneWidget);
  });
}
