import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/attendance_queue.dart';
import '../../core/session.dart';
import '../common/notifications_screen.dart';
import '../connect/connect_row.dart';
import '../common/profile_screen.dart';
import '../parent/academics_screen.dart';
import '../parent/child_chip.dart';
import '../parent/fees_screen.dart';
import '../parent/parent_home.dart';
import '../teacher/attendance_tab.dart';
import '../teacher/classes_tab.dart';
import '../teacher/teacher_home.dart';

/// Where a notification's route (web paths, docs/05) lands in the app: (mode, tab).
(AppMode?, int)? tabForRoute(String route) {
  if (route.startsWith('/my/fees') || route.startsWith('/payments')) return (AppMode.parent, 2);
  if (route.startsWith('/my/')) return (AppMode.parent, 1);
  if (route.startsWith('/attendance')) return (AppMode.teacher, 1);
  if (route.startsWith('/exams') || route.startsWith('/homework')) return (null, 1);
  if (route.startsWith('/notices') || route.startsWith('/notifications')) return (null, 3);
  return null;
}

/// One app, two homes (docs/01 §7): parent or teacher, by role; bottom nav per docs/06 §4–5.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});
  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    // Offline registers go out as soon as the app is opened or comes back to the front.
    Future.microtask(() => ref.read(attendanceQueueProvider.notifier).sync());
    _lifecycle = AppLifecycleListener(onResume: () {
      ref.read(attendanceQueueProvider.notifier).sync();
      ref.invalidate(unreadCountProvider);
    });
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  void _openRoute(String route) {
    if (openConnectRoute(context, route)) return;
    final target = tabForRoute(route);
    if (target == null) return;
    final (mode, tab) = target;
    final me = ref.read(meProvider);
    if (mode == AppMode.parent && me.isParent) ref.read(modeProvider.notifier).set(AppMode.parent);
    if (mode == AppMode.teacher && me.isTeacher) ref.read(modeProvider.notifier).set(AppMode.teacher);
    setState(() => _tab = tab);
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(meProvider);
    final mode = ref.watch(modeProvider);
    final unread = ref.watch(unreadCountProvider).value ?? 0;
    final parent = mode == AppMode.parent;
    ref.listen(modeProvider, (_, _) => setState(() => _tab = 0));

    final pages = parent
        ? [ParentHome(onOpenTab: (t) => setState(() => _tab = t)), const AcademicsScreen(), const FeesScreen(), NotificationsScreen(onOpenRoute: _openRoute), const ProfileScreen()]
        : [const TeacherHome(), const AttendanceTab(), const ClassesTab(), NotificationsScreen(onOpenRoute: _openRoute), const ProfileScreen()];
    final titles = parent ? ['Home', 'Academics', 'Fees', 'Notifications', 'Profile'] : ['Home', 'Attendance', 'Classes', 'Notifications', 'Profile'];
    final badge = Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.notifications_outlined));

    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(titles[_tab]),
          Text(me.membership?.school.name ?? '', style: Theme.of(context).textTheme.bodySmall),
        ]),
        actions: [if (parent) const ChildChip()],
      ),
      body: IndexedStack(index: _tab, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          if (i == 3) ref.invalidate(notificationsProvider);
        },
        destinations: parent
            ? [
                const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
                const NavigationDestination(icon: Icon(Icons.school_outlined), selectedIcon: Icon(Icons.school), label: 'Academics'),
                const NavigationDestination(icon: Icon(Icons.currency_rupee), label: 'Fees'),
                NavigationDestination(icon: badge, label: 'Alerts'),
                const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
              ]
            : [
                const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
                const NavigationDestination(icon: Icon(Icons.how_to_reg_outlined), selectedIcon: Icon(Icons.how_to_reg), label: 'Attendance'),
                const NavigationDestination(icon: Icon(Icons.class_outlined), selectedIcon: Icon(Icons.class_), label: 'Classes'),
                NavigationDestination(icon: badge, label: 'Alerts'),
                const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
              ],
      ),
    );
  }
}
