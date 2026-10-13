import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:schoolos/app.dart';
import 'package:schoolos/core/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

Map<String, dynamic> _me(List<Map<String, dynamic>> roles, {String? teacherId, List<Map<String, dynamic>> children = const []}) => {
      'user': {'id': 'u1', 'name': 'Priya Sharma', 'phone': '+919000000004', 'email': null},
      'membership': {
        'membershipId': 'm1',
        'school': {'id': 's1', 'slug': 'demo', 'name': 'Demo Public School', 'logoUrl': null, 'accentColor': '#2F6FEB'},
        'roles': roles,
        'permissions': {if (teacherId != null) 'attendance.mark': 'ASSIGNED', if (teacherId != null) 'homework.manage': 'ASSIGNED', 'dashboard.view': 'ALL'},
        'teacherId': teacherId,
        'children': children,
      },
      'memberships': [],
      'platformRole': null,
    };

Widget _app(FakeApi api, MemoryTokenStore tokens) => ProviderScope(
      retry: (_, _) => null,
      overrides: [apiProvider.overrideWithValue(api), tokenStoreProvider.overrideWithValue(tokens)],
      child: const SchoolOsApp(),
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  final config = {'minVersion': '1.0.0', 'latestVersion': '1.0.0', 'storeUrls': {'android': null, 'ios': null}, 'paymentsDriver': 'mock'};

  testWidgets('no saved session → sign-in screen; one school → straight in', (tester) async {
    final tokens = MemoryTokenStore();
    final api = FakeApi({
      'GET /app/config': (_) => config,
      'POST /auth/login': (_) => {
            'user': {'id': 'u1', 'name': 'Priya', 'phone': null, 'email': null},
            'memberships': [{'membershipId': 'm1', 'school': {'id': 's1', 'slug': 'demo', 'name': 'Demo Public School', 'logoUrl': null, 'accentColor': '#2F6FEB'}, 'roles': [{'key': 'teacher', 'name': 'Teacher'}]}],
            'activeMembershipId': 'm1',
            'isPlatformAdmin': false,
            'tokens': {'accessToken': 'a', 'accessTokenExpiresAt': '', 'refreshToken': 'r' * 40, 'refreshTokenExpiresAt': ''},
          },
      'GET /me': (_) => _me([{'key': 'teacher', 'name': 'Teacher'}], teacherId: 't1'),
      'GET /dashboard': (_) => {'date': '2026-10-09', 'isWeeklyOff': false, 'kpis': {}, 'attention': [], 'myRegisters': [{'sectionId': 'sec1', 'label': '8-A', 'status': 'NOT_TAKEN'}], 'today': null},
      'GET /exams/marks/mine': (_) => <dynamic>[],
      'GET /notifications/unread-count': (_) => {'count': 2},
      'GET /attendance/overview': (_) => {'date': '2026-10-09', 'isWeeklyOff': false, 'totals': {}, 'sections': <dynamic>[]},
    });
    await tester.pumpWidget(_app(api, tokens));
    await tester.pumpAndSettle();
    expect(find.text('Welcome to SchoolOS'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Mobile number or email'), 'teacher@demo.school');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'not-a-real-password');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(tokens.refresh, 'r' * 40);
    expect(find.text('Attendance to take'), findsOneWidget);
    expect(find.text('8-A'), findsOneWidget);
    expect(find.byTooltip('Classes'), findsOneWidget); // teacher bottom bar (icon; name as tooltip)
    final login = api.calls.firstWhere((c) => c.$2 == '/auth/login').$3 as Map;
    expect(login['platform'], isNotNull);
  });

  testWidgets('an outdated app must update first', (tester) async {
    final api = FakeApi({'GET /app/config': (_) => {...config, 'minVersion': '9.0.0'}});
    await tester.pumpWidget(_app(api, MemoryTokenStore()));
    await tester.pumpAndSettle();
    expect(find.text('Please update SchoolOS'), findsOneWidget);
  });

  testWidgets('saved session with several schools → school picker', (tester) async {
    final tokens = MemoryTokenStore()..refresh = 'r' * 40;
    final api = FakeApi({
      'GET /app/config': (_) => config,
      'GET /me': (_) => {
            'user': {'id': 'u1', 'name': 'Raj Kumar', 'phone': null, 'email': null},
            'membership': null,
            'memberships': [
              for (final n in ['Demo Public School', 'Sunrise School']) {'membershipId': n, 'school': {'id': n, 'slug': n, 'name': n, 'logoUrl': null, 'accentColor': '#2F6FEB'}, 'roles': [{'key': 'parent', 'name': 'Parent'}]},
            ],
            'platformRole': null,
          },
    });
    await tester.pumpWidget(_app(api, tokens));
    await tester.pumpAndSettle();
    expect(find.text('Choose a school'), findsOneWidget);
    expect(find.text('Sunrise School'), findsOneWidget);
  });
}
