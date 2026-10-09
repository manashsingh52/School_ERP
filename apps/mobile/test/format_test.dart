import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:schoolos/core/config.dart';
import 'package:schoolos/core/format.dart';
import 'package:schoolos/features/shell/home_shell.dart';
import 'package:schoolos/core/session.dart';

void main() {
  test('rupees in Indian grouping, paise only when present', () {
    expect(rupees(1240000), '₹12,400');
    expect(rupees(12345678), '₹1,23,456.78');
    expect(rupees(0), '₹0');
  });

  test('versions compare numerically', () {
    expect(compareVersions('1.10.0', '1.9.3'), greaterThan(0));
    expect(compareVersions('1.0.0', '1.0.0'), 0);
    expect(compareVersions('1.0.0', '1.2.0'), lessThan(0));
  });

  test('time ago', () {
    final now = DateTime.parse('2026-10-09T10:00:00Z');
    expect(timeAgo('2026-10-09T09:58:00Z', now: now), '2 min ago');
    expect(timeAgo('2026-10-08T09:00:00Z', now: now), '1 d ago');
  });

  test('the version the app reports matches pubspec.yaml', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(RegExp(r'^version: (\S+)\+', multiLine: true).firstMatch(pubspec)!.group(1), appVersion);
  });

  test('notification routes open the right tab', () {
    expect(tabForRoute('/my/fees'), (AppMode.parent, 2));
    expect(tabForRoute('/my/attendance'), (AppMode.parent, 1));
    expect(tabForRoute('/attendance/abc'), (AppMode.teacher, 1));
    expect(tabForRoute('/notices/1'), (null, 3));
    expect(tabForRoute('/settings'), isNull);
  });
}
