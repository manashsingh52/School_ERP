import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session.dart';
import '../../widgets/common.dart';

/// Sign in with a password or a one-time code (docs/03 §2). No school web address on a phone:
/// the account's schools are listed after sign-in.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.message});
  final String? message;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _otp = false;
  bool _busy = false;
  bool _showPassword = false;
  String? _error;
  String? _challengeId;
  final _id = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _code = TextEditingController();

  @override
  void initState() {
    super.initState();
    _error = widget.message;
  }

  @override
  void dispose() {
    for (final c in [_id, _password, _phone, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.read(sessionProvider.notifier);
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Center(
                  child: Container(
                    width: 56,
                    height: 56,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: theme.colorScheme.primary, borderRadius: BorderRadius.circular(14)),
                    child: const Text('S', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700)),
                  ),
                ),
                const SizedBox(height: 16),
                Text('Welcome to SchoolOS', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600), textAlign: TextAlign.center),
                const SizedBox(height: 4),
                Text('For parents and teachers', style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
                const SizedBox(height: 28),
                SegmentedButton<bool>(
                  segments: const [ButtonSegment(value: false, label: Text('Password')), ButtonSegment(value: true, label: Text('One-time code'))],
                  selected: {_otp},
                  onSelectionChanged: (v) => setState(() {
                    _otp = v.first;
                    _error = null;
                  }),
                ),
                const SizedBox(height: 20),
                if (!_otp) ...[
                  TextField(controller: _id, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'Mobile number or email')),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _password,
                    obscureText: !_showPassword,
                    autofillHints: const [AutofillHints.password],
                    onSubmitted: (_) => _run(() => session.signInWithPassword(_id.text, _password.text)),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      suffixIcon: IconButton(icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility), tooltip: _showPassword ? 'Hide password' : 'Show password', onPressed: () => setState(() => _showPassword = !_showPassword)),
                    ),
                  ),
                  const SizedBox(height: 20),
                  FilledButton(onPressed: _busy ? null : () => _run(() => session.signInWithPassword(_id.text, _password.text)), child: _busy ? const _Spinner() : const Text('Sign in')),
                ] else if (_challengeId == null) ...[
                  TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91 ')),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy ? null : () => _run(() async {
                      final id = await session.sendCode(_phone.text.startsWith('+') ? _phone.text : '+91${_phone.text.replaceAll(RegExp(r'\D'), '')}');
                      setState(() => _challengeId = id);
                    }),
                    child: _busy ? const _Spinner() : const Text('Send code'),
                  ),
                ] else ...[
                  Text('Enter the 6-digit code sent to +91 ${_phone.text}', style: theme.textTheme.bodySmall),
                  const SizedBox(height: 12),
                  TextField(controller: _code, keyboardType: TextInputType.number, maxLength: 6, autofillHints: const [AutofillHints.oneTimeCode], decoration: const InputDecoration(labelText: 'Code', counterText: '')),
                  const SizedBox(height: 20),
                  FilledButton(onPressed: _busy ? null : () => _run(() => session.verifyCode(_challengeId!, _code.text)), child: _busy ? const _Spinner() : const Text('Sign in')),
                  TextButton(onPressed: _busy ? null : () => setState(() => _challengeId = null), child: const Text('Use a different number')),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(_error!, style: TextStyle(color: theme.colorScheme.error), textAlign: TextAlign.center),
                ],
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner();
  @override
  Widget build(BuildContext context) => SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Theme.of(context).colorScheme.primary));
}
