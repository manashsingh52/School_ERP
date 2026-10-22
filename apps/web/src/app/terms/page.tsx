import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/site/site-shell';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: 'Terms of service · Bastaa' },
  description: 'The terms for schools, parents and staff who use Bastaa.',
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" intro="These terms apply to everyone who uses Bastaa: schools that subscribe, and the staff, parents and guardians the school invites. By signing in you agree to them.">
      <h2>The service</h2>
      <p>Bastaa gives each school its own space for attendance, fees, exams, homework, timetables, notices, messages and reports, on the web and in the Bastaa app. Features depend on the school’s plan and on what the school switches on.</p>

      <h2>Schools</h2>
      <ul>
        <li>The school’s agreement with Bastaa (plan, price, number of students and any special terms) sits alongside these terms. If they differ, the agreement wins.</li>
        <li>The school owns its data and is responsible for what it enters, for having the right to use it, and for collecting any consent the law requires.</li>
        <li>The school decides who gets access and with which role, and removes people who leave.</li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>Keep your password and sign-in codes to yourself. Tell your school straight away if you think someone else has used your account.</li>
        <li>Use Bastaa only for school purposes: no harassment, no sharing other children’s information outside the school, no attempts to get into data that isn’t yours, and no disrupting the service.</li>
        <li>The school or Bastaa may suspend an account that breaks these rules.</li>
      </ul>

      <h2>Fees paid through Bastaa</h2>
      <p>When parents pay school fees online, the money goes to the school’s own payment account. The school sets the fees and handles refunds and disputes about them. Bastaa provides the invoices, receipts and records.</p>

      <h2>Availability and changes</h2>
      <p>We work to keep Bastaa running and your data backed up, but we can’t promise it will never be interrupted. We schedule maintenance outside school hours where we can. We keep improving Bastaa; if a change removes something a school relies on, we tell the school ahead of time.</p>

      <h2>Ending</h2>
      <p>A school can stop using Bastaa as its agreement allows. We then give the school a full export of its data and delete it within 90 days, as described in our <Link href="/privacy">privacy policy</Link>.</p>

      <h2>Responsibility</h2>
      <p>Bastaa is provided as it is. To the extent the law allows, Bastaa is not liable for indirect losses, and our total liability to a school is limited to what the school paid us in the 12 months before the claim. Nothing here limits rights you have under Indian consumer law.</p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of India.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
