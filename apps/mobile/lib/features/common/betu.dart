import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/i18n.dart';
import '../../core/theme.dart';

/// Betu, the in-app helper. A demo for now: preset questions about the parent or teacher app and
/// canned answers in English and Hindi, with a button to the right tab. Nothing goes to a server.
class _Answer {
  const _Answer(this.id, this.q, this.a, {this.steps = const [], this.tab, this.keys = const []});
  final String id;
  final (String, String) q, a;
  final List<(String, String)> steps;
  /// Bottom-bar tab the answer's button opens.
  final int? tab;
  final List<String> keys;
}

const _parent = [
  _Answer('pay', ('How do I pay school fees?', 'स्कूल फ़ीस कैसे भरूँ?'),
      ('Open Fees, press Pay and finish in any UPI app. The receipt arrives straight away.', 'फ़ीस खोलें, "भरें" दबाएँ और किसी भी UPI ऐप से पूरा करें। रसीद तुरंत मिल जाती है।'),
      tab: 2, keys: ['pay', 'fee', 'upi', 'फ़ीस', 'फीस', 'भुगतान']),
  _Answer('idcard', ('Where is my child’s ID card?', 'मेरे बच्चे का ID कार्ड कहाँ है?'),
      ('Profile → Student ID card. Show it at the school gate when you pick your child up.', 'प्रोफ़ाइल → छात्र ID कार्ड। बच्चे को लेने जाएँ तो स्कूल गेट पर दिखाएँ।'),
      tab: 4, keys: ['id', 'card', 'gate', 'pick', 'आईडी', 'कार्ड', 'गेट']),
  _Answer('attendance', ('Was my child at school today?', 'क्या मेरा बच्चा आज स्कूल गया?'),
      ('Home shows today’s mark. Academics → Attendance has every day of the month. If your child is absent, you get a message the same morning.', 'होम पर आज की हाज़िरी दिखती है। पढ़ाई → हाज़िरी में महीने का हर दिन है। बच्चा अनुपस्थित हो तो उसी सुबह संदेश आता है।'),
      tab: 1, keys: ['attendance', 'absent', 'today', 'present', 'हाज़िरी', 'हाजिरी', 'आज']),
  _Answer('homework', ('What homework is due?', 'कौन-सा होमवर्क बाकी है?'),
      ('Academics → Homework lists every task with its due date, often with a photo of the board.', 'पढ़ाई → होमवर्क में हर काम उसकी तारीख़ के साथ है, अक्सर बोर्ड की फ़ोटो के साथ।'),
      tab: 1, keys: ['homework', 'task', 'होमवर्क']),
  _Answer('results', ('Where are the exam results?', 'परीक्षा का रिज़ल्ट कहाँ है?'),
      ('Academics → Results shows marks for each exam once the school publishes them, with the report card.', 'स्कूल के प्रकाशित करते ही पढ़ाई → रिज़ल्ट में हर परीक्षा के अंक और रिपोर्ट कार्ड दिखते हैं।'),
      tab: 1, keys: ['result', 'marks', 'exam', 'report', 'रिज़ल्ट', 'रिजल्ट', 'अंक', 'परीक्षा']),
  _Answer('teacher', ('How do I talk to the class teacher?', 'कक्षा शिक्षक से बात कैसे करूँ?'),
      ('On Home, open Messages and start a conversation with the class teacher. For a longer talk, ask for a meeting.', 'होम पर संदेश खोलें और कक्षा शिक्षक से बात शुरू करें। लंबी बात के लिए मीटिंग माँगें।'),
      tab: 0, keys: ['teacher', 'talk', 'message', 'meeting', 'शिक्षक', 'टीचर', 'बात', 'संदेश']),
  _Answer('language', ('Can I use the app in Hindi?', 'क्या ऐप हिन्दी में चल सकता है?'),
      ('Yes. Profile → Language → हिन्दी. You can switch back to English the same way.', 'हाँ। प्रोफ़ाइल → भाषा → हिन्दी। इसी तरह वापस English कर सकते हैं।'),
      tab: 4, keys: ['hindi', 'language', 'english', 'हिन्दी', 'हिंदी', 'भाषा']),
];

const _teacher = [
  _Answer('attendance', ('How do I mark today’s attendance?', 'आज की हाज़िरी कैसे लगाऊँ?'),
      ('Everyone starts as present, so you only tap the children who are absent. It works with no signal too.', 'सब पहले से उपस्थित होते हैं, केवल अनुपस्थित बच्चों पर टैप करें। बिना सिग्नल के भी चलता है।'),
      steps: [
        ('Open Attendance and pick your class', 'हाज़िरी खोलें और कक्षा चुनें'),
        ('Tap A next to each absent child', 'हर अनुपस्थित बच्चे के आगे A दबाएँ'),
        ('Submit: parents of absent children are told', 'जमा करें: अनुपस्थित बच्चों के अभिभावकों को सूचना जाती है'),
      ],
      tab: 1, keys: ['attendance', 'register', 'absent', 'mark', 'हाज़िरी', 'हाजिरी', 'अनुपस्थित']),
  _Answer('marks', ('How do I enter exam marks?', 'परीक्षा के अंक कैसे भरूँ?'),
      ('Classes → Marks → choose the exam and subject. Type marks down the list; they save as you go.', 'कक्षाएँ → अंक → परीक्षा और विषय चुनें। सूची में अंक भरते जाएँ; साथ-साथ सेव होते हैं।'),
      tab: 2, keys: ['marks', 'exam', 'grade', 'अंक', 'परीक्षा', 'नंबर']),
  _Answer('homework', ('How do I post homework?', 'होमवर्क कैसे डालूँ?'),
      ('Classes → Homework → New. Pick the class and subject, add a photo of the board if you like, and set the due date.', 'कक्षाएँ → होमवर्क → नया। कक्षा और विषय चुनें, चाहें तो बोर्ड की फ़ोटो जोड़ें, और तारीख़ रखें।'),
      tab: 2, keys: ['homework', 'assignment', 'होमवर्क']),
  _Answer('certificate', ('How do I give a certificate?', 'प्रमाणपत्र कैसे दूँ?'),
      ('Home → Certificates → Issue. Choose participation or achievement, the event, date and position.', 'होम → प्रमाणपत्र → जारी करें। भागीदारी या उपलब्धि, कार्यक्रम, तारीख़ और स्थान चुनें।'),
      tab: 0, keys: ['certificate', 'award', 'prize', 'प्रमाणपत्र', 'सर्टिफिकेट']),
  _Answer('message', ('How do I reply to a parent?', 'अभिभावक को जवाब कैसे दूँ?'),
      ('Home → Messages. Each parent’s conversation is listed with the newest first; your number stays private.', 'होम → संदेश। हर अभिभावक की बातचीत नई से पुरानी क्रम में है; आपका नंबर निजी रहता है।'),
      tab: 0, keys: ['message', 'reply', 'parent', 'chat', 'संदेश', 'जवाब']),
  _Answer('language', ('Can I use the app in Hindi?', 'क्या ऐप हिन्दी में चल सकता है?'),
      ('Yes. Profile → Language → हिन्दी. You can switch back to English the same way.', 'हाँ। प्रोफ़ाइल → भाषा → हिन्दी। इसी तरह वापस English कर सकते हैं।'),
      tab: 4, keys: ['hindi', 'language', 'english', 'हिन्दी', 'हिंदी', 'भाषा']),
];

const _tabNames = {
  true: [('Home', 'होम'), ('Academics', 'पढ़ाई'), ('Fees', 'फ़ीस'), ('Alerts', 'सूचनाएँ'), ('Profile', 'प्रोफ़ाइल')],
  false: [('Home', 'होम'), ('Attendance', 'हाज़िरी'), ('Classes', 'कक्षाएँ'), ('Alerts', 'सूचनाएँ'), ('Profile', 'प्रोफ़ाइल')],
};

_Answer? _match(List<_Answer> answers, String text) {
  final words = text.toLowerCase();
  _Answer? best;
  var bestScore = 0;
  for (final a in answers) {
    var score = 0;
    for (final k in a.keys) {
      // English keys match at the start of a word ("fee" finds "fees", "id" doesn't find "paid").
      final hit = RegExp(r'^[a-z ]+$').hasMatch(k) ? RegExp('\\b$k').hasMatch(words) : words.contains(k);
      if (hit) score += k.length;
    }
    if (score > bestScore) (best, bestScore) = (a, score);
  }
  return best;
}

/// The round Betu button that floats over every tab.
class BetuButton extends StatelessWidget {
  const BetuButton({super.key, required this.parent, required this.onOpenTab});
  final bool parent;
  final ValueChanged<int> onOpenTab;

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return Tooltip(
      message: currentLang == Lang.hi ? 'बेटू से पूछें' : 'Ask Betu',
      child: Material(
        color: accent,
        shape: const CircleBorder(),
        elevation: 6,
        shadowColor: accent.withValues(alpha: 0.5),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => showBetu(context, parent: parent, onOpenTab: onOpenTab),
          child: SizedBox(
            width: 58,
            height: 58,
            child: Stack(children: [
              const Center(child: BetuFace(size: 40)),
              Positioned(top: 4, right: 4, child: Container(width: 11, height: 11, decoration: BoxDecoration(color: const Color(0xFFD95D39), shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)))),
            ]),
          ),
        ),
      ),
    );
  }
}

Future<void> showBetu(BuildContext context, {required bool parent, required ValueChanged<int> onOpenTab}) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => FractionallySizedBox(heightFactor: 0.9, child: _BetuChat(parent: parent, onOpenTab: onOpenTab)),
    );

class _Msg {
  _Msg.me(this.text) : fromMe = true, answer = null, greet = false;
  _Msg.bot(this.answer, {this.greet = false}) : fromMe = false, text = null;
  final bool fromMe, greet;
  final String? text;
  final _Answer? answer;
}

class _BetuChat extends StatefulWidget {
  const _BetuChat({required this.parent, required this.onOpenTab});
  final bool parent;
  final ValueChanged<int> onOpenTab;
  @override
  State<_BetuChat> createState() => _BetuChatState();
}

class _BetuChatState extends State<_BetuChat> {
  final _msgs = <_Msg>[_Msg.bot(null, greet: true)];
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _asked = <String>{};
  var _typing = false;
  var _all = false;
  Timer? _reply;

  bool get _hi => currentLang == Lang.hi;
  String _say((String, String) s) => _hi ? s.$2 : s.$1;
  List<_Answer> get _answers => widget.parent ? _parent : _teacher;

  @override
  void dispose() {
    _reply?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _ask(String text, _Answer? answer) {
    if (_typing) return;
    setState(() {
      _msgs.add(_Msg.me(text));
      if (answer != null) _asked.add(answer.id);
      _typing = true;
      _all = false;
    });
    _down();
    _reply = Timer(Duration(milliseconds: 650 + math.Random().nextInt(450)), () {
      if (!mounted) return;
      setState(() {
        _typing = false;
        _msgs.add(_Msg.bot(answer));
      });
      _down();
    });
  }

  void _down() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });

  void _send() {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    _ask(text, _match(_answers, text));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    final s = StatusColors.of(context);
    final fresh = _answers.where((a) => !_asked.contains(a.id)).toList();
    final chips = _all || fresh.isEmpty ? _answers : fresh.take(_msgs.length > 1 ? 3 : 6).toList();
    final area = widget.parent
        ? (_hi ? 'फ़ीस, हाज़िरी, होमवर्क और ID कार्ड' : 'fees, attendance, homework and the ID card')
        : (_hi ? 'हाज़िरी, अंक, होमवर्क और संदेश' : 'attendance, marks, homework and messages');

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: theme.colorScheme.surface, borderRadius: const BorderRadius.vertical(top: Radius.circular(24))),
      child: Column(children: [
        Container(
          color: accent,
          padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
          child: Row(children: [
            Container(
              width: 46,
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.white.withValues(alpha: 0.25))),
              child: const BetuFace(size: 36),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_hi ? 'बेटू' : 'Betu', style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w700)),
                Row(children: [
                  Container(width: 7, height: 7, decoration: const BoxDecoration(color: Color(0xFF7EE2A8), shape: BoxShape.circle)),
                  const SizedBox(width: 6),
                  Flexible(child: Text(_hi ? 'आपका Bastaa सहायक' : 'Your Bastaa helper', overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13))),
                ]),
              ]),
            ),
            IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, color: Colors.white), tooltip: _hi ? 'बंद करें' : 'Close'),
          ]),
        ),
        Expanded(
          child: ListView(controller: _scroll, padding: const EdgeInsets.fromLTRB(14, 16, 14, 16), children: [
            for (final m in _msgs) ...[
              if (m.fromMe)
                Align(
                  alignment: Alignment.centerRight,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(color: accent, borderRadius: const BorderRadius.only(topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomLeft: Radius.circular(18), bottomRight: Radius.circular(6))),
                      child: Text(m.text!, style: TextStyle(color: theme.colorScheme.onPrimary, fontSize: 15, height: 1.35)),
                    ),
                  ),
                )
              else
                _BotBubble(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(
                      m.greet
                          ? (_hi ? 'नमस्ते! मैं बेटू हूँ। मुझसे $area के बारे में पूछें, या नीचे से कोई सवाल चुनें।' : 'Namaste! I’m Betu. Ask me about $area, or pick a question below.')
                          : m.answer != null
                              ? _say(m.answer!.a)
                              : (_hi ? 'मैं अभी सीख रहा हूँ, इसलिए इस डेमो में नीचे दिए आम सवालों के जवाब जानता हूँ। बाकी के लिए स्कूल ऑफ़िस मदद करेगा।' : 'I’m still learning, so in this demo I know the common questions below. For anything else, the school office is happy to help.'),
                      style: const TextStyle(fontSize: 15, height: 1.45),
                    ),
                    if (m.answer != null && m.answer!.steps.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      for (var i = 0; i < m.answer!.steps.length; i++)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Container(
                              width: 22,
                              height: 22,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
                              child: Text('${i + 1}', style: TextStyle(color: theme.colorScheme.onPrimary, fontSize: 12, fontWeight: FontWeight.w700)),
                            ),
                            const SizedBox(width: 8),
                            Expanded(child: Text(_say(m.answer!.steps[i]), style: const TextStyle(fontSize: 14.5, height: 1.4))),
                          ]),
                        ),
                    ],
                    if (m.answer?.tab != null) ...[
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          widget.onOpenTab(m.answer!.tab!);
                        },
                        style: OutlinedButton.styleFrom(backgroundColor: theme.colorScheme.surface, shape: const StadiumBorder(), visualDensity: VisualDensity.compact),
                        icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                        label: Text(_hi ? '${_say(_tabNames[widget.parent]![m.answer!.tab!])} खोलें' : 'Open ${_say(_tabNames[widget.parent]![m.answer!.tab!])}'),
                      ),
                    ],
                  ]),
                ),
              const SizedBox(height: 12),
            ],
            if (_typing) const _BotBubble(child: _Dots()),
            if (!_typing) ...[
              const SizedBox(height: 4),
              Text(_hi ? 'आप पूछ सकते हैं' : 'YOU CAN ASK', style: TextStyle(color: s.muted, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: _hi ? 0 : 1.1)),
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final a in chips)
                  ActionChip(
                    label: Text(_say(a.q)),
                    labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    side: BorderSide(color: s.border),
                    onPressed: () => _ask(_say(a.q), a),
                  ),
                if (!_all && chips.length < _answers.length) TextButton(onPressed: () => setState(() => _all = true), child: Text(_hi ? 'और सवाल' : 'More questions')),
              ]),
            ],
          ]),
        ),
        Container(
          decoration: BoxDecoration(border: Border(top: BorderSide(color: s.border))),
          padding: EdgeInsets.fromLTRB(12, 10, 12, 10 + MediaQuery.viewInsetsOf(context).bottom),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(
                    hintText: _hi ? 'अपना सवाल लिखें…' : 'Type a question…',
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(999)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(onPressed: _send, icon: const Icon(Icons.arrow_upward_rounded), tooltip: _hi ? 'भेजें' : 'Send'),
            ]),
            const SizedBox(height: 6),
            Text(_hi ? 'डेमो · बेटू ऐप के आम सवालों के जवाब देता है' : 'Demo · Betu answers common questions about the app', style: TextStyle(color: s.muted, fontSize: 11.5)),
          ]),
        ),
      ]),
    );
  }
}

class _BotBubble extends StatelessWidget {
  const _BotBubble({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
      Container(width: 30, height: 30, alignment: Alignment.center, decoration: BoxDecoration(color: accent, shape: BoxShape.circle), child: const BetuFace(size: 24)),
      const SizedBox(width: 8),
      Flexible(
        child: Container(
          margin: const EdgeInsets.only(right: 28),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.7),
            borderRadius: const BorderRadius.only(topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomRight: Radius.circular(18), bottomLeft: Radius.circular(6)),
          ),
          child: child,
        ),
      ),
    ]);
  }
}

class _Dots extends StatefulWidget {
  const _Dots();
  @override
  State<_Dots> createState() => _DotsState();
}

class _DotsState extends State<_Dots> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 18,
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, _) => Row(mainAxisSize: MainAxisSize.min, children: [
            for (var i = 0; i < 3; i++)
              Transform.translate(
                offset: Offset(0, -4 * math.max(0, math.sin((_c.value - i * 0.15) * 2 * math.pi))),
                child: Container(width: 7, height: 7, margin: const EdgeInsets.symmetric(horizontal: 2), decoration: BoxDecoration(color: StatusColors.of(context).muted, shape: BoxShape.circle)),
              ),
          ]),
        ),
      );
}

/// Betu's face (the same drawing as the website's): a round head in a school cap.
class BetuFace extends StatelessWidget {
  const BetuFace({super.key, this.size = 40});
  final double size;
  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: _FacePainter());
}

class _FacePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 40);
    const ink = Color(0xFF1D2B24);
    final fill = Paint();
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(6, 11, 28, 24), const Radius.circular(11)), fill..color = Colors.white);
    canvas.drawPath(Path()..moveTo(20, 4)..lineTo(35, 10)..lineTo(20, 16)..lineTo(5, 10)..close(), fill..color = ink);
    canvas.drawLine(const Offset(31, 11.5), const Offset(31, 18.5), Paint()..color = ink..strokeWidth = 1.4..strokeCap = StrokeCap.round);
    canvas.drawCircle(const Offset(31, 19.5), 1.8, fill..color = const Color(0xFFD95D39));
    canvas.drawOval(Rect.fromCenter(center: const Offset(15, 23), width: 4.2, height: 5.2), fill..color = ink);
    canvas.drawOval(Rect.fromCenter(center: const Offset(25, 23), width: 4.2, height: 5.2), fill..color = ink);
    final cheek = Paint()..color = const Color(0xFFF4A58A).withValues(alpha: 0.7);
    canvas.drawCircle(const Offset(11.5, 27.5), 2, cheek);
    canvas.drawCircle(const Offset(28.5, 27.5), 2, cheek);
    canvas.drawPath(
      Path()..moveTo(17, 28.5)..quadraticBezierTo(20, 31.1, 23, 28.5),
      Paint()..color = ink..style = PaintingStyle.stroke..strokeWidth = 1.6..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
