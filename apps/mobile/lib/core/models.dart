// Typed views of the API responses the app uses. They mirror packages/contracts (TypeScript);
// test/models_test.dart parses real-shaped JSON so a drift shows up in CI.

typedef Json = Map<String, dynamic>;

String? _s(Object? v) => v as String?;
int _i(Object? v) => (v as num?)?.toInt() ?? 0;
int? _in(Object? v) => (v as num?)?.toInt();
double? _dn(Object? v) => (v as num?)?.toDouble();
List<Json> _list(Object? v) => (v as List? ?? const []).cast<Json>();

// ---------------------------------------------------------------- auth & me

class School {
  School({required this.id, required this.slug, required this.name, required this.accentColor, this.logoUrl});
  factory School.fromJson(Json j) => School(id: j['id'] as String, slug: j['slug'] as String, name: j['name'] as String, accentColor: j['accentColor'] as String? ?? '#2F6FEB', logoUrl: _s(j['logoUrl']));
  final String id, slug, name, accentColor;
  final String? logoUrl;
}

class Membership {
  Membership({required this.id, required this.school, required this.roleKeys, required this.roleNames});
  factory Membership.fromJson(Json j) => Membership(
        id: j['membershipId'] as String,
        school: School.fromJson(j['school'] as Json),
        roleKeys: _list(j['roles']).map((r) => r['key'] as String).toList(),
        roleNames: _list(j['roles']).map((r) => r['name'] as String).toList(),
      );
  final String id;
  final School school;
  final List<String> roleKeys, roleNames;
}

class UserInfo {
  UserInfo({required this.id, required this.name, this.phone, this.email});
  factory UserInfo.fromJson(Json j) => UserInfo(id: j['id'] as String, name: j['name'] as String, phone: _s(j['phone']), email: _s(j['email']));
  final String id, name;
  final String? phone, email;
}

class Child {
  Child({required this.id, required this.name, required this.firstName, this.classLabel, this.sectionId});
  factory Child.fromJson(Json j) => Child(id: j['id'] as String, name: j['name'] as String, firstName: j['firstName'] as String, classLabel: _s(j['classLabel']), sectionId: _s(j['sectionId']));
  final String id, name, firstName;
  final String? classLabel, sectionId;
}

/// `GET /v1/me` for a school-scoped session.
class Me {
  Me({required this.user, required this.membership, required this.permissions, required this.teacherId, required this.children, required this.memberships});
  factory Me.fromJson(Json j) {
    final m = j['membership'] as Json?;
    return Me(
      user: UserInfo.fromJson(j['user'] as Json),
      membership: m == null ? null : Membership.fromJson(m),
      permissions: ((m?['permissions'] as Map?) ?? const {}).map((k, v) => MapEntry(k as String, v as String)),
      teacherId: _s(m?['teacherId']),
      children: _list(m?['children']).map(Child.fromJson).toList(),
      memberships: _list(j['memberships']).map(Membership.fromJson).toList(),
    );
  }
  final UserInfo user;
  final Membership? membership;
  final Map<String, String> permissions;
  final String? teacherId;
  final List<Child> children;
  final List<Membership> memberships;

  bool can(String permission, [List<String>? scopes]) {
    final s = permissions[permission];
    return s != null && (scopes == null || scopes.contains(s));
  }

  bool get isParent => children.isNotEmpty || membership?.roleKeys.contains('parent') == true;
  bool get isTeacher => teacherId != null || can('attendance.mark', ['ASSIGNED', 'ALL']);
}

class AppConfig {
  AppConfig({required this.minVersion, required this.latestVersion, required this.paymentsDriver, this.androidUrl, this.iosUrl});
  factory AppConfig.fromJson(Json j) => AppConfig(
        minVersion: j['minVersion'] as String,
        latestVersion: j['latestVersion'] as String,
        paymentsDriver: j['paymentsDriver'] as String,
        androidUrl: _s((j['storeUrls'] as Json?)?['android']),
        iosUrl: _s((j['storeUrls'] as Json?)?['ios']),
      );
  final String minVersion, latestVersion, paymentsDriver;
  final String? androidUrl, iosUrl;
}

// ---------------------------------------------------------------- timetable, attendance, homework

class Slot {
  Slot({required this.periodName, required this.startTime, required this.endTime, required this.isBreak, this.section, this.subject, this.teacher, this.room});
  factory Slot.fromJson(Json j) => Slot(
        periodName: j['periodName'] as String,
        startTime: j['startTime'] as String,
        endTime: j['endTime'] as String,
        isBreak: j['isBreak'] as bool? ?? false,
        section: _s((j['section'] as Json?)?['label']),
        subject: _s((j['subject'] as Json?)?['name']),
        teacher: _s((j['teacher'] as Json?)?['name']),
        room: _s(j['room']),
      );
  final String periodName, startTime, endTime;
  final bool isBreak;
  final String? section, subject, teacher, room;
}

class TodaySchedule {
  TodaySchedule({required this.date, required this.isWeeklyOff, required this.slots});
  factory TodaySchedule.fromJson(Json j) => TodaySchedule(date: j['date'] as String, isWeeklyOff: j['isWeeklyOff'] as bool? ?? false, slots: _list(j['slots']).map(Slot.fromJson).toList());
  final String date;
  final bool isWeeklyOff;
  final List<Slot> slots;
}

const attendanceStatuses = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE'];

class AttendanceHistory {
  AttendanceHistory({required this.percentPresent, required this.counts, required this.days});
  factory AttendanceHistory.fromJson(Json j) => AttendanceHistory(
        percentPresent: _dn(j['percentPresent']),
        counts: (j['counts'] as Map).map((k, v) => MapEntry(k as String, _i(v))),
        days: {for (final d in _list(j['days'])) d['date'] as String: d['status'] as String},
      );
  final double? percentPresent;
  final Map<String, int> counts;
  /// date → status
  final Map<String, String> days;
}

class RegisterStudent {
  RegisterStudent({required this.studentId, required this.name, required this.rollNo, required this.admissionNo, this.status});
  factory RegisterStudent.fromJson(Json j) => RegisterStudent(studentId: j['studentId'] as String, name: j['name'] as String, rollNo: _in(j['rollNo']), admissionNo: j['admissionNo'] as String, status: _s(j['status']));
  final String studentId, name, admissionNo;
  final int? rollNo;
  final String? status;
}

class AttendanceRegister {
  AttendanceRegister({required this.sectionId, required this.label, required this.date, required this.status, required this.editable, this.lockedReason, required this.isWeeklyOff, required this.students});
  factory AttendanceRegister.fromJson(Json j) => AttendanceRegister(
        sectionId: (j['section'] as Json)['id'] as String,
        label: (j['section'] as Json)['label'] as String,
        date: j['date'] as String,
        status: j['status'] as String,
        editable: j['editable'] as bool? ?? false,
        lockedReason: _s(j['lockedReason']),
        isWeeklyOff: j['isWeeklyOff'] as bool? ?? false,
        students: _list(j['students']).map(RegisterStudent.fromJson).toList(),
      );
  final String sectionId, label, date, status;
  final bool editable, isWeeklyOff;
  final String? lockedReason;
  final List<RegisterStudent> students;
}

class SectionOverview {
  SectionOverview({required this.sectionId, required this.label, required this.status, required this.canMark, required this.students, required this.present});
  factory SectionOverview.fromJson(Json j) => SectionOverview(sectionId: j['sectionId'] as String, label: j['label'] as String, status: j['status'] as String, canMark: j['canMark'] as bool? ?? false, students: _i(j['students']), present: _i(j['present']));
  final String sectionId, label, status;
  final bool canMark;
  final int students, present;
}

class Attachment {
  Attachment({required this.id, required this.name, required this.mimeType});
  factory Attachment.fromJson(Json j) => Attachment(id: j['id'] as String, name: j['originalName'] as String, mimeType: j['mimeType'] as String);
  final String id, name, mimeType;
}

class Homework {
  Homework({required this.id, required this.title, this.description, required this.subject, required this.teacher, required this.sections, this.dueDate, required this.status, required this.attachments, this.progress, this.feedback});
  factory Homework.fromJson(Json j) => Homework(
        id: j['id'] as String,
        title: j['title'] as String,
        description: _s(j['description']),
        subject: (j['subject'] as Json)['name'] as String,
        teacher: (j['teacher'] as Json)['name'] as String,
        sections: _list(j['sections']).map((s) => s['label'] as String).toList(),
        dueDate: _s(j['dueDate']),
        status: j['status'] as String,
        attachments: _list(j['attachments']).map(Attachment.fromJson).toList(),
        progress: _s((j['submission'] as Json?)?['status']),
        feedback: _s((j['submission'] as Json?)?['feedback']),
      );
  final String id, title, subject, teacher, status;
  final String? description, dueDate;
  /// Parents only: ASSIGNED | VIEWED | SUBMITTED | REVIEWED, and the teacher's note.
  final String? progress, feedback;
  final List<String> sections;
  final List<Attachment> attachments;
}

// ---------------------------------------------------------------- exams

class SubjectResult {
  SubjectResult({required this.subject, required this.maxMarks, this.marks, required this.absent, required this.exempt, this.grade, this.passed});
  factory SubjectResult.fromJson(Json j) => SubjectResult(
        subject: (j['subject'] as Json)['name'] as String,
        maxMarks: _dn(j['maxMarks']) ?? 0,
        marks: _dn(j['marks']),
        absent: j['absent'] as bool? ?? false,
        exempt: j['exempt'] as bool? ?? false,
        grade: _s(j['grade']),
        passed: j['passed'] as bool?,
      );
  final String subject;
  final double maxMarks;
  final double? marks;
  final bool absent, exempt;
  final String? grade;
  final bool? passed;
}

class StudentResult {
  StudentResult({required this.examId, required this.examName, this.term, required this.percentage, this.grade, required this.status, this.rankInSection, required this.subjects, required this.hasReportCard});
  factory StudentResult.fromJson(Json j) {
    final r = j['result'] as Json;
    return StudentResult(
      examId: (j['exam'] as Json)['id'] as String,
      examName: (j['exam'] as Json)['name'] as String,
      term: _s((j['exam'] as Json)['term']),
      percentage: _dn(r['percentage']) ?? 0,
      grade: _s(r['grade']),
      status: r['status'] as String,
      rankInSection: _in(r['rankInSection']),
      subjects: _list(r['subjects']).map(SubjectResult.fromJson).toList(),
      hasReportCard: j['reportCard'] != null,
    );
  }
  final String examId, examName, status;
  final String? term, grade;
  final double percentage;
  final int? rankInSection;
  final List<SubjectResult> subjects;
  final bool hasReportCard;
}

/// A consolidated term (several exams with weights) for one child.
class TermResult {
  TermResult({required this.termId, required this.name, required this.how, required this.percentage, this.grade, required this.status, this.rankInSection, required this.subjects});
  factory TermResult.fromJson(Json j) {
    final t = j['term'] as Json;
    final r = j['result'] as Json;
    return TermResult(
      termId: t['id'] as String,
      name: t['name'] as String,
      how: _list(t['components']).map((c) => '${c['name']} ${c['weight']}%').join(' + '),
      percentage: _dn(r['percentage']),
      grade: _s(r['grade']),
      status: r['status'] as String,
      rankInSection: _in(r['rankInSection']),
      subjects: _list(r['subjects']).map((s) => (name: (s['subject'] as Json)['name'] as String, percent: _dn(s['percent']), grade: _s(s['grade']), passed: s['passed'] as bool?)).toList(),
    );
  }
  final String termId, name, how, status;
  final double? percentage;
  final String? grade;
  final int? rankInSection;
  final List<({String name, double? percent, String? grade, bool? passed})> subjects;
}

class MarksSheetRef {
  MarksSheetRef({required this.examId, required this.examName, required this.examSubjectId, required this.subject, required this.className, required this.sectionId, required this.sectionLabel, required this.entered, required this.total});
  final String examId, examName, examSubjectId, subject, className, sectionId, sectionLabel;
  final int entered, total;

  static List<MarksSheetRef> listFromJson(List<dynamic> data) => [
        for (final g in data.cast<Json>())
          for (final s in _list(g['sheets']))
            MarksSheetRef(
              examId: (g['exam'] as Json)['id'] as String,
              examName: (g['exam'] as Json)['name'] as String,
              examSubjectId: s['examSubjectId'] as String,
              subject: (s['subject'] as Json)['name'] as String,
              className: s['className'] as String,
              sectionId: (s['section'] as Json)['id'] as String,
              sectionLabel: (s['section'] as Json)['label'] as String,
              entered: _i(s['entered']),
              total: _i(s['total']),
            ),
      ];
}

class MarksRow {
  MarksRow({required this.studentId, required this.name, this.rollNo, this.marks, required this.absent, required this.exempt});
  factory MarksRow.fromJson(Json j) => MarksRow(studentId: j['studentId'] as String, name: j['name'] as String, rollNo: _in(j['rollNo']), marks: _dn(j['marks']), absent: j['absent'] as bool? ?? false, exempt: j['exempt'] as bool? ?? false);
  final String studentId, name;
  final int? rollNo;
  double? marks;
  bool absent, exempt;
}

class MarksSheet {
  MarksSheet({required this.examName, required this.subject, required this.sectionLabel, required this.maxMarks, required this.passMarks, required this.editable, this.lockedReason, required this.version, required this.students});
  factory MarksSheet.fromJson(Json j) => MarksSheet(
        examName: (j['exam'] as Json)['name'] as String,
        subject: ((j['examSubject'] as Json)['subject'] as Json)['name'] as String,
        sectionLabel: (j['section'] as Json)['label'] as String,
        maxMarks: _dn((j['examSubject'] as Json)['maxMarks']) ?? 0,
        passMarks: _dn((j['examSubject'] as Json)['passMarks']) ?? 0,
        editable: j['editable'] as bool? ?? false,
        lockedReason: _s(j['lockedReason']),
        version: j['version'] as String,
        students: _list(j['students']).map(MarksRow.fromJson).toList(),
      );
  final String examName, subject, sectionLabel, version;
  final double maxMarks, passMarks;
  final bool editable;
  final String? lockedReason;
  final List<MarksRow> students;
}

// ---------------------------------------------------------------- fees

class Invoice {
  Invoice({required this.id, required this.number, this.installment, required this.dueDate, required this.status, required this.overdue, required this.totalPaise, required this.balancePaise, required this.lateFeePaise});
  factory Invoice.fromJson(Json j) => Invoice(
        id: j['id'] as String,
        number: j['number'] as String,
        installment: _s((j['installment'] as Json?)?['name']),
        dueDate: j['dueDate'] as String,
        status: j['status'] as String,
        overdue: j['overdue'] as bool? ?? false,
        totalPaise: _i(j['totalPaise']),
        balancePaise: _i(j['balancePaise']),
        lateFeePaise: _i(j['lateFeePaise']),
      );
  final String id, number, dueDate, status;
  final String? installment;
  final bool overdue;
  final int totalPaise, balancePaise, lateFeePaise;
  bool get payable => balancePaise > 0 && (status == 'ISSUED' || status == 'PARTIALLY_PAID');
}

class Payment {
  Payment({required this.id, required this.amountPaise, required this.method, required this.status, this.receiptNo, required this.receiptReady, required this.receivedAt});
  factory Payment.fromJson(Json j) => Payment(id: j['id'] as String, amountPaise: _i(j['amountPaise']), method: j['method'] as String, status: j['status'] as String, receiptNo: _s(j['receiptNo']), receiptReady: j['receiptReady'] as bool? ?? false, receivedAt: j['receivedAt'] as String);
  final String id, method, status, receivedAt;
  final int amountPaise;
  final String? receiptNo;
  final bool receiptReady;
}

class FeeStatement {
  FeeStatement({required this.balancePaise, required this.overduePaise, required this.paidPaise, required this.creditPaise, required this.invoices, required this.payments, required this.onlinePayments});
  factory FeeStatement.fromJson(Json j) {
    final t = j['totals'] as Json;
    return FeeStatement(
      balancePaise: _i(t['balancePaise']),
      overduePaise: _i(t['overduePaise']),
      paidPaise: _i(t['paidPaise']),
      creditPaise: _i(t['creditPaise']),
      invoices: _list(j['invoices']).map(Invoice.fromJson).toList(),
      payments: _list(j['payments']).map(Payment.fromJson).toList(),
      onlinePayments: j['onlinePayments'] as bool? ?? false,
    );
  }
  final int balancePaise, overduePaise, paidPaise, creditPaise;
  final List<Invoice> invoices;
  final List<Payment> payments;
  final bool onlinePayments;
}

class OnlineOrder {
  OnlineOrder({required this.providerOrderId, required this.keyId, required this.amountPaise, required this.driver, required this.schoolName, required this.description, required this.prefill});
  factory OnlineOrder.fromJson(Json j) => OnlineOrder(
        providerOrderId: j['providerOrderId'] as String,
        keyId: j['keyId'] as String,
        amountPaise: _i(j['amountPaise']),
        driver: j['driver'] as String,
        schoolName: j['schoolName'] as String,
        description: j['description'] as String,
        prefill: (j['prefill'] as Map? ?? const {}).cast<String, dynamic>(),
      );
  final String providerOrderId, keyId, driver, schoolName, description;
  final int amountPaise;
  final Json prefill;
}

class PaymentResult {
  PaymentResult({required this.status, this.paymentId, this.receiptNo, required this.message});
  factory PaymentResult.fromJson(Json j) => PaymentResult(status: j['status'] as String, paymentId: _s(j['paymentId']), receiptNo: _s(j['receiptNo']), message: j['message'] as String);
  final String status, message;
  final String? paymentId, receiptNo;
}

// ---------------------------------------------------------------- notifications, documents, sessions

class AppNotification {
  AppNotification({required this.id, required this.event, required this.title, required this.body, this.route, this.readAt, required this.createdAt});
  factory AppNotification.fromJson(Json j) => AppNotification(
        id: j['id'] as String,
        event: j['event'] as String,
        title: j['title'] as String,
        body: j['body'] as String,
        route: _s((j['data'] as Map?)?['route']),
        readAt: _s(j['readAt']),
        createdAt: j['createdAt'] as String,
      );
  final String id, event, title, body, createdAt;
  final String? route;
  String? readAt;
}

class DocumentItem {
  DocumentItem({required this.id, required this.title, required this.category, required this.fileName, required this.createdAt});
  factory DocumentItem.fromJson(Json j) => DocumentItem(id: j['id'] as String, title: j['title'] as String, category: j['category'] as String, fileName: (j['file'] as Json)['name'] as String, createdAt: j['createdAt'] as String);
  final String id, title, category, fileName, createdAt;
}

class SessionItem {
  SessionItem({required this.id, required this.platform, this.deviceName, required this.lastUsedAt, required this.current});
  factory SessionItem.fromJson(Json j) => SessionItem(id: j['id'] as String, platform: j['platform'] as String, deviceName: _s(j['deviceName']), lastUsedAt: j['lastUsedAt'] as String, current: j['current'] as bool? ?? false);
  final String id, platform, lastUsedAt;
  final String? deviceName;
  final bool current;
}
