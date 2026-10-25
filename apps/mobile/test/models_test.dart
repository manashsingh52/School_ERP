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

  test('attendance: session totals and months', () {
    final h = AttendanceHistory.fromJson({
      'studentId': 'c1', 'from': '2026-04-01', 'to': '2026-10-13',
      'counts': {'PRESENT': 17, 'ABSENT': 3, 'LATE': 1, 'HALF_DAY': 0, 'LEAVE': 0, 'unmarked': 0},
      'percentPresent': 85.7,
      'summary': {'conducted': 21, 'attended': 18, 'missed': 3, 'onLeave': 0, 'percentPresent': 85.7},
      'months': [{'month': '2026-10', 'conducted': 7, 'attended': 4, 'missed': 3, 'onLeave': 0, 'percentPresent': 57.1}],
      'days': [{'date': '2026-10-02', 'status': 'ABSENT', 'remark': 'Fever'}],
    });
    expect(h.summary.conducted, 21);
    expect(h.summary.missed, 3);
    expect(h.months.single.month, '2026-10');
    expect(h.remarks['2026-10-02'], 'Fever');
  });

  test('performance: radar subjects with their tests', () {
    final p = Performance.fromJson({
      'studentId': 'c1', 'overallPct': 82.5,
      'exams': [{'examId': 'e1', 'name': 'Unit Test 1', 'term': 'Term 1', 'startDate': '2026-07-14', 'percentage': 90, 'grade': 'A2', 'rankInSection': 1, 'sectionAveragePct': 55}],
      'subjects': [
        {'subject': {'id': 'm', 'name': 'Mathematics'}, 'averagePct': 83.3, 'sectionAveragePct': 57.5, 'trend': 'down', 'exams': [
          {'examId': 'e1', 'examName': 'Unit Test 1', 'marks': 45, 'maxMarks': 50, 'percent': 90, 'grade': 'A2', 'absent': false, 'exempt': false, 'passed': true, 'sectionAveragePct': 55},
        ]},
      ],
    });
    expect(p.overallPct, 82.5);
    expect(p.subjects.single.trend, 'down');
    expect(p.subjects.single.exams.single.marks, 45.0);
    expect(p.exams.single.sectionAveragePct, 55.0);
  });

  test('messages, meetings and reminders', () {
    final c = Conversation.fromJson({
      'id': 'c1', 'student': {'id': 's1', 'name': 'Rahul Kumar', 'classLabel': '8-A'},
      'parent': {'memberId': 'p', 'name': 'Raj Kumar'}, 'staff': null, 'category': 'COMPLAINT', 'subject': 'Bus late', 'status': 'OPEN',
      'lastMessageAt': '2026-10-13T08:00:00Z', 'lastMessage': {'body': 'Late again', 'senderName': 'Raj Kumar', 'fromMe': true}, 'unread': false,
      'myRole': 'PARENT', 'canChangeStatus': false, 'createdAt': '2026-10-13T08:00:00Z', 'resolvedAt': null,
      'messages': [{'id': 'm1', 'body': 'Late again', 'sender': {'memberId': 'p', 'name': 'Raj Kumar', 'side': 'PARENT'}, 'fromMe': true, 'seen': true, 'createdAt': '2026-10-13T08:00:00Z'}],
    });
    expect(c.otherName, 'School office');
    expect(c.lastMessage, 'You: Late again');
    expect(c.messages.single.seen, isTrue);

    final m = Meeting.fromJson({
      'id': 'mt', 'student': {'id': 's1', 'name': 'Rahul Kumar', 'classLabel': '8-A'}, 'organizer': {'memberId': 't', 'name': 'Priya Sharma'},
      'title': 'Progress chat', 'agenda': null, 'category': 'ACADEMIC', 'scheduledAt': '2026-10-14T11:00:00.000Z', 'durationMinutes': 20,
      'status': 'SCHEDULED', 'cancelReason': null, 'joinUrl': 'https://meet.jit.si/Bastaa-abc', 'joinable': false, 'canManage': false, 'createdAt': '2026-10-13T08:00:00Z',
    });
    expect(m.joinUrl, startsWith('https://meet.jit.si/'));
    expect(m.scheduledAt.toUtc().hour, 11);

    final r = Reminder.fromJson({
      'id': 'r', 'title': 'Pick up Rahul', 'notes': 'Gate 2', 'remindAt': '2026-10-14T08:00:00.000Z', 'repeat': 'WEEKDAYS',
      'student': {'id': 's1', 'name': 'Rahul Kumar'}, 'completedAt': null, 'lastFiredAt': null, 'createdAt': '2026-10-13T08:00:00Z',
    });
    expect(r.studentName, 'Rahul Kumar');
    expect(reminderRepeatLabel[r.repeat], 'Monday to Saturday');
  });

  test('message contacts: subject teachers, and who is on the app', () {
    final list = [
      {'memberId': 'm1', 'name': 'Priya Sharma', 'role': 'Class teacher, Mathematics', 'subjects': ['Mathematics'], 'available': true},
      {'memberId': null, 'name': 'Vikram Shah', 'role': 'Science', 'subjects': ['Science'], 'available': false},
      {'memberId': null, 'name': 'School office', 'role': 'Principal and office staff', 'subjects': <String>[], 'available': true},
    ].map(MessageContact.fromJson).toList();
    expect(list.where((c) => c.isTeacher).map((c) => c.name), ['Priya Sharma', 'Vikram Shah']);
    expect(list[1].available, isFalse);
    expect(list[2].isOffice, isTrue);
    expect(list[0].subjects, ['Mathematics']);
  });

  test('calendar: spans, papers and days off', () {
    final v = CalendarItem.fromJson({'id': 'e1', 'source': 'CALENDAR', 'kind': 'VACATION', 'title': 'Diwali break', 'description': null, 'startDate': '2026-11-07', 'endDate': '2026-11-10', 'audience': 'Whole school', 'examId': null, 'time': null, 'canEdit': false});
    expect(v.days, 4);
    expect(v.covers('2026-11-09'), isTrue);
    expect(v.covers('2026-11-11'), isFalse);
    expect(v.isDayOff, isTrue);
    final p = CalendarItem.fromJson({'id': 'p1', 'source': 'PAPER', 'kind': 'EXAM', 'title': 'Mathematics paper', 'description': 'Unit Test 3', 'startDate': '2026-11-24', 'endDate': '2026-11-24', 'audience': '8', 'examId': 'x', 'time': '09:00–10:00', 'canEdit': false});
    expect(p.time, '09:00–10:00');
    expect(p.isDayOff, isFalse);
  });

  test('certificate: achievement with position, participation without', () {
    final a = Certificate.fromJson({
      'id': 'c1', 'serialNo': 'CERT/2026-27/0001', 'kind': 'ACHIEVEMENT', 'eventName': 'Quiz', 'eventDate': '2026-10-20', 'position': '1st place', 'note': null,
      'student': {'id': 's1', 'name': 'Ananya Mishra', 'classLabel': 'Class 5 - B'}, 'issuedBy': 'Priya Sharma', 'createdAt': '2026-10-21T06:00:00.000Z', 'canDelete': false,
    });
    expect(a.isAchievement, isTrue);
    expect(a.position, '1st place');
    expect(a.studentName, 'Ananya Mishra');
    expect(a.classLabel, 'Class 5 - B');
    final p = Certificate.fromJson({
      'id': 'c2', 'serialNo': 'CERT/2026-27/0002', 'kind': 'PARTICIPATION', 'eventName': 'Sports Day', 'eventDate': '2026-10-05', 'position': null, 'note': 'Inter-house',
      'student': {'id': 's1', 'name': 'Ananya Mishra', 'classLabel': null}, 'issuedBy': 'Admin', 'createdAt': '2026-10-05T06:00:00.000Z', 'canDelete': true,
    });
    expect(p.isAchievement, isFalse);
    expect(p.position, isNull);
    expect(p.canDelete, isTrue);
  });
}
