import 'package:flutter_test/flutter_test.dart';
import 'package:schoolos/core/models.dart';

/// Shapes copied from real API responses (packages/contracts). If the API changes a field the app
/// reads, update both.
void main() {
  test('me: parent with children and permissions', () {
    final me = Me.fromJson({
      'user': {'id': 'u1', 'name': 'Raj Kumar', 'phone': '+919000000005', 'email': null},
      'membership': {
        'membershipId': 'm1',
        'school': {'id': 's1', 'slug': 'demo', 'name': 'Demo Public School', 'logoUrl': null, 'accentColor': '#0E7490'},
        'roles': [{'key': 'parent', 'name': 'Parent'}],
        'permissions': {'payment.pay_online': 'OWN_CHILDREN', 'student.view': 'OWN_CHILDREN'},
        'teacherId': null,
        'children': [{'id': 'c1', 'name': 'Rahul Kumar', 'firstName': 'Rahul', 'classLabel': '8-A', 'sectionId': 'sec1'}],
      },
      'memberships': [],
      'platformRole': null,
    });
    expect(me.isParent, isTrue);
    expect(me.isTeacher, isFalse);
    expect(me.children.single.classLabel, '8-A');
    expect(me.can('payment.pay_online', ['OWN_CHILDREN']), isTrue);
    expect(me.can('payment.collect'), isFalse);
  });

  test('fee statement: payable bills', () {
    final f = FeeStatement.fromJson({
      'student': {'id': 'c1', 'name': 'Rahul', 'admissionNo': '1', 'classLabel': '8-A'},
      'totals': {'invoicedPaise': 2400000, 'paidPaise': 600000, 'balancePaise': 1800000, 'overduePaise': 600000, 'creditPaise': 0},
      'invoices': [
        {'id': 'i1', 'number': 'INV/1', 'installment': {'id': 'q1', 'name': 'Term 1'}, 'dueDate': '2026-04-10', 'status': 'PARTIALLY_PAID', 'overdue': true, 'totalPaise': 1200000, 'balancePaise': 600000, 'lateFeePaise': 3000},
        {'id': 'i2', 'number': 'INV/2', 'installment': null, 'dueDate': '2026-10-10', 'status': 'PAID', 'overdue': false, 'totalPaise': 600000, 'balancePaise': 0, 'lateFeePaise': 0},
      ],
      'payments': [{'id': 'p1', 'amountPaise': 600000, 'method': 'UPI_DIRECT', 'status': 'CAPTURED', 'receiptNo': 'RCPT/1', 'receiptReady': true, 'receivedAt': '2026-04-02T05:00:00Z'}],
      'credits': [],
      'onlinePayments': true,
    });
    expect(f.invoices.where((i) => i.payable).map((i) => i.id), ['i1']);
    expect(f.payments.single.receiptNo, 'RCPT/1');
  });

  test('my marks sheets flatten per exam', () {
    final list = MarksSheetRef.listFromJson([
      {
        'exam': {'id': 'e1', 'name': 'Unit Test 1'},
        'sheets': [
          {'examSubjectId': 'es1', 'classId': 'c8', 'className': 'Class 8', 'subject': {'id': 'm', 'name': 'Mathematics'}, 'section': {'id': 's8a', 'label': '8-A'}, 'teacher': 'Priya', 'entered': 3, 'total': 25, 'locked': false},
        ],
      },
    ]);
    expect(list.single.sectionLabel, '8-A');
    expect(list.single.examName, 'Unit Test 1');
  });

  test('attendance register and history', () {
    final r = AttendanceRegister.fromJson({
      'section': {'id': 's1', 'label': '8-A', 'classTeacher': 'Priya'},
      'date': '2026-10-09',
      'status': 'NOT_TAKEN',
      'submittedAt': null,
      'takenBy': null,
      'editable': true,
      'lockedReason': null,
      'isWeeklyOff': false,
      'students': [{'studentId': 'x', 'name': 'Aarav', 'rollNo': 1, 'admissionNo': '1001', 'status': null, 'remark': null}],
      'counts': {'PRESENT': 0, 'ABSENT': 0, 'LATE': 0, 'HALF_DAY': 0, 'LEAVE': 0, 'unmarked': 1},
    });
    expect(r.students.single.status, isNull);
    final h = AttendanceHistory.fromJson({'studentId': 'x', 'from': '2026-10-01', 'to': '2026-10-31', 'counts': {'PRESENT': 3, 'ABSENT': 1}, 'percentPresent': 75, 'days': [{'date': '2026-10-05', 'status': 'ABSENT', 'remark': null}]});
    expect(h.days['2026-10-05'], 'ABSENT');
    expect(h.percentPresent, 75.0);
  });

  test('term result: weighted subjects and how it was worked out', () {
    final t = TermResult.fromJson({
      'term': {'id': 't1', 'name': 'Term 1', 'publishedAt': '2026-10-09T00:00:00Z', 'components': [{'name': 'Unit Test 1', 'weight': 20}, {'name': 'Half-Yearly', 'weight': 80}]},
      'result': {
        'studentId': 's1', 'name': 'Rahul', 'admissionNo': '1', 'rollNo': 1, 'section': {'id': 'x', 'label': '8-A'},
        'subjects': [{'subject': {'id': 'm', 'name': 'Mathematics'}, 'components': [], 'percent': 82, 'grade': 'A2', 'passed': true}],
        'percentage': 75.7, 'grade': 'B1', 'status': 'PASS', 'rankInSection': 1,
      },
    });
    expect(t.how, 'Unit Test 1 20% + Half-Yearly 80%');
    expect(t.subjects.single.percent, 82.0);
    expect(t.percentage, 75.7);
  });
}
