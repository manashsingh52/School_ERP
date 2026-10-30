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
  factory School.fromJson(Json j) => School(id: j['id'] as String, slug: j['slug'] as String, name: j['name'] as String, accentColor: j['accentColor'] as String? ?? '#0F5338', logoUrl: _s(j['logoUrl']));
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
  AppConfig({required this.minVersion, required this.latestVersion, required this.paymentsDriver, this.androidUrl, this.iosUrl, this.otpLogin = true});
  factory AppConfig.fromJson(Json j) => AppConfig(
        minVersion: j['minVersion'] as String,
        latestVersion: j['latestVersion'] as String,
        paymentsDriver: j['paymentsDriver'] as String,
        androidUrl: _s((j['storeUrls'] as Json?)?['android']),
        iosUrl: _s((j['storeUrls'] as Json?)?['ios']),
        otpLogin: j['otpLogin'] as bool? ?? true,
      );
  final String minVersion, latestVersion, paymentsDriver;
  final String? androidUrl, iosUrl;
  /// False when codes by SMS aren't set up: password or a code from the school office.
  final bool otpLogin;
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

/// Classes held / attended / missed for a range (a month or the whole session).
class AttendanceTally {
  AttendanceTally({required this.conducted, required this.attended, required this.missed, required this.onLeave, required this.percentPresent, this.month});
  factory AttendanceTally.fromJson(Json j) => AttendanceTally(
        conducted: _i(j['conducted']),
        attended: _i(j['attended']),
        missed: _i(j['missed']),
        onLeave: _i(j['onLeave']),
        percentPresent: _dn(j['percentPresent']),
        month: _s(j['month']),
      );
  final int conducted, attended, missed, onLeave;
  final double? percentPresent;
  /// "2026-10" for a month row.
  final String? month;
}

class AttendanceHistory {
  AttendanceHistory({required this.percentPresent, required this.counts, required this.days, required this.summary, required this.months, this.remarks = const {}});
  factory AttendanceHistory.fromJson(Json j) => AttendanceHistory(
        percentPresent: _dn(j['percentPresent']),
        counts: (j['counts'] as Map).map((k, v) => MapEntry(k as String, _i(v))),
        days: {for (final d in _list(j['days'])) d['date'] as String: d['status'] as String},
        remarks: {for (final d in _list(j['days'])) if (d['remark'] != null) d['date'] as String: d['remark'] as String},
        summary: j['summary'] == null ? AttendanceTally(conducted: 0, attended: 0, missed: 0, onLeave: 0, percentPresent: _dn(j['percentPresent'])) : AttendanceTally.fromJson(j['summary'] as Json),
        months: _list(j['months']).map(AttendanceTally.fromJson).toList(),
      );
  final double? percentPresent;
  final Map<String, int> counts;
  /// date → status
  final Map<String, String> days;
  final Map<String, String> remarks;
  final AttendanceTally summary;
  final List<AttendanceTally> months;
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

List<({String area, String grade})> _co(Object? v) => _list(v).map((c) => (area: c['area'] as String, grade: c['grade'] as String)).toList();

class StudentResult {
  StudentResult({required this.examId, required this.examName, this.term, required this.percentage, this.grade, required this.status, this.rankInSection, required this.subjects, required this.hasReportCard, this.coScholastic = const []});
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
      coScholastic: _co(j['coScholastic']),
    );
  }
  final List<({String area, String grade})> coScholastic;
  final String examId, examName, status;
  final String? term, grade;
  final double percentage;
  final int? rankInSection;
  final List<SubjectResult> subjects;
  final bool hasReportCard;
}

/// A consolidated term (several exams with weights) for one child.
class TermResult {
  TermResult({required this.termId, required this.name, required this.how, required this.percentage, this.grade, required this.status, this.rankInSection, required this.subjects, this.coScholastic = const []});
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
      coScholastic: _co(j['coScholastic']),
    );
  }
  final List<({String area, String grade})> coScholastic;
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

/// `CertificateItem` in packages/contracts.
class Certificate {
  Certificate({required this.id, required this.serialNo, required this.kind, required this.eventName, required this.eventDate, this.position, this.note, required this.studentId, required this.studentName, this.classLabel, required this.issuedBy, required this.canDelete});
  factory Certificate.fromJson(Json j) {
    final st = j['student'] as Json;
    return Certificate(
      id: j['id'] as String,
      serialNo: j['serialNo'] as String,
      kind: j['kind'] as String,
      eventName: j['eventName'] as String,
      eventDate: j['eventDate'] as String,
      position: _s(j['position']),
      note: _s(j['note']),
      studentId: st['id'] as String,
      studentName: st['name'] as String,
      classLabel: _s(st['classLabel']),
      issuedBy: j['issuedBy'] as String,
      canDelete: j['canDelete'] as bool? ?? false,
    );
  }
  final String id, serialNo, kind, eventName, eventDate, studentId, studentName, issuedBy;
  final String? position, note, classLabel;
  final bool canDelete;
  bool get isAchievement => kind == 'ACHIEVEMENT';
}

class SessionItem {
  SessionItem({required this.id, required this.platform, this.deviceName, required this.lastUsedAt, required this.current});
  factory SessionItem.fromJson(Json j) => SessionItem(id: j['id'] as String, platform: j['platform'] as String, deviceName: _s(j['deviceName']), lastUsedAt: j['lastUsedAt'] as String, current: j['current'] as bool? ?? false);
  final String id, platform, lastUsedAt;
  final String? deviceName;
  final bool current;
}

// ---------------------------------------------------------------- performance (results charts)

class PerformanceExam {
  PerformanceExam({required this.examId, required this.name, required this.percentage, this.grade, this.rankInSection, this.sectionAveragePct});
  factory PerformanceExam.fromJson(Json j) => PerformanceExam(
        examId: j['examId'] as String,
        name: j['name'] as String,
        percentage: _dn(j['percentage']) ?? 0,
        grade: _s(j['grade']),
        rankInSection: _in(j['rankInSection']),
        sectionAveragePct: _dn(j['sectionAveragePct']),
      );
  final String examId, name;
  final double percentage;
  final String? grade;
  final int? rankInSection;
  final double? sectionAveragePct;
}

class PerformanceSubjectExam {
  PerformanceSubjectExam({required this.examId, required this.examName, this.marks, required this.maxMarks, this.percent, this.grade, required this.absent, required this.exempt, this.passed, this.sectionAveragePct});
  factory PerformanceSubjectExam.fromJson(Json j) => PerformanceSubjectExam(
        examId: j['examId'] as String,
        examName: j['examName'] as String,
        marks: _dn(j['marks']),
        maxMarks: _dn(j['maxMarks']) ?? 0,
        percent: _dn(j['percent']),
        grade: _s(j['grade']),
        absent: j['absent'] as bool? ?? false,
        exempt: j['exempt'] as bool? ?? false,
        passed: j['passed'] as bool?,
        sectionAveragePct: _dn(j['sectionAveragePct']),
      );
  final String examId, examName;
  final double? marks, percent, sectionAveragePct;
  final double maxMarks;
  final String? grade;
  final bool absent, exempt;
  final bool? passed;
}

class PerformanceSubject {
  PerformanceSubject({required this.id, required this.name, this.averagePct, this.sectionAveragePct, this.trend, required this.exams});
  factory PerformanceSubject.fromJson(Json j) => PerformanceSubject(
        id: (j['subject'] as Json)['id'] as String,
        name: (j['subject'] as Json)['name'] as String,
        averagePct: _dn(j['averagePct']),
        sectionAveragePct: _dn(j['sectionAveragePct']),
        trend: _s(j['trend']),
        exams: _list(j['exams']).map(PerformanceSubjectExam.fromJson).toList(),
      );
  final String id, name;
  final double? averagePct, sectionAveragePct;
  /// up · down · steady
  final String? trend;
  final List<PerformanceSubjectExam> exams;
}

class Performance {
  Performance({this.overallPct, required this.exams, required this.subjects});
  factory Performance.fromJson(Json j) => Performance(
        overallPct: _dn(j['overallPct']),
        exams: _list(j['exams']).map(PerformanceExam.fromJson).toList(),
        subjects: _list(j['subjects']).map(PerformanceSubject.fromJson).toList(),
      );
  final double? overallPct;
  final List<PerformanceExam> exams;
  final List<PerformanceSubject> subjects;
}

// ---------------------------------------------------------------- messages, meetings, reminders

const conversationCategories = ['GENERAL', 'ACADEMIC', 'ATTENDANCE', 'HOMEWORK', 'BEHAVIOUR', 'COMPLAINT', 'SUGGESTION', 'OTHER'];
const conversationCategoryLabel = {
  'GENERAL': 'General query',
  'ACADEMIC': 'Academic issue',
  'ATTENDANCE': 'Attendance issue',
  'HOMEWORK': 'Homework',
  'BEHAVIOUR': 'Behaviour',
  'COMPLAINT': 'Complaint',
  'SUGGESTION': 'Suggestion or feedback',
  'OTHER': 'Other concern',
};
const conversationStatusLabel = {'OPEN': 'Open', 'IN_PROGRESS': 'In progress', 'RESOLVED': 'Resolved'};

class StudentRef {
  StudentRef({required this.id, required this.name, this.classLabel});
  factory StudentRef.fromJson(Json j) => StudentRef(id: j['id'] as String, name: j['name'] as String, classLabel: _s(j['classLabel']));
  final String id, name;
  final String? classLabel;
}

class Party {
  Party({required this.memberId, required this.name});
  factory Party.fromJson(Json j) => Party(memberId: j['memberId'] as String, name: j['name'] as String);
  final String memberId, name;
}

class ChatMessage {
  ChatMessage({required this.id, required this.body, required this.senderName, required this.fromMe, required this.seen, required this.createdAt});
  factory ChatMessage.fromJson(Json j) => ChatMessage(
        id: j['id'] as String,
        body: j['body'] as String,
        senderName: (j['sender'] as Json)['name'] as String,
        fromMe: j['fromMe'] as bool? ?? false,
        seen: j['seen'] as bool? ?? false,
        createdAt: j['createdAt'] as String,
      );
  final String id, body, senderName, createdAt;
  final bool fromMe, seen;
}

class Conversation {
  Conversation({required this.id, required this.student, required this.parent, this.staff, required this.category, required this.subject, required this.status, required this.lastMessageAt, this.lastMessage, required this.unread, required this.myRole, required this.canChangeStatus, this.messages = const []});
  factory Conversation.fromJson(Json j) {
    final last = j['lastMessage'] as Json?;
    return Conversation(
      id: j['id'] as String,
      student: StudentRef.fromJson(j['student'] as Json),
      parent: Party.fromJson(j['parent'] as Json),
      staff: j['staff'] == null ? null : Party.fromJson(j['staff'] as Json),
      category: j['category'] as String,
      subject: j['subject'] as String,
      status: j['status'] as String,
      lastMessageAt: j['lastMessageAt'] as String,
      lastMessage: last == null ? null : '${last['fromMe'] == true ? 'You' : last['senderName']}: ${last['body']}',
      unread: j['unread'] as bool? ?? false,
      myRole: j['myRole'] as String,
      canChangeStatus: j['canChangeStatus'] as bool? ?? false,
      messages: _list(j['messages']).map(ChatMessage.fromJson).toList(),
    );
  }
  final String id, category, subject, status, lastMessageAt, myRole;
  final StudentRef student;
  final Party parent;
  final Party? staff;
  final String? lastMessage;
  final bool unread, canChangeStatus;
  final List<ChatMessage> messages;

  /// The other side, as I see it.
  String get otherName => myRole == 'PARENT' ? (staff?.name ?? 'School office') : parent.name;
}

class MessageContact {
  MessageContact({this.memberId, required this.name, required this.role, this.subjects = const [], this.available = true});
  factory MessageContact.fromJson(Json j) => MessageContact(
        memberId: _s(j['memberId']),
        name: j['name'] as String,
        role: j['role'] as String,
        subjects: ((j['subjects'] as List?) ?? const []).cast<String>(),
        available: j['available'] as bool? ?? true,
      );
  /// null = the school office (or someone without an app login — see [available]).
  final String? memberId;
  final String name, role;
  /// What this teacher teaches the child.
  final List<String> subjects;
  /// False until the school invites them to the app; they can't be written to yet.
  final bool available;

  bool get isOffice => memberId == null && available;
  bool get isTeacher => subjects.isNotEmpty || role.startsWith('Class teacher');
}

class Meeting {
  Meeting({required this.id, required this.student, required this.organizer, required this.title, this.agenda, required this.category, required this.scheduledAt, required this.durationMinutes, required this.status, this.cancelReason, this.joinUrl, required this.joinable, required this.canManage});
  factory Meeting.fromJson(Json j) => Meeting(
        id: j['id'] as String,
        student: StudentRef.fromJson(j['student'] as Json),
        organizer: Party.fromJson(j['organizer'] as Json),
        title: j['title'] as String,
        agenda: _s(j['agenda']),
        category: j['category'] as String,
        scheduledAt: DateTime.parse(j['scheduledAt'] as String).toLocal(),
        durationMinutes: _i(j['durationMinutes']),
        status: j['status'] as String,
        cancelReason: _s(j['cancelReason']),
        joinUrl: _s(j['joinUrl']),
        joinable: j['joinable'] as bool? ?? false,
        canManage: j['canManage'] as bool? ?? false,
      );
  final String id, title, category, status;
  final StudentRef student;
  final Party organizer;
  final String? agenda, cancelReason, joinUrl;
  final DateTime scheduledAt;
  final int durationMinutes;
  final bool joinable, canManage;
}

const reminderRepeatLabel = {'NONE': 'Once', 'DAILY': 'Every day', 'WEEKDAYS': 'Monday to Saturday', 'WEEKLY': 'Every week'};

class Reminder {
  Reminder({required this.id, required this.title, this.notes, required this.remindAt, required this.repeat, this.studentId, this.studentName, this.completedAt});
  factory Reminder.fromJson(Json j) => Reminder(
        id: j['id'] as String,
        title: j['title'] as String,
        notes: _s(j['notes']),
        remindAt: DateTime.parse(j['remindAt'] as String).toLocal(),
        repeat: j['repeat'] as String,
        studentId: _s((j['student'] as Map?)?['id']),
        studentName: _s((j['student'] as Map?)?['name']),
        completedAt: _s(j['completedAt']),
      );
  final String id, title, repeat;
  final String? notes, studentId, studentName, completedAt;
  final DateTime remindAt;
}

// ---------------------------------------------------------------- school calendar

const calendarKindLabel = {'HOLIDAY': 'Holiday', 'VACATION': 'Vacation', 'EVENT': 'Event', 'PTM': 'Parent–teacher meeting', 'EXAM': 'Exam', 'OTHER': 'Other'};

class CalendarItem {
  CalendarItem({required this.id, required this.source, required this.kind, required this.title, this.description, required this.startDate, required this.endDate, required this.audience, this.time});
  factory CalendarItem.fromJson(Json j) => CalendarItem(
        id: j['id'] as String,
        source: j['source'] as String,
        kind: j['kind'] as String,
        title: j['title'] as String,
        description: _s(j['description']),
        startDate: j['startDate'] as String,
        endDate: j['endDate'] as String,
        audience: j['audience'] as String,
        time: _s(j['time']),
      );
  /// CALENDAR · EXAM (the whole exam) · PAPER (one of the child's papers).
  final String id, source, kind, title, startDate, endDate, audience;
  final String? description, time;

  bool covers(String date) => startDate.compareTo(date) <= 0 && endDate.compareTo(date) >= 0;
  int get days => DateTime.parse(endDate).difference(DateTime.parse(startDate)).inDays + 1;
  bool get isDayOff => kind == 'HOLIDAY' || kind == 'VACATION';
}

// ---------------------------------------------------------------- student ID card

class CardGuardian {
  CardGuardian({required this.name, required this.relation, required this.isPrimary, this.phone});
  factory CardGuardian.fromJson(Json j) => CardGuardian(name: j['name'] as String, relation: j['relation'] as String? ?? 'GUARDIAN', isPrimary: j['isPrimary'] as bool? ?? false, phone: _s(j['phone']));
  final String name, relation;
  final bool isPrimary;
  final String? phone;
}

/// `GET /v1/students/:id` (StudentDetail): the fields the digital ID card shows.
class StudentCard {
  StudentCard({required this.id, required this.admissionNo, required this.firstName, required this.guardians, this.lastName, this.className, this.sectionName, this.rollNo, this.dateOfBirth, this.bloodGroup, this.photoUrl});
  factory StudentCard.fromJson(Json j) => StudentCard(
        id: j['id'] as String,
        admissionNo: j['admissionNo'] as String,
        firstName: j['firstName'] as String,
        lastName: _s(j['lastName']),
        className: _s(j['className']),
        sectionName: _s(j['sectionName']),
        rollNo: _in(j['rollNo']),
        dateOfBirth: _s(j['dateOfBirth']),
        bloodGroup: _s(j['bloodGroup']),
        photoUrl: _s(j['photoUrl']),
        guardians: _list(j['guardians']).map(CardGuardian.fromJson).toList(),
      );
  final String id, admissionNo, firstName;
  final String? lastName, className, sectionName, dateOfBirth, bloodGroup, photoUrl;
  final int? rollNo;
  final List<CardGuardian> guardians;

  String get name => [firstName, lastName].whereType<String>().join(' ');
  CardGuardian? get primaryGuardian => guardians.where((g) => g.isPrimary).firstOrNull ?? guardians.firstOrNull;
}
