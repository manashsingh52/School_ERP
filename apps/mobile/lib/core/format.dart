import 'package:intl/intl.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _inrPaise = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);

/// Paise → "₹12,400" (or "₹12,400.50" when there are paise).
String rupees(int paise) => paise % 100 == 0 ? _inr.format(paise / 100) : _inrPaise.format(paise / 100);

DateTime _day(String iso) => DateTime.parse(iso.length == 10 ? '${iso}T00:00:00' : iso).toLocal();
String formatDate(String iso) => DateFormat('d MMM yyyy').format(_day(iso));
String formatDay(String iso) => DateFormat('EEE, d MMM').format(_day(iso));
String isoDate(DateTime d) => DateFormat('yyyy-MM-dd').format(d);
String today() => isoDate(DateTime.now());

String timeAgo(String iso, {DateTime? now}) {
  final diff = (now ?? DateTime.now()).difference(DateTime.parse(iso).toLocal());
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inHours < 1) return '${diff.inMinutes} min ago';
  if (diff.inDays < 1) return '${diff.inHours} h ago';
  if (diff.inDays < 7) return '${diff.inDays} d ago';
  return formatDate(iso);
}

String percent(double? v) => v == null ? '—' : '${v % 1 == 0 ? v.toInt() : v.toStringAsFixed(1)}%';

/// "1.10.0" vs "1.9.3" → positive when a > b.
int compareVersions(String a, String b) {
  final pa = a.split('.').map(int.parse).toList(), pb = b.split('.').map(int.parse).toList();
  for (var i = 0; i < 3; i++) {
    final d = (i < pa.length ? pa[i] : 0) - (i < pb.length ? pb[i] : 0);
    if (d != 0) return d;
  }
  return 0;
}
