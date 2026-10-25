'use client';

import { Button, Dialog, DialogContent, Field, Input, Select, toast } from '@schoolos/ui';
import { Check, Copy, Mail, MessageCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CONTACT_EMAIL, type DemoRequest, demoRequestMailto, demoRequestText, demoRequestWhatsApp } from '@/lib/site';

const BANDS = ['Up to 300', '300 – 700', '700 – 1,200', '1,200 – 2,500', '2,500+'];

const BookDemoContext = createContext<(students?: string) => void>(() => {});

/** "Book a demo" anywhere on the site opens the same form. */
export const useBookDemo = () => useContext(BookDemoContext);

export function BookDemoProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState('');
  const openWith = useCallback((s?: string) => {
    if (s) setStudents(s);
    setOpen(true);
  }, []);
  return (
    <BookDemoContext.Provider value={openWith}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <BookDemoForm initialStudents={students} />}
      </Dialog>
    </BookDemoContext.Provider>
  );
}

function BookDemoForm({ initialStudents }: { initialStudents: string }) {
  const [r, setR] = useState<DemoRequest>({ school: '', city: '', students: initialStudents, name: '', phone: '' });
  const [copied, setCopied] = useState(false);
  const set = (k: keyof DemoRequest) => (e: { target: { value: string } }) => setR((p) => ({ ...p, [k]: e.target.value }));
  const whatsapp = demoRequestWhatsApp(r);
  const ready = r.school.trim().length > 1 && r.phone.replace(/\D/g, '').length >= 10;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${demoRequestText(r)}\n\n(to ${CONTACT_EMAIL})`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Copying isn’t allowed here. Please email us instead.');
    }
  }

  return (
    <DialogContent title="Book a 30-minute walkthrough" description="We show Bastaa with your school's classes and fees, and answer every question. No obligation." className="max-w-[520px]">
      <div className="grid gap-4 px-5 pt-4 pb-2 sm:grid-cols-2">
        <Field label="School name" htmlFor="bd-school" className="sm:col-span-2">
          <Input id="bd-school" value={r.school} onChange={set('school')} placeholder="e.g. Green Valley Public School" autoComplete="organization" autoFocus />
        </Field>
        <Field label="City" htmlFor="bd-city">
          <Input id="bd-city" value={r.city} onChange={set('city')} placeholder="e.g. Ranchi" autoComplete="address-level2" />
        </Field>
        <Field label="Students" htmlFor="bd-students">
          <Select id="bd-students" value={r.students} onChange={set('students')}>
            <option value="">Choose</option>
            {r.students && !BANDS.includes(r.students) && <option value={r.students}>{r.students}</option>}
            {BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
        <Field label="Your name" htmlFor="bd-name">
          <Input id="bd-name" value={r.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <Field label="Phone" htmlFor="bd-phone">
          <Input id="bd-phone" value={r.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="+91" />
        </Field>
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="ghost" onClick={() => void copy()} className="min-h-11 sm:min-h-9">
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy details'}
        </Button>
        {whatsapp && (
          <Button asChild variant="secondary" className="min-h-11 sm:min-h-9">
            <a href={whatsapp} target="_blank" rel="noopener"><MessageCircle /> WhatsApp</a>
          </Button>
        )}
        <Button asChild className="min-h-11 sm:min-h-9" aria-disabled={!ready}>
          <a href={demoRequestMailto(r)} onClick={(e) => { if (!ready) { e.preventDefault(); toast.error('Add your school’s name and a phone number.'); } }}>
            <Mail /> Send request
          </a>
        </Button>
      </div>
      <p className="px-5 pb-4 text-small text-fg-tertiary">
        Opens your email app with everything filled in. Or write to <a className="font-medium text-accent-strong hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </DialogContent>
  );
}
