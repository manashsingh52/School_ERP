'use client';

import { Button, Dialog, DialogBody, DialogContent, DialogFooter, Field, Select } from '@schoolos/ui';
import { IdCard, Printer } from 'lucide-react';
import { useState } from 'react';
import { sectionLabel, useClasses } from '@/lib/academics';

/** Print a whole section's ID cards: nine to an A4 sheet, ready to cut and laminate. */
export function IdCardsDialog() {
  const [open, setOpen] = useState(false);
  const classes = useClasses();
  const sections = (classes.data ?? []).flatMap((c) => c.sections.map((s) => ({ id: s.id, label: sectionLabel(c.name, s.name) })));
  const [sectionId, setSectionId] = useState('');
  const chosen = sectionId || sections[0]?.id || '';
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}><IdCard /> ID cards</Button>
      <DialogContent title="Print ID cards" description="Every active student in the section, nine cards to an A4 sheet with cut lines. Photos, blood group and parent details come from each student's profile.">
        <DialogBody>
          <Field label="Section" htmlFor="idc-section">
            <Select id="idc-section" value={chosen} onChange={(e) => setSectionId(e.target.value)} disabled={sections.length === 0}>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button asChild disabled={!chosen}>
            <a href={chosen ? `/api/v1/students/id-cards?sectionId=${chosen}` : undefined} target="_blank" rel="noopener"><Printer /> Open for printing</a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
