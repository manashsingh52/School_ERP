/** The public website on the bare domain (landing, privacy, terms). */

// ⏸ Switch to hello@<domain> once the domain's email is set up (docs/SETUP-LATER.md #5).
export const CONTACT_EMAIL = 'manashsanskrityayan@gmail.com';

export const DEMO_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Bastaa demo for our school')}&body=${encodeURIComponent(
  'School name:\nCity:\nNumber of students:\nYour name and phone:\nA good time to call:\n',
)}`;

// ⏸ WhatsApp number for demo requests, digits with country code (e.g. '919876543210'). Empty hides the button.
export const WHATSAPP_NUMBER = '';

export interface DemoRequest {
  school: string;
  city: string;
  students: string;
  name: string;
  phone: string;
}

/** The demo request as plain text, the same in the email, on WhatsApp and when copied. */
export function demoRequestText(r: DemoRequest): string {
  return [
    'Hello Bastaa team, we would like a 30-minute walkthrough for our school.',
    '',
    `School: ${r.school || '-'}`,
    `City: ${r.city || '-'}`,
    `Students: ${r.students || '-'}`,
    `Name: ${r.name || '-'}`,
    `Phone: ${r.phone || '-'}`,
  ].join('\n');
}

export const demoRequestMailto = (r: DemoRequest) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Bastaa demo${r.school ? ` for ${r.school}` : ''}`)}&body=${encodeURIComponent(demoRequestText(r))}`;

export const demoRequestWhatsApp = (r: DemoRequest) => (WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(demoRequestText(r))}` : null);

export const LEGAL_UPDATED = '22 October 2026';
