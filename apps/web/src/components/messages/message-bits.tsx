'use client';

import {
  CONVERSATION_CATEGORIES,
  CONVERSATION_CATEGORY_LABELS,
  type ConversationCategory,
  type ConversationDetail,
  type ConversationStatus,
  type MessageContact,
} from '@schoolos/contracts';
import { Badge, Button, DialogBody, DialogContent, DialogFooter, Field, Input, Select, Textarea, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StudentPicker, type PickedStudent } from '@/components/fees/student-picker';
import { ApiError, apiPost } from '@/lib/api-client';
import { useChild, useIsParentView } from '@/lib/child';
import { classSection } from '@/lib/format';
import { useData } from '@/lib/hooks';

export const STATUS: Record<ConversationStatus, { label: string; tone: 'info' | 'warning' | 'success' }> = {
  OPEN: { label: 'Open', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
};

export function CategoryBadge({ category }: { category: ConversationCategory }) {
  return <Badge tone={category === 'COMPLAINT' ? 'danger' : 'neutral'}>{CONVERSATION_CATEGORY_LABELS[category]}</Badge>;
}

/**
 * Write to a teacher or the school office (parents), or to a child's parent (staff). Every thread is
 * about one child, so the right people — and only they — can see it.
 */
export function NewConversation({ onDone, initialCategory = 'GENERAL' }: { onDone: () => void; initialCategory?: ConversationCategory }) {
  const parentView = useIsParentView();
  const { children: kids, child } = useChild();
  const router = useRouter();
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState<string>(parentView ? (child?.id ?? kids[0]?.id ?? '') : '');
  const [picked, setPicked] = useState<PickedStudent | null>(null);
  const [to, setTo] = useState<string>('');
  const [category, setCategory] = useState<ConversationCategory>(initialCategory);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const contacts = useData<MessageContact[]>(['conversations', 'contacts', studentId], studentId ? `/conversations/contacts?studentId=${studentId}` : null);
  const list = contacts.data ?? [];
  const toValue = to || (list[0] ? (list[0].memberId ?? 'office') : '');

  async function send() {
    setBusy(true);
    try {
      const res = await apiPost<{ data: ConversationDetail }>('/conversations', { studentId, toMemberId: toValue === 'office' ? null : toValue, category, subject, body });
      await qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(category === 'COMPLAINT' ? 'Complaint sent — you can follow its status here.' : 'Message sent');
      onDone();
      router.push(`/messages/${res.data.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The message did not send. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent title={category === 'COMPLAINT' ? 'Raise a complaint' : 'New message'} description="About one child. Only the people in the conversation (and the school office) can read it." className="max-w-[600px]">
      <DialogBody className="flex flex-col gap-4">
        {parentView ? (
          kids.length > 1 && (
            <Field label="About" htmlFor="nc-child">
              <Select id="nc-child" value={studentId} onChange={(e) => { setStudentId(e.target.value); setTo(''); }}>
                {kids.map((k) => <option key={k.id} value={k.id}>{k.name}{k.classLabel ? ` (${k.classLabel})` : ''}</option>)}
              </Select>
            </Field>
          )
        ) : picked ? (
          <Field label="About" htmlFor="nc-about">
            <div id="nc-about" className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span>{picked.name} <span className="text-fg-tertiary">· {classSection(picked.className, picked.sectionName)} · {picked.admissionNo}</span></span>
              <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setStudentId(''); setTo(''); }}>Change</Button>
            </div>
          </Field>
        ) : (
          <Field label="About which student?" htmlFor="nc-pick">
            <StudentPicker autoFocus onPick={(s) => { setPicked(s); setStudentId(s.id); setTo(''); }} />
          </Field>
        )}
        {studentId && (
          <Field label={parentView ? 'To' : 'To which parent?'} htmlFor="nc-to">
            <Select id="nc-to" value={toValue} onChange={(e) => setTo(e.target.value)} disabled={!list.length}>
              {!list.length && <option>{contacts.isLoading ? 'Loading…' : parentView ? 'No teachers found' : 'No parent uses the app yet'}</option>}
              {list.map((c) => <option key={c.memberId ?? 'office'} value={c.memberId ?? 'office'}>{c.name} — {c.role}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Topic" htmlFor="nc-cat">
          <Select id="nc-cat" value={category} onChange={(e) => setCategory(e.target.value as ConversationCategory)}>
            {CONVERSATION_CATEGORIES.map((c) => <option key={c} value={c}>{CONVERSATION_CATEGORY_LABELS[c]}</option>)}
          </Select>
        </Field>
        <Field label="Subject" htmlFor="nc-subject">
          <Input id="nc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder={category === 'COMPLAINT' ? 'e.g. School bus late' : 'e.g. Maths homework doubt'} />
        </Field>
        <Field label="Message" htmlFor="nc-body">
          <Textarea id="nc-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={4000} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void send()} loading={busy} disabled={!studentId || !toValue || subject.trim().length < 3 || !body.trim()}>Send</Button>
      </DialogFooter>
    </DialogContent>
  );
}
