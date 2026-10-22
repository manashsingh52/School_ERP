import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/site/site-shell';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: 'Privacy policy · Bastaa' },
  description: 'What data Bastaa keeps for schools, parents and teachers, why, where, and for how long.',
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" intro="Bastaa is school management software. Schools use it to run attendance, fees, exams, homework and messages, on the web and in the Bastaa app. This policy explains what data that involves and how we look after it.">
      <h2>Who is responsible for your data</h2>
      <p>
        <strong>Your school decides</strong> what data it keeps about students, parents and staff and what it is used for. Under India’s Digital Personal Data
        Protection Act, 2023, the school is the <em>data fiduciary</em>. Bastaa is the school’s <em>data processor</em>: we store and process that data only to
        provide the service, on the school’s instructions, under a written agreement with each school.
      </p>
      <p>Questions about a child’s records, or requests to correct them, go to the school first. We help the school answer them.</p>

      <h2>What the service keeps</h2>
      <ul>
        <li><strong>People:</strong> names, class and section, admission details, phone numbers and email addresses of parents and staff, and photos or documents the school uploads.</li>
        <li><strong>School records:</strong> attendance, timetables, homework, marks, report cards, notices and messages.</li>
        <li><strong>Fees:</strong> invoices, concessions, payments and receipts. Card, UPI and bank details are handled by the payment provider and never reach us.</li>
        <li><strong>Sign-in and security:</strong> your password (stored only as a one-way hash), the devices you are signed in on, and a record of who changed what, so the school can see it.</li>
        <li><strong>The app:</strong> a notification token so we can send alerts to your phone. No location, contacts or advertising ID.</li>
      </ul>

      <h2>What we use it for</h2>
      <p>Only to run the service for the school: showing the right information to the right person, sending the alerts the school has switched on, producing receipts, report cards and reports, keeping accounts secure, and fixing problems.</p>
      <p><strong>No ads, no selling, no profiling.</strong> We never sell data, show ads, or track children. Nothing is used to train AI models.</p>

      <h2>Where it is stored and who else handles it</h2>
      <p>School data is stored in India, on Google Cloud in Mumbai, with backups in India. Each school’s records are kept separate from every other school’s by the database itself. A few providers help us run the service, each only for its part, and only when the school uses that feature:</p>
      <ul>
        <li>Google Cloud (hosting and storage) and Cloudflare (network and security)</li>
        <li>Razorpay, on the school’s own account, for online fee payments</li>
        <li>MSG91 for SMS, Firebase Cloud Messaging for app alerts, and an email provider for email</li>
        <li>Jitsi Meet for video meetings</li>
        <li>Google Gemini for the optional assistant, only if the school switches it on, and without sending more than a question needs</li>
        <li>Sentry for error reports, which carry the error itself and not your personal details</li>
      </ul>
      <p>We share data with authorities only when Indian law requires it.</p>

      <h2>How long we keep it</h2>
      <p>The school chooses, within what the law needs. Our defaults: fee records for 8 years after the financial year, attendance for 5 years, alerts and their delivery logs for 1 year, and records of changes for 7 years. Results and report cards are kept while the school uses Bastaa, because schools need them for certificates.</p>
      <p>When a school leaves, we hand it a full export and delete its data within 90 days. Backups age out after that.</p>

      <h2>Keeping it safe</h2>
      <p>Everything travels encrypted and is encrypted where it is stored. Staff see only what their role allows. Bastaa’s own support team can look at a school only when the school’s admin approves it, read-only and for a limited time, and every look is recorded in the school’s audit log.</p>

      <h2>Children</h2>
      <p>Students’ records are entered and managed by their school. The app is for parents and school staff; children don’t need an account. Where the law asks for a parent’s consent, the school collects it.</p>

      <h2>The demo app</h2>
      <p>The demo version of the app on Google Play uses a made-up sample school. It collects nothing: no account, no sign-in, no analytics, and anything you change stays on your phone until the app closes.</p>

      <h2>This website</h2>
      <p>This website uses only the cookies it needs: one to keep you signed in, and one to remember a light or dark theme. If you email us to book a demo, we use your message only to reply.</p>

      <h2>Changes and contact</h2>
      <p>If this policy changes in a way that matters, we tell schools before it takes effect and update the date above.</p>
      <p>
        Questions or complaints: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also our <Link href="/terms">terms of service</Link>.
      </p>
    </LegalPage>
  );
}
