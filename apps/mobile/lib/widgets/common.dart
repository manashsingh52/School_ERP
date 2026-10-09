import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_error.dart';
import '../core/theme.dart';

String errorText(Object e) => e is ApiException ? e.message : 'Something went wrong. Please try again.';

void toast(BuildContext context, String message, {bool error = false}) {
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(SnackBar(content: Text(message), backgroundColor: error ? StatusColors.of(context).danger : null, behavior: SnackBarBehavior.floating));
}

/// Loading → content, or a friendly error with "Try again" (never a blank screen).
class AsyncView<T> extends StatelessWidget {
  const AsyncView({super.key, required this.value, required this.builder, this.onRetry, this.loading});
  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final VoidCallback? onRetry;
  final Widget? loading;

  @override
  Widget build(BuildContext context) {
    return switch (value) {
      AsyncData(:final value) => builder(value),
      AsyncError(:final error) => ErrorView(message: errorText(error), onRetry: onRetry),
      _ => loading ?? const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())),
    };
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.cloud_off_outlined, size: 36, color: StatusColors.of(context).muted),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          if (onRetry != null) ...[const SizedBox(height: 12), OutlinedButton(onPressed: onRetry, child: const Text('Try again'))],
        ]),
      );
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.icon, required this.title, this.subtitle});
  final IconData icon;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 36, color: StatusColors.of(context).muted),
          const SizedBox(height: 10),
          Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
          if (subtitle != null) ...[const SizedBox(height: 4), Text(subtitle!, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center)],
        ]),
      );
}

/// Titled card used on home screens.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.title, required this.child, this.action, this.onAction});
  final String title;
  final Widget child;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Card(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
            child: Row(children: [
              Expanded(child: Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600))),
              if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
            ]),
          ),
          child,
        ]),
      );
}

enum Tone { neutral, success, warning, danger, info, accent }

class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.tone = Tone.neutral});
  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final s = StatusColors.of(context);
    final c = switch (tone) {
      Tone.success => s.success,
      Tone.warning => s.warning,
      Tone.danger => s.danger,
      Tone.info => s.info,
      Tone.accent => Theme.of(context).colorScheme.primary,
      Tone.neutral => Theme.of(context).colorScheme.onSurfaceVariant,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
      child: Text(label, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

const attendanceTone = {'PRESENT': Tone.success, 'ABSENT': Tone.danger, 'LATE': Tone.warning, 'HALF_DAY': Tone.info, 'LEAVE': Tone.neutral};
const attendanceLabel = {'PRESENT': 'Present', 'ABSENT': 'Absent', 'LATE': 'Late', 'HALF_DAY': 'Half day', 'LEAVE': 'Leave'};

/// Open a signed file link (receipt, report card, document) in the phone's viewer.
Future<void> openLink(BuildContext context, Future<String> Function() getUrl) async {
  try {
    final url = await getUrl();
    if (!await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication) && context.mounted) toast(context, "Couldn't open the file.", error: true);
  } catch (e) {
    if (context.mounted) toast(context, errorText(e), error: true);
  }
}

/// Pull to refresh for any scrollable page.
class Refreshable extends StatelessWidget {
  const Refreshable({super.key, required this.onRefresh, required this.children});
  final Future<void> Function() onRefresh;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(padding: const EdgeInsets.all(16), physics: const AlwaysScrollableScrollPhysics(), children: [
          for (var i = 0; i < children.length; i++) ...[if (i > 0) const SizedBox(height: 12), children[i]],
        ]),
      );
}
