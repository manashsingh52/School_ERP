import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// English or Hindi. Strings are keyed by their English text, so anything not translated yet
/// shows in English. The signed-in screens are rebuilt when the language changes (app.dart).
enum Lang { en, hi }

const _key = 'bastaa.lang';
var _lang = Lang.en;

/// Read the saved choice before the first frame (main.dart).
Future<void> loadLang() async {
  try {
    if ((await SharedPreferences.getInstance()).getString(_key) == 'hi') _lang = Lang.hi;
  } catch (_) {
    // No storage: stay in English.
  }
}

Lang get currentLang => _lang;

/// `tr('Fees')` → "फ़ीस" in Hindi. `{name}` placeholders are filled from [vars].
String tr(String text, [Map<String, Object?>? vars]) {
  var s = _lang == Lang.hi ? (_hi[text] ?? text) : text;
  vars?.forEach((k, v) => s = s.replaceAll('{$k}', '$v'));
  return s;
}

class LangController extends Notifier<Lang> {
  @override
  Lang build() => _lang;

  Future<void> set(Lang lang) async {
    _lang = lang;
    state = lang;
    try {
      await (await SharedPreferences.getInstance()).setString(_key, lang.name);
    } catch (_) {}
  }
}

final langProvider = NotifierProvider<LangController, Lang>(LangController.new);

const _hi = <String, String>{
  // Bottom bar and titles
  'Home': 'होम',
  'Academics': 'पढ़ाई',
  'Fees': 'फ़ीस',
  'Alerts': 'सूचनाएँ',
  'Notifications': 'सूचनाएँ',
  'Profile': 'प्रोफ़ाइल',
  'Attendance': 'हाज़िरी',
  'Classes': 'कक्षाएँ',

  // Home
  'Good Morning': 'सुप्रभात',
  'Good Afternoon': 'नमस्कार',
  'Good Evening': 'शुभ संध्या',
  'Messages': 'संदेश',
  'Meetings': 'मीटिंग',
  'Reminders': 'रिमाइंडर',
  'Results': 'रिज़ल्ट',
  'Homework': 'होमवर्क',
  'Timetable': 'समय-सारणी',
  'Calendar': 'कैलेंडर',
  'Achievements': 'उपलब्धियाँ',
  'Marks': 'अंक',
  'Certificates': 'प्रमाणपत्र',
  'Class teacher': 'कक्षा शिक्षक',
  'Class {c}': 'कक्षा {c}',
  'Class teacher: {name}': 'कक्षा शिक्षक: {name}',
  'Profile and settings': 'प्रोफ़ाइल और सेटिंग्स',
  'Pay online in a minute': 'एक मिनट में ऑनलाइन भरें',
  'Overdue': 'बकाया',
  'Due soon': 'जल्द देय',
  'Pay': 'भरें',
  'Your Subjects': 'आपके विषय',
  'No marks yet': 'अभी अंक नहीं',
  'Subjects appear here when the first test results are out.': 'पहली परीक्षा के रिज़ल्ट आते ही विषय यहाँ दिखेंगे।',
  'Message a teacher': 'शिक्षक को संदेश',
  'Raise a complaint': 'शिकायत दर्ज करें',
  'Set a reminder': 'रिमाइंडर लगाएँ',
  'Not marked yet': 'अभी हाज़िरी नहीं लगी',
  'Absent today': 'आज अनुपस्थित',
  'Arrived late': 'देर से पहुँचे',
  'In school today': 'आज स्कूल में',
  'Nothing due': 'कुछ बाकी नहीं',
  'Doing well': 'अच्छा चल रहा है',
  'Doing well · slipped a little': 'अच्छा चल रहा है · थोड़ा फिसला',
  'Improving — keep going': 'सुधार हो रहा है — जारी रखें',
  'Keep practising': 'अभ्यास करते रहें',
  'Needs attention': 'ध्यान देने की ज़रूरत',
  'All results and report cards': 'सभी रिज़ल्ट और रिपोर्ट कार्ड',
  'No children linked yet': 'अभी कोई बच्चा जुड़ा नहीं',
  'Ask the school office to link your child to your account.': 'स्कूल ऑफ़िस से कहें कि आपके बच्चे को आपके अकाउंट से जोड़ें।',
  'Teacher': 'शिक्षक',
  'All registers done': 'सभी रजिस्टर पूरे',
  'No marks pending': 'कोई अंक बाकी नहीं',
  'Classes today': 'आज की कक्षाएँ',
  'Attendance to take': 'हाज़िरी लगानी है',
  'Saved as draft': 'ड्राफ़्ट में सेव',
  'Not taken yet': 'अभी नहीं लगी',
  'Finish and submit': 'पूरा करके जमा करें',
  'Take register': 'हाज़िरी लगाएँ',
  'Day off': 'छुट्टी',
  'No classes today': 'आज कोई कक्षा नहीं',
  'Now': 'अभी',
  'Marks to enter': 'भरने हैं अंक',
  'All': 'सभी',
  'Not started': 'शुरू नहीं हुआ',
  'New': 'नया',

  '{amount} fees due': '{amount} फ़ीस बकाया',
  '{amount} is overdue': '{amount} की तारीख़ निकल चुकी',
  'Next · {time}': 'अगली · {time}',
  '{n} due': '{n} बाकी',
  '{n} register to take': '{n} रजिस्टर लगाना है',
  '{n} registers to take': '{n} रजिस्टर लगाने हैं',
  '{n} marks sheet open': '{n} अंक शीट खुली',
  '{n} marks sheets open': '{n} अंक शीट खुली',
  '{n} section · today': '{n} सेक्शन · आज',
  '{n} sections · today': '{n} सेक्शन · आज',
  '{n} classes': '{n} कक्षाएँ',
  '{n} sheet': '{n} शीट',
  '{n} sheets': '{n} शीट',
  '{n} left': '{n} बाकी',
  '{s} subjects · {e} exam · avg {p}': '{s} विषय · {e} परीक्षा · औसत {p}',
  '{s} subjects · {e} exams · avg {p}': '{s} विषय · {e} परीक्षाएँ · औसत {p}',
  '{n} test': '{n} टेस्ट',
  '{n} tests': '{n} टेस्ट',
  'Section {p}': 'सेक्शन {p}',
  'Mathematics': 'गणित',
  'Science': 'विज्ञान',
  'English': 'अंग्रेज़ी',
  'Hindi': 'हिन्दी',
  'Social Science': 'सामाजिक विज्ञान',
  'Computer': 'कंप्यूटर',
  'Break': 'ब्रेक',
  'Lunch': 'लंच',

  // Profile
  'Language': 'भाषा',
  'Student ID card': 'छात्र ID कार्ड',
  'Show at the school gate when you pick up your child': 'बच्चे को लेने आएँ तो स्कूल गेट पर दिखाएँ',
  "{name}'s documents": '{name} के दस्तावेज़',
  'Signed-in devices': 'साइन-इन डिवाइस',
  'Switch school': 'स्कूल बदलें',
  'Sign out': 'साइन आउट',
  'Sign out of Bastaa?': 'Bastaa से साइन आउट करें?',
  'Cancel': 'रद्द करें',
  'Nothing shared yet': 'अभी कुछ साझा नहीं हुआ',
  'This device': 'यह डिवाइस',
  'Web browser': 'वेब ब्राउज़र',
  'Phone': 'फ़ोन',
  'Last used {when}': 'आख़िरी बार {when}',

  // ID card
  'ID card': 'ID कार्ड',
  'STUDENT IDENTITY CARD': 'छात्र पहचान पत्र',
  'Admission no.': 'प्रवेश संख्या',
  'Roll no.': 'रोल नंबर',
  'Date of birth': 'जन्म तिथि',
  'Blood group': 'ब्लड ग्रुप',
  'Parent': 'अभिभावक',
  'Parent phone': 'अभिभावक फ़ोन',
  'Valid for {year}': '{year} के लिए मान्य',
  'Show this card at the school gate when you pick up {name}. Turn up the screen brightness so the guard can read it.':
      '{name} को लेने आएँ तो स्कूल गेट पर यह कार्ड दिखाएँ। स्क्रीन की चमक बढ़ा दें ताकि गार्ड आसानी से पढ़ सके।',
  'If anything here is wrong, tell the school office.': 'कुछ गलत हो तो स्कूल ऑफ़िस को बताएँ।',
  'Father': 'पिता',
  'Mother': 'माता',
  'Guardian': 'अभिभावक',
};
