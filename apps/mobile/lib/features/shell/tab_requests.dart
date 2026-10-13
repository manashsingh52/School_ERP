import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Which sub-tab a screen with tabs should show — home shortcuts set it ("Results" opens
/// Academics on Results), and the screen writes it back when the person switches tabs.
class TabRequest extends Notifier<int> {
  @override
  int build() => 0;
  void go(int index) => state = index;
}

/// Parent Academics: 0 Attendance · 1 Homework · 2 Timetable · 3 Results.
final academicsTabProvider = NotifierProvider<TabRequest, int>(TabRequest.new);

/// Teacher Classes: 0 Homework · 1 Marks.
final classesTabProvider = NotifierProvider<TabRequest, int>(TabRequest.new);
