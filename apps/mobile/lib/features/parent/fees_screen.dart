import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'parent_data.dart';

const _method = {'ONLINE': 'Online', 'CASH': 'Cash', 'BANK_TRANSFER': 'Bank transfer', 'UPI_DIRECT': 'UPI', 'POS_CARD': 'Card'};

/// Fees (docs/06 §4, docs/11): what's due, pay whole bills online, receipts.
class FeesScreen extends ConsumerStatefulWidget {
  const FeesScreen({super.key});
  @override
  ConsumerState<FeesScreen> createState() => _FeesScreenState();
}

class _FeesScreenState extends ConsumerState<FeesScreen> {
  final Set<String> _picked = {};
  String? _forChild;
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final child = ref.watch(childProvider);
    if (child == null) return const EmptyView(icon: Icons.family_restroom, title: 'No children linked yet');
    final statement = ref.watch(childFees(child.id));
    final s = StatusColors.of(context);
    return AsyncView(
      value: statement,
      onRetry: () => ref.invalidate(childFees(child.id)),
      builder: (f) {
        final open = f.invoices.where((i) => i.payable).toList();
        if (_forChild != child.id) {
          // New child or first load: everything due is ticked.
          _forChild = child.id;
          _picked
            ..clear()
            ..addAll(open.map((i) => i.id));
        }
        final total = open.where((i) => _picked.contains(i.id)).fold<int>(0, (a, i) => a + i.balancePaise);
        return Column(children: [
          Expanded(
            child: Refreshable(
              onRefresh: () async => ref.invalidate(childFees(child.id)),
              children: [
                Row(children: [
                  Expanded(child: _Stat(label: 'Due now', value: rupees(f.balancePaise))),
                  const SizedBox(width: 12),
                  Expanded(child: _Stat(label: 'Overdue', value: rupees(f.overduePaise), color: f.overduePaise > 0 ? s.danger : null)),
                  const SizedBox(width: 12),
                  Expanded(child: _Stat(label: 'Paid', value: rupees(f.paidPaise))),
                ]),
                SectionCard(
                  title: 'To pay',
                  child: open.isEmpty
                      ? EmptyView(icon: Icons.check_circle_outline, title: "All of ${child.firstName}'s fees are paid")
                      : Column(children: [
                          if (!f.onlinePayments) const ListTile(leading: Icon(Icons.info_outline), title: Text('Online payment is not available yet — please pay at the school office.')),
                          for (final i in open)
                            CheckboxListTile(
                              value: _picked.contains(i.id),
                              onChanged: f.onlinePayments ? (v) => setState(() => v == true ? _picked.add(i.id) : _picked.remove(i.id)) : null,
                              title: Text(i.installment ?? 'Fees'),
                              subtitle: Text('Due ${formatDate(i.dueDate)}${i.overdue ? ' · overdue' : ''}${i.lateFeePaise > 0 ? ' · incl. ${rupees(i.lateFeePaise)} late fee' : ''}', style: TextStyle(color: i.overdue ? s.danger : null)),
                              secondary: Text(rupees(i.balancePaise), style: const TextStyle(fontWeight: FontWeight.w600)),
                              controlAffinity: ListTileControlAffinity.leading,
                            ),
                        ]),
                ),
                SectionCard(
                  title: 'Payments and receipts',
                  child: f.payments.isEmpty
                      ? const EmptyView(icon: Icons.receipt_long_outlined, title: 'No payments yet')
                      : Column(children: [
                          for (final p in f.payments)
                            ListTile(
                              title: Text('${rupees(p.amountPaise)} · ${_method[p.method] ?? p.method}'),
                              subtitle: Text([formatDate(p.receivedAt), p.receiptNo].whereType<String>().join(' · ')),
                              trailing: p.status == 'VOIDED'
                                  ? const Pill('Cancelled', tone: Tone.danger)
                                  : IconButton(
                                      tooltip: 'Receipt',
                                      icon: const Icon(Icons.download_outlined),
                                      onPressed: () => openLink(context, () async => (await ref.read(apiProvider).get<Json>('/payments/${p.id}/receipt'))['url'] as String),
                                    ),
                            ),
                        ]),
                ),
              ],
            ),
          ),
          if (f.onlinePayments && open.isNotEmpty)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: FilledButton.icon(
                  onPressed: total == 0 || _busy ? null : () => _pay(child, open.where((i) => _picked.contains(i.id)).map((i) => i.id).toList()),
                  icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.lock_outline),
                  label: Text('Pay ${rupees(total)}'),
                ),
              ),
            ),
        ]);
      },
    );
  }

  Future<void> _pay(Child child, List<String> invoiceIds) async {
    final api = ref.read(apiProvider);
    final config = await ref.read(appConfigProvider.future).catchError((_) => AppConfig(minVersion: '0.0.0', latestVersion: '0.0.0', paymentsDriver: 'mock'));
    setState(() => _busy = true);
    try {
      final order = OnlineOrder.fromJson(await api.post<Json>('/payments/online/orders', {'studentId': child.id, 'invoiceIds': invoiceIds}, {'idempotency-key': ApiClient.newKey()}));
      if (!mounted) return;
      final Map<String, String>? proof = order.driver == 'mock' ? await _mockCheckout(order) : await _razorpay(order, config);
      if (proof == null || !mounted) return; // cancelled
      PaymentResult result;
      try {
        result = PaymentResult.fromJson(await api.post<Json>('/payments/online/verify', proof));
      } catch (e) {
        result = PaymentResult(status: 'PENDING', message: "We're confirming your payment. You'll get a notification when it's done.");
      }
      if (mounted) await _showResult(result);
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      ref.invalidate(childFees(child.id));
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Razorpay Checkout on the phone (the school's own account, docs/11).
  Future<Map<String, String>?> _razorpay(OnlineOrder order, AppConfig config) async {
    if (kIsWeb) {
      toast(context, 'Online payment opens in the SchoolOS app on your phone.', error: true);
      return null;
    }
    final done = Completer<Map<String, String>?>();
    final rz = Razorpay();
    rz.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) => done.complete({'providerOrderId': r.orderId ?? order.providerOrderId, 'providerPaymentId': r.paymentId ?? '', 'signature': r.signature ?? ''}));
    rz.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) {
      if (mounted && r.code != Razorpay.PAYMENT_CANCELLED) toast(context, r.message ?? 'Payment did not go through.', error: true);
      done.complete(null);
    });
    rz.open({
      'key': order.keyId,
      'order_id': order.providerOrderId,
      'amount': order.amountPaise,
      'currency': 'INR',
      'name': order.schoolName,
      'description': order.description,
      'prefill': order.prefill,
      'theme': {'color': '#${Theme.of(context).colorScheme.primary.toARGB32().toRadixString(16).substring(2)}'},
    });
    try {
      return await done.future;
    } finally {
      rz.clear();
    }
  }

  /// Development sandbox: the API pretends to be the bank (refused in production).
  Future<Map<String, String>?> _mockCheckout(OnlineOrder order) async {
    final outcome = await showModalBottomSheet<(String, String)>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Test checkout', style: Theme.of(ctx).textTheme.titleLarge),
            Text('${order.schoolName} · ${rupees(order.amountPaise)} · sandbox, no real money', style: Theme.of(ctx).textTheme.bodySmall),
            const SizedBox(height: 16),
            FilledButton(onPressed: () => Navigator.pop(ctx, ('success', 'upi')), child: const Text('Pay with UPI (succeeds)')),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: () => Navigator.pop(ctx, ('success', 'card')), child: const Text('Pay with card (succeeds)')),
            TextButton(onPressed: () => Navigator.pop(ctx, ('failure', 'upi')), child: Text('Payment fails', style: TextStyle(color: StatusColors.of(ctx).danger))),
          ]),
        ),
      ),
    );
    if (outcome == null) return null;
    final sim = await ref.read(apiProvider).post<Json>('/payments/online/mock-checkout', {'providerOrderId': order.providerOrderId, 'outcome': outcome.$1, 'method': outcome.$2});
    return sim.map((k, v) => MapEntry(k, '$v'));
  }

  Future<void> _showResult(PaymentResult r) {
    final s = StatusColors.of(context);
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: Icon(r.status == 'PAID' ? Icons.check_circle : r.status == 'FAILED' ? Icons.cancel : Icons.schedule, color: r.status == 'PAID' ? s.success : r.status == 'FAILED' ? s.danger : s.warning, size: 40),
        title: Text(r.status == 'PAID' ? 'Payment received' : r.status == 'FAILED' ? 'Payment did not go through' : 'Payment pending'),
        content: Text([r.message, if (r.receiptNo != null) 'Receipt ${r.receiptNo}'].join('\n\n'), textAlign: TextAlign.center),
        actions: [
          if (r.paymentId != null) TextButton(onPressed: () => openLink(ctx, () async => (await ref.read(apiProvider).get<Json>('/payments/${r.paymentId}/receipt'))['url'] as String), child: const Text('Receipt')),
          FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Done')),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.color});
  final String label, value;
  final Color? color;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 4),
            FittedBox(child: Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: color))),
          ]),
        ),
      );
}
