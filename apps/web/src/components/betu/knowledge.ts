/**
 * Betu's answers. A demo for now: no server, just common questions about each dashboard, in
 * English and Hindi. Free-typed questions are matched on keywords.
 */
export type BetuAudience = 'visitor' | 'admin' | 'teacher' | 'parent' | 'owner';

export interface Bi {
  en: string;
  hi: string;
}

export interface BetuAnswer {
  id: string;
  q: Bi;
  a: Bi;
  steps?: Bi[];
  link?: { href: string; label: Bi };
  /** Lower-case words in either language; the answer with the most hits wins. */
  keys: string[];
}

export const BETU_AREA: Record<BetuAudience, Bi> = {
  visitor: { en: 'Bastaa, the demo and pricing', hi: 'Bastaa, डेमो और क़ीमत' },
  admin: { en: 'fees, receipts, students and notices', hi: 'फ़ीस, रसीद, छात्र और सूचनाएँ' },
  teacher: { en: 'attendance, homework, marks and messages', hi: 'हाज़िरी, होमवर्क, अंक और संदेश' },
  parent: { en: 'fees, attendance, homework and results', hi: 'फ़ीस, हाज़िरी, होमवर्क और रिज़ल्ट' },
  owner: { en: 'schools, plans, support and system health', hi: 'स्कूल, प्लान, सपोर्ट और सिस्टम' },
};

export const BETU_FALLBACK: Bi = {
  en: 'I’m still learning, so in this demo I know the common questions below. For anything else, the school office (or the Bastaa team) is happy to help.',
  hi: 'मैं अभी सीख रहा हूँ, इसलिए इस डेमो में नीचे दिए आम सवालों के जवाब जानता हूँ। बाकी किसी भी बात के लिए स्कूल ऑफ़िस (या Bastaa टीम) मदद करेगा।',
};

export const BETU: Record<BetuAudience, BetuAnswer[]> = {
  visitor: [
    {
      id: 'what',
      q: { en: 'What is Bastaa?', hi: 'Bastaa क्या है?' },
      a: {
        en: 'Bastaa runs a school in one place. The office handles students, fees, exams and reports on the web; parents and teachers use one Android app for attendance, homework, results and messages.',
        hi: 'Bastaa से पूरा स्कूल एक जगह चलता है। ऑफ़िस वेब पर छात्र, फ़ीस, परीक्षा और रिपोर्ट संभालता है; अभिभावक और शिक्षक हाज़िरी, होमवर्क, रिज़ल्ट और संदेशों के लिए एक Android ऐप चलाते हैं।',
      },
      keys: ['what', 'bastaa', 'about', 'क्या', 'बारे'],
    },
    {
      id: 'try',
      q: { en: 'Can I try it right now?', hi: 'क्या मैं अभी आज़मा सकता हूँ?' },
      a: {
        en: 'Yes. The live demo has a sample school with 750 students. Pick a role (school admin, teacher or parent) and click around; nothing you change is saved.',
        hi: 'हाँ। लाइव डेमो में 750 छात्रों वाला नमूना स्कूल है। कोई भूमिका चुनें (स्कूल एडमिन, शिक्षक या अभिभावक) और देखें; आपके बदलाव सेव नहीं होते।',
      },
      link: { href: '/login', label: { en: 'Open the live demo', hi: 'लाइव डेमो खोलें' } },
      keys: ['try', 'demo', 'test', 'आज़मा', 'डेमो', 'देख'],
    },
    {
      id: 'price',
      q: { en: 'How much does it cost?', hi: 'इसकी क़ीमत कितनी है?' },
      a: {
        en: 'Pricing depends on the number of students, billed per student per month, with no setup fee for most schools. Book a 30-minute call and we’ll share a quote for your school.',
        hi: 'क़ीमत छात्रों की संख्या पर निर्भर है, हर छात्र प्रति माह के हिसाब से, और ज़्यादातर स्कूलों के लिए कोई सेटअप फ़ीस नहीं। 30 मिनट की कॉल बुक करें, हम आपके स्कूल के लिए क़ीमत बताएँगे।',
      },
      link: { href: '/#contact', label: { en: 'Book a call', hi: 'कॉल बुक करें' } },
      keys: ['price', 'cost', 'pricing', 'fee', 'charge', 'rate', 'क़ीमत', 'कीमत', 'खर्च', 'पैसे', 'दाम'],
    },
    {
      id: 'setup',
      q: { en: 'How long does setup take?', hi: 'शुरू करने में कितना समय लगता है?' },
      a: {
        en: 'About a week. We set up classes, fees and your existing records with you on a call, then teachers and parents get their sign-ins.',
        hi: 'लगभग एक हफ़्ता। हम आपके साथ कॉल पर कक्षाएँ, फ़ीस और पुराना रिकॉर्ड सेट करते हैं, फिर शिक्षकों और अभिभावकों को साइन-इन मिलता है।',
      },
      steps: [
        { en: 'Day 1–2: classes, fees and records', hi: 'दिन 1–2: कक्षाएँ, फ़ीस और रिकॉर्ड' },
        { en: 'Day 3–4: teachers and parents join', hi: 'दिन 3–4: शिक्षक और अभिभावक जुड़ते हैं' },
        { en: 'Day 5–7: go live', hi: 'दिन 5–7: शुरू' },
      ],
      keys: ['setup', 'start', 'long', 'time', 'week', 'समय', 'शुरू', 'कितने दिन'],
    },
    {
      id: 'offline',
      q: { en: 'Does it work on a weak network?', hi: 'क्या कमज़ोर नेटवर्क पर चलता है?' },
      a: {
        en: 'Yes. The app is light on data, and teachers can mark attendance with no signal at all. It goes up to school by itself once the phone is back online.',
        hi: 'हाँ। ऐप कम डेटा लेता है, और शिक्षक बिना सिग्नल के भी हाज़िरी लगा सकते हैं। फ़ोन में नेटवर्क आते ही वह अपने-आप स्कूल पहुँच जाती है।',
      },
      keys: ['offline', 'network', 'internet', 'signal', 'नेटवर्क', 'इंटरनेट', 'सिग्नल'],
    },
    {
      id: 'safe',
      q: { en: 'Is our school’s data safe?', hi: 'क्या हमारे स्कूल का डेटा सुरक्षित है?' },
      a: {
        en: 'Each school’s data is kept apart from every other school and stored in India. There are no ads and nothing is ever sold.',
        hi: 'हर स्कूल का डेटा बाकी स्कूलों से अलग और भारत में रखा जाता है। कोई विज्ञापन नहीं, और कुछ भी कभी बेचा नहीं जाता।',
      },
      link: { href: '/privacy', label: { en: 'Read the privacy policy', hi: 'गोपनीयता नीति पढ़ें' } },
      keys: ['safe', 'data', 'secure', 'privacy', 'सुरक्षित', 'डेटा', 'गोपनीयता'],
    },
  ],

  admin: [
    {
      id: 'collect',
      q: { en: 'How do I collect a fee at the counter?', hi: 'काउंटर पर फ़ीस कैसे जमा करूँ?' },
      a: { en: 'Use Collect in Payments. It takes about thirty seconds per student.', hi: 'भुगतान में "जमा करें" का इस्तेमाल करें। हर छात्र में लगभग तीस सेकंड लगते हैं।' },
      steps: [
        { en: 'Open Payments → Collect', hi: 'भुगतान → जमा करें खोलें' },
        { en: 'Search the student by name or admission no.', hi: 'नाम या प्रवेश संख्या से छात्र खोजें' },
        { en: 'Tick the bills being paid and choose cash, UPI or cheque', hi: 'जिन बिलों का भुगतान हो रहा है उन्हें चुनें और नकद, UPI या चेक चुनें' },
        { en: 'Save, then press Print receipt', hi: 'सेव करें, फिर "रसीद प्रिंट करें" दबाएँ' },
      ],
      link: { href: '/payments?tab=collect', label: { en: 'Open Collect', hi: 'जमा करें खोलें' } },
      keys: ['collect', 'counter', 'cash', 'take', 'fee', 'जमा', 'काउंटर', 'नकद', 'फ़ीस', 'फीस'],
    },
    {
      id: 'receipt',
      q: { en: 'How do I print a fee receipt?', hi: 'फ़ीस की रसीद कैसे प्रिंट करूँ?' },
      a: {
        en: 'Every payment has a receipt with the school logo. Press Print and it goes straight to the printer attached to this computer. If there’s no printer, the receipt downloads as a PDF instead.',
        hi: 'हर भुगतान की रसीद स्कूल के लोगो के साथ बनती है। "प्रिंट" दबाएँ, वह सीधे इस कंप्यूटर से जुड़े प्रिंटर पर जाएगी। प्रिंटर न हो तो रसीद PDF में डाउनलोड हो जाएगी।',
      },
      steps: [
        { en: 'Open Payments and find the payment', hi: 'भुगतान खोलें और भुगतान ढूँढें' },
        { en: 'Click it, then press Print receipt', hi: 'उस पर क्लिक करें, फिर "रसीद प्रिंट करें" दबाएँ' },
        { en: 'Or press Download to save the PDF', hi: 'या PDF सेव करने के लिए "डाउनलोड" दबाएँ' },
      ],
      link: { href: '/payments?tab=payments', label: { en: 'Open Payments', hi: 'भुगतान खोलें' } },
      keys: ['print', 'receipt', 'printer', 'pdf', 'download', 'रसीद', 'प्रिंट', 'प्रिंटर'],
    },
    {
      id: 'dues',
      q: { en: 'Who hasn’t paid fees yet?', hi: 'किसने अभी तक फ़ीस नहीं भरी?' },
      a: {
        en: 'Fees → Invoices lists every unpaid bill; filter by class or status. Parents also get a reminder in the app before the due date.',
        hi: 'फ़ीस → इनवॉइस में हर बकाया बिल दिखता है; कक्षा या स्थिति से छाँटें। अभिभावकों को नियत तारीख़ से पहले ऐप में रिमाइंडर भी जाता है।',
      },
      link: { href: '/fees?tab=invoices', label: { en: 'Open Invoices', hi: 'इनवॉइस खोलें' } },
      keys: ['due', 'dues', 'unpaid', 'pending', 'defaulter', 'बकाया', 'बाकी', 'नहीं भरी'],
    },
    {
      id: 'student',
      q: { en: 'How do I add a new student?', hi: 'नया छात्र कैसे जोड़ूँ?' },
      a: {
        en: 'Students → Add student for one admission. For many at once, import an Excel sheet and match its columns.',
        hi: 'एक प्रवेश के लिए छात्र → छात्र जोड़ें। कई एक साथ जोड़ने हों तो Excel शीट इम्पोर्ट करें और कॉलम मिलाएँ।',
      },
      link: { href: '/students/new', label: { en: 'Add a student', hi: 'छात्र जोड़ें' } },
      keys: ['add', 'new', 'student', 'admission', 'import', 'excel', 'छात्र', 'प्रवेश', 'जोड़'],
    },
    {
      id: 'idcards',
      q: { en: 'How do I print ID cards?', hi: 'ID कार्ड कैसे प्रिंट करूँ?' },
      a: {
        en: 'Students → ID cards. Choose a section and Bastaa makes an A4 sheet of nine cards with photo, blood group and parent details, ready to cut and laminate.',
        hi: 'छात्र → ID कार्ड। एक सेक्शन चुनें और Bastaa फ़ोटो, ब्लड ग्रुप और अभिभावक के विवरण के साथ नौ कार्ड की A4 शीट बना देगा, काटकर लैमिनेट करने के लिए तैयार।',
      },
      link: { href: '/students', label: { en: 'Open Students', hi: 'छात्र खोलें' } },
      keys: ['id', 'card', 'identity', 'आईडी', 'कार्ड', 'पहचान'],
    },
    {
      id: 'notice',
      q: { en: 'How do I send a notice to parents?', hi: 'अभिभावकों को सूचना कैसे भेजूँ?' },
      a: {
        en: 'Notices → New notice. Choose the whole school or some classes, write it, and send. Parents get it in the app straight away.',
        hi: 'सूचनाएँ → नई सूचना। पूरा स्कूल या कुछ कक्षाएँ चुनें, लिखें और भेजें। अभिभावकों को तुरंत ऐप में मिल जाती है।',
      },
      link: { href: '/notices', label: { en: 'Open Notices', hi: 'सूचनाएँ खोलें' } },
      keys: ['notice', 'announce', 'circular', 'holiday', 'सूचना', 'नोटिस', 'छुट्टी'],
    },
  ],

  teacher: [
    {
      id: 'attendance',
      q: { en: 'How do I mark today’s attendance?', hi: 'आज की हाज़िरी कैसे लगाऊँ?' },
      a: {
        en: 'Everyone starts as present, so you only tap the children who are absent. In the app it works even with no signal.',
        hi: 'सब पहले से उपस्थित होते हैं, इसलिए केवल अनुपस्थित बच्चों पर टैप करें। ऐप में यह बिना सिग्नल के भी चलता है।',
      },
      steps: [
        { en: 'Open Attendance and pick your class', hi: 'हाज़िरी खोलें और अपनी कक्षा चुनें' },
        { en: 'Tap A next to each absent child', hi: 'हर अनुपस्थित बच्चे के आगे A दबाएँ' },
        { en: 'Press Save: parents of absent children are told', hi: 'सेव दबाएँ: अनुपस्थित बच्चों के अभिभावकों को सूचना जाती है' },
      ],
      link: { href: '/attendance', label: { en: 'Open Attendance', hi: 'हाज़िरी खोलें' } },
      keys: ['attendance', 'register', 'absent', 'present', 'mark', 'हाज़िरी', 'हाजिरी', 'अनुपस्थित', 'उपस्थित'],
    },
    {
      id: 'homework',
      q: { en: 'How do I post homework?', hi: 'होमवर्क कैसे डालूँ?' },
      a: {
        en: 'Homework → New homework. Pick the class and subject, write the task, add a photo of the board if you like, and set the due date.',
        hi: 'होमवर्क → नया होमवर्क। कक्षा और विषय चुनें, काम लिखें, चाहें तो बोर्ड की फ़ोटो जोड़ें, और जमा करने की तारीख़ रखें।',
      },
      link: { href: '/homework', label: { en: 'Open Homework', hi: 'होमवर्क खोलें' } },
      keys: ['homework', 'assignment', 'task', 'होमवर्क', 'गृहकार्य'],
    },
    {
      id: 'marks',
      q: { en: 'How do I enter exam marks?', hi: 'परीक्षा के अंक कैसे भरूँ?' },
      a: {
        en: 'Examinations → choose the exam → your subject. Type marks down the list; grades are worked out for you and saved as you go.',
        hi: 'परीक्षाएँ → परीक्षा चुनें → अपना विषय। सूची में अंक भरते जाएँ; ग्रेड अपने-आप बनते हैं और साथ-साथ सेव होते हैं।',
      },
      link: { href: '/exams', label: { en: 'Open Examinations', hi: 'परीक्षाएँ खोलें' } },
      keys: ['marks', 'exam', 'grade', 'result', 'अंक', 'परीक्षा', 'नंबर', 'ग्रेड'],
    },
    {
      id: 'certificate',
      q: { en: 'How do I give a student a certificate?', hi: 'छात्र को प्रमाणपत्र कैसे दूँ?' },
      a: {
        en: 'Certificates → Issue. Choose participation or achievement, the event, date and position. The family sees it under Achievements.',
        hi: 'प्रमाणपत्र → जारी करें। भागीदारी या उपलब्धि चुनें, फिर कार्यक्रम, तारीख़ और स्थान। परिवार इसे "उपलब्धियाँ" में देखता है।',
      },
      link: { href: '/certificates', label: { en: 'Open Certificates', hi: 'प्रमाणपत्र खोलें' } },
      keys: ['certificate', 'award', 'prize', 'competition', 'प्रमाणपत्र', 'सर्टिफिकेट', 'प्रतियोगिता'],
    },
    {
      id: 'message',
      q: { en: 'How do I reply to a parent?', hi: 'अभिभावक को जवाब कैसे दूँ?' },
      a: {
        en: 'Open Messages. Each parent’s conversation is listed with the newest first; your number stays private.',
        hi: 'संदेश खोलें। हर अभिभावक की बातचीत नई से पुरानी क्रम में दिखती है; आपका नंबर निजी रहता है।',
      },
      link: { href: '/messages', label: { en: 'Open Messages', hi: 'संदेश खोलें' } },
      keys: ['message', 'reply', 'chat', 'parent', 'संदेश', 'जवाब', 'बात'],
    },
    {
      id: 'timetable',
      q: { en: 'Where is my timetable?', hi: 'मेरी समय-सारणी कहाँ है?' },
      a: { en: 'Timetable shows your periods for the week, with today’s first.', hi: 'समय-सारणी में पूरे हफ़्ते के पीरियड दिखते हैं, आज वाले सबसे पहले।' },
      link: { href: '/timetable', label: { en: 'Open Timetable', hi: 'समय-सारणी खोलें' } },
      keys: ['timetable', 'period', 'schedule', 'class', 'समय', 'सारणी', 'पीरियड'],
    },
  ],

  parent: [
    {
      id: 'pay',
      q: { en: 'How do I pay school fees?', hi: 'स्कूल फ़ीस कैसे भरूँ?' },
      a: {
        en: 'Fees shows what’s due for your child. Press Pay and finish in any UPI app; the receipt arrives straight away.',
        hi: 'फ़ीस में आपके बच्चे की बकाया राशि दिखती है। "भुगतान करें" दबाएँ और किसी भी UPI ऐप से पूरा करें; रसीद तुरंत मिल जाती है।',
      },
      link: { href: '/my/fees', label: { en: 'Open Fees', hi: 'फ़ीस खोलें' } },
      keys: ['pay', 'fee', 'fees', 'upi', 'payment', 'फ़ीस', 'फीस', 'भुगतान', 'भर'],
    },
    {
      id: 'receipt',
      q: { en: 'Where can I get a fee receipt?', hi: 'फ़ीस की रसीद कहाँ मिलेगी?' },
      a: {
        en: 'Fees → Paid. Every payment has a Receipt button that opens a PDF with the school’s logo, ready to save or print.',
        hi: 'फ़ीस → भुगतान हो चुका। हर भुगतान के साथ "रसीद" बटन है, जो स्कूल के लोगो वाली PDF खोलता है, सेव या प्रिंट के लिए तैयार।',
      },
      link: { href: '/my/fees', label: { en: 'Open Fees', hi: 'फ़ीस खोलें' } },
      keys: ['receipt', 'download', 'pdf', 'proof', 'रसीद', 'डाउनलोड'],
    },
    {
      id: 'attendance',
      q: { en: 'Was my child at school today?', hi: 'क्या मेरा बच्चा आज स्कूल गया?' },
      a: {
        en: 'Attendance shows each day of the month. If your child is marked absent you get a message the same morning.',
        hi: 'हाज़िरी में महीने का हर दिन दिखता है। बच्चा अनुपस्थित हो तो उसी सुबह आपको संदेश मिलता है।',
      },
      link: { href: '/my/attendance', label: { en: 'Open Attendance', hi: 'हाज़िरी खोलें' } },
      keys: ['attendance', 'absent', 'present', 'today', 'school', 'हाज़िरी', 'हाजिरी', 'आज', 'अनुपस्थित'],
    },
    {
      id: 'homework',
      q: { en: 'What homework is due?', hi: 'कौन-सा होमवर्क बाकी है?' },
      a: { en: 'Homework lists every task with its due date, newest first, often with a photo of the board.', hi: 'होमवर्क में हर काम उसकी तारीख़ के साथ दिखता है, नया सबसे ऊपर, अक्सर बोर्ड की फ़ोटो के साथ।' },
      link: { href: '/my/homework', label: { en: 'Open Homework', hi: 'होमवर्क खोलें' } },
      keys: ['homework', 'assignment', 'task', 'होमवर्क', 'गृहकार्य'],
    },
    {
      id: 'results',
      q: { en: 'Where are the exam results?', hi: 'परीक्षा का रिज़ल्ट कहाँ है?' },
      a: { en: 'Results shows marks and grades for each exam once the school publishes them, with the report card to download.', hi: 'स्कूल के प्रकाशित करते ही रिज़ल्ट में हर परीक्षा के अंक और ग्रेड दिखते हैं, साथ में रिपोर्ट कार्ड डाउनलोड के लिए।' },
      link: { href: '/my/results', label: { en: 'Open Results', hi: 'रिज़ल्ट खोलें' } },
      keys: ['result', 'results', 'marks', 'exam', 'report', 'रिज़ल्ट', 'रिजल्ट', 'अंक', 'परीक्षा'],
    },
    {
      id: 'idcard',
      q: { en: 'Where is my child’s ID card?', hi: 'मेरे बच्चे का ID कार्ड कहाँ है?' },
      a: {
        en: 'In the Bastaa app: Profile → Student ID card. Show it at the school gate when you pick your child up.',
        hi: 'Bastaa ऐप में: प्रोफ़ाइल → छात्र ID कार्ड। बच्चे को लेने जाएँ तो स्कूल गेट पर इसे दिखाएँ।',
      },
      keys: ['id', 'card', 'pickup', 'gate', 'आईडी', 'कार्ड', 'गेट', 'पहचान'],
    },
    {
      id: 'teacher',
      q: { en: 'How do I talk to the class teacher?', hi: 'कक्षा शिक्षक से बात कैसे करूँ?' },
      a: { en: 'Open Messages and start a conversation with the class teacher. For a longer talk, ask for a meeting.', hi: 'संदेश खोलें और कक्षा शिक्षक से बात शुरू करें। लंबी बात के लिए मीटिंग माँगें।' },
      link: { href: '/messages', label: { en: 'Open Messages', hi: 'संदेश खोलें' } },
      keys: ['teacher', 'talk', 'message', 'meeting', 'contact', 'शिक्षक', 'टीचर', 'बात', 'संदेश'],
    },
  ],

  owner: [
    {
      id: 'school',
      q: { en: 'How do I add a new school?', hi: 'नया स्कूल कैसे जोड़ूँ?' },
      a: { en: 'Schools → New school. Give it a name, web address and plan; the first admin gets a sign-in code.', hi: 'स्कूल → नया स्कूल। नाम, वेब पता और प्लान दें; पहले एडमिन को साइन-इन कोड मिलता है।' },
      link: { href: '/platform/schools', label: { en: 'Open Schools', hi: 'स्कूल खोलें' } },
      keys: ['add', 'new', 'school', 'onboard', 'स्कूल', 'नया', 'जोड़'],
    },
    {
      id: 'plan',
      q: { en: 'How do I change a school’s plan?', hi: 'किसी स्कूल का प्लान कैसे बदलूँ?' },
      a: { en: 'Open the school from Schools and pick a new plan. Plans decides which modules and limits each plan has.', hi: 'स्कूल में से वह स्कूल खोलें और नया प्लान चुनें। "प्लान" में तय होता है किस प्लान में कौन-से मॉड्यूल और सीमाएँ हैं।' },
      link: { href: '/platform/plans', label: { en: 'Open Plans', hi: 'प्लान खोलें' } },
      keys: ['plan', 'upgrade', 'billing', 'प्लान', 'अपग्रेड'],
    },
    {
      id: 'support',
      q: { en: 'How do I get into a school to help them?', hi: 'किसी स्कूल की मदद के लिए अंदर कैसे जाऊँ?' },
      a: { en: 'Ask for support access. The school approves it, it lasts a limited time, and every step is in the audit log.', hi: 'सपोर्ट एक्सेस माँगें। स्कूल अनुमति देता है, यह सीमित समय तक रहता है, और हर कदम ऑडिट लॉग में दर्ज होता है।' },
      link: { href: '/platform/support', label: { en: 'Open Support access', hi: 'सपोर्ट एक्सेस खोलें' } },
      keys: ['support', 'access', 'help', 'login', 'सपोर्ट', 'मदद'],
    },
    {
      id: 'health',
      q: { en: 'Is everything running fine?', hi: 'क्या सब ठीक चल रहा है?' },
      a: { en: 'System shows the database, background jobs and recent errors at a glance.', hi: 'सिस्टम में डेटाबेस, बैकग्राउंड जॉब और हाल की गड़बड़ियाँ एक नज़र में दिखती हैं।' },
      link: { href: '/platform/system', label: { en: 'Open System', hi: 'सिस्टम खोलें' } },
      keys: ['health', 'system', 'jobs', 'error', 'down', 'सिस्टम', 'ठीक', 'गड़बड़'],
    },
    {
      id: 'flags',
      q: { en: 'Can I turn a feature on for one school?', hi: 'क्या एक स्कूल के लिए कोई फ़ीचर चालू कर सकता हूँ?' },
      a: { en: 'Yes: Feature flags turns a feature on for everyone, a plan, or a single school.', hi: 'हाँ: फ़ीचर फ़्लैग से कोई फ़ीचर सबके लिए, किसी प्लान के लिए या एक स्कूल के लिए चालू होता है।' },
      link: { href: '/platform/flags', label: { en: 'Open Feature flags', hi: 'फ़ीचर फ़्लैग खोलें' } },
      keys: ['feature', 'flag', 'enable', 'turn', 'फ़ीचर', 'चालू'],
    },
  ],
};

/** Best answer for a typed question, or null. */
export function matchBetu(audience: BetuAudience, text: string): BetuAnswer | null {
  const words = text.toLowerCase();
  // English keys match at the start of a word ("fee" finds "fees", "id" doesn't find "paid").
  const hit = (k: string) => (/^[a-z ]+$/.test(k) ? new RegExp(`\\b${k}`).test(words) : words.includes(k));
  let best: BetuAnswer | null = null;
  let bestScore = 0;
  for (const answer of BETU[audience]) {
    const score = answer.keys.reduce((n, k) => n + (hit(k) ? k.length : 0), 0);
    if (score > bestScore) {
      best = answer;
      bestScore = score;
    }
  }
  return best;
}
