import 'package:flutter/material.dart';

import '../common/certificates_screen.dart';
import 'calendar_screen.dart';
import 'meetings_screen.dart';
import 'messages_screen.dart';
import 'reminders_screen.dart';

/// Opens the screen a notification's route points to (messages, meetings, reminders, calendar, certificates). True if handled.
bool openConnectRoute(BuildContext context, String route) {
  final Widget? screen = route.startsWith('/messages/')
      ? ThreadScreen(id: route.substring('/messages/'.length))
      : route.startsWith('/messages')
          ? const MessagesScreen()
          : route.startsWith('/meetings')
              ? const MeetingsScreen()
              : route.startsWith('/reminders')
                  ? const RemindersScreen()
                  : route.startsWith('/calendar')
                      ? const CalendarScreen()
                      : route.startsWith('/certificates')
                          ? const CertificatesScreen()
                          : null;
  if (screen == null) return false;
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  return true;
}
