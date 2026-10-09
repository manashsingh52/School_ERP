import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'api_error.dart';
import 'session.dart';

/// A register the teacher submitted while offline (or that failed to send).
class PendingRegister {
  PendingRegister({required this.id, required this.sectionId, required this.label, required this.date, required this.records, required this.createdAt, this.error});
  factory PendingRegister.fromJson(Map<String, dynamic> j) => PendingRegister(
        id: j['id'] as String,
        sectionId: j['sectionId'] as String,
        label: j['label'] as String,
        date: j['date'] as String,
        records: (j['records'] as List).cast<Map<String, dynamic>>(),
        createdAt: j['createdAt'] as String,
        error: j['error'] as String?,
      );

  /// Also the `clientMutationId`: a replay of the same submission is ignored by the API.
  final String id;
  final String sectionId, label, date, createdAt;
  final List<Map<String, dynamic>> records;
  /// Set when the school refused it (e.g. the edit window closed) — the teacher decides what to do.
  final String? error;

  Map<String, dynamic> toJson() => {'id': id, 'sectionId': sectionId, 'label': label, 'date': date, 'records': records, 'createdAt': createdAt, 'error': error};
  PendingRegister withError(String? e) => PendingRegister(id: id, sectionId: sectionId, label: label, date: date, records: records, createdAt: createdAt, error: e);
}

enum SubmitOutcome { sent, queued }

/// Offline-capable attendance (docs/12 Phase 7): submit → try now → if offline, keep it on the
/// phone and send it later. The queue is small (a few registers), so a key-value store is enough.
class AttendanceQueue extends Notifier<List<PendingRegister>> {
  static const _key = 'attendance_queue_v1';
  bool _syncing = false;

  ApiClient get _api => ref.read(apiProvider);

  @override
  List<PendingRegister> build() {
    Future.microtask(_load);
    return const [];
  }

  Future<void> _load() async {
    final raw = (await SharedPreferences.getInstance()).getString(_key);
    if (raw != null) state = (jsonDecode(raw) as List).cast<Map<String, dynamic>>().map(PendingRegister.fromJson).toList();
  }

  Future<void> _save() async => (await SharedPreferences.getInstance()).setString(_key, jsonEncode(state.map((p) => p.toJson()).toList()));

  Future<void> _send(PendingRegister p) => _api.put<Object?>('/sections/${p.sectionId}/attendance', {'date': p.date, 'records': p.records, 'submit': true, 'clientMutationId': p.id});

  /// Submit now; when there's no connection, queue it. Other errors are thrown to the screen.
  Future<SubmitOutcome> submit({required String sectionId, required String label, required String date, required List<Map<String, dynamic>> records}) async {
    final p = PendingRegister(id: ApiClient.newKey(), sectionId: sectionId, label: label, date: date, records: records, createdAt: DateTime.now().toIso8601String());
    try {
      await _send(p);
      return SubmitOutcome.sent;
    } on ApiException catch (e) {
      if (!e.isNetwork) rethrow;
      // A newer submission for the same register replaces an older queued one.
      state = [...state.where((x) => !(x.sectionId == sectionId && x.date == date)), p];
      await _save();
      return SubmitOutcome.queued;
    }
  }

  /// Send everything waiting. Returns how many went through.
  Future<int> sync() async {
    if (_syncing || state.isEmpty) return 0;
    _syncing = true;
    var sent = 0;
    try {
      for (final p in [...state]) {
        try {
          await _send(p);
          state = state.where((x) => x.id != p.id).toList();
          sent++;
        } on ApiException catch (e) {
          if (e.isNetwork) break; // still offline: try again later
          state = [for (final x in state) x.id == p.id ? x.withError(e.message) : x];
        }
      }
      await _save();
    } finally {
      _syncing = false;
    }
    return sent;
  }

  Future<void> discard(String id) async {
    state = state.where((x) => x.id != id).toList();
    await _save();
  }
}

final attendanceQueueProvider = NotifierProvider<AttendanceQueue, List<PendingRegister>>(AttendanceQueue.new);
