'use client';

import type { NotificationChannel, NotificationRuleItem, SchoolSettingsView } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, Skeleton, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Gate } from '@/components/gate';
import { ApiError, apiPut } from '@/lib/api-client';
import { useSettings } from '@/components/settings/section-forms';
import { useData } from '@/lib/hooks';

const CHANNEL_LABEL: Record<NotificationChannel, string> = { IN_APP: 'In app', PUSH: 'App push', SMS: 'SMS', EMAIL: 'Email' };
const CHANNEL_NOTE: Partial<Record<NotificationChannel, string>> = {
  SMS: 'SMS needs a registered sender (DLT). Until it is connected, SMS is skipped.',
};

function NotificationRules({ initial }: { initial: NotificationRuleItem[] }) {
  const qc = useQueryClient();
  const [rules, setRules] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(rules) !== JSON.stringify(initial);
  const update = (event: string, patch: Partial<NotificationRuleItem>) => setRules((rs) => rs.map((r) => (r.event === event ? { ...r, ...patch } : r)));

  async function save() {
    setSaving(true);
    try {
      const res = await apiPut<{ data: NotificationRuleItem[] }>('/notification-rules', {
        rules: rules.map((r) => ({ event: r.event, enabled: r.enabled, channels: r.channels })),
      });
      qc.setQueryData(['notification-rules'], res.data);
      setRules(res.data);
      toast.success('Notification settings saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the settings.');
    } finally {
      setSaving(false);
    }
  }

  const notes = [...new Set(rules.flatMap((r) => (r.enabled ? r.channels : [])).map((c) => CHANNEL_NOTE[c]).filter(Boolean))];

  return (
    <Card>
      <CardHeader title="Notifications" description="Choose which events alert people, and how. Everyone always gets them in their in-app inbox." />
      <div className="mt-4 border-t border-border">
        {rules.map((r) => (
          <div key={r.event} className="flex flex-col gap-3 border-b border-border px-5 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
            <Checkbox
              checked={r.enabled}
              onChange={(e) => update(r.event, { enabled: e.target.checked })}
              label={<span className="font-medium">{r.label}</span>}
              description={
                <>
                  {r.description} <Badge className="ml-1 align-middle">{r.audience}</Badge>
                </>
              }
            />
            <div className={cn('flex flex-wrap gap-x-4 gap-y-2 pl-6 sm:pl-0', !r.enabled && 'opacity-50')}>
              {r.availableChannels.map((c) => (
                <Checkbox
                  key={c}
                  label={CHANNEL_LABEL[c]}
                  checked={r.channels.includes(c)}
                  disabled={c === 'IN_APP' || !r.enabled}
                  onChange={(e) => update(r.event, { channels: e.target.checked ? [...r.channels, c] : r.channels.filter((x) => x !== c) })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {notes.length > 0 && <div className="border-t border-border px-5 py-3 text-small text-fg-secondary">{notes.join(' ')}</div>}
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button onClick={() => void save()} loading={saving} disabled={!dirty}>Save changes</Button>
      </div>
    </Card>
  );
}

/** Quiet hours (pushes and SMS wait for the morning) and the school's daily SMS limit. */
function QuietHours({ initial }: { initial: SchoolSettingsView['notifications'] }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const [limit, setLimit] = useState(initial.dailySmsLimit?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const next = { ...value, dailySmsLimit: limit.trim() ? Number(limit) : null };
  const dirty = JSON.stringify(next) !== JSON.stringify(initial);
  const quiet = value.quietHours;

  async function save() {
    setSaving(true);
    try {
      const res = await apiPut<{ data: SchoolSettingsView }>('/school/settings/notifications', next);
      qc.setQueryData(['school', 'settings'], res.data);
      setValue(res.data.notifications);
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : 'We couldn’t save the settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Quiet hours and limits" description="App pushes and SMS sent at night wait until the morning. The in-app inbox and email are never held back." />
      <div className="mt-4 flex flex-col gap-4 border-t border-border px-5 py-4">
        <Checkbox checked={quiet.enabled} onChange={(e) => setValue({ ...value, quietHours: { ...quiet, enabled: e.target.checked } })} label="Hold pushes and SMS during quiet hours" />
        <div className={cn('flex flex-wrap gap-4 pl-6', !quiet.enabled && 'opacity-50')}>
          <Field label="From" htmlFor="quiet-start" className="w-32"><Input id="quiet-start" type="time" disabled={!quiet.enabled} value={quiet.start} onChange={(e) => setValue({ ...value, quietHours: { ...quiet, start: e.target.value } })} /></Field>
          <Field label="Until" htmlFor="quiet-end" className="w-32"><Input id="quiet-end" type="time" disabled={!quiet.enabled} value={quiet.end} onChange={(e) => setValue({ ...value, quietHours: { ...quiet, end: e.target.value } })} /></Field>
        </div>
        <Field label="Most SMS per day" htmlFor="sms-limit" hint="Leave empty for no daily limit. The plan's monthly SMS allowance always applies." className="max-w-xs">
          <Input id="sms-limit" type="number" min={1} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="No daily limit" />
        </Field>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button onClick={() => void save()} loading={saving} disabled={!dirty}>Save changes</Button>
      </div>
    </Card>
  );
}

function Content() {
  const rules = useData<NotificationRuleItem[]>(['notification-rules'], '/notification-rules');
  const settings = useSettings();
  if (!rules.data) return <Skeleton className="h-96" />;
  return (
    <div className="flex flex-col gap-6">
      <NotificationRules initial={rules.data} />
      {settings.data && <QuietHours initial={settings.data.notifications} />}
    </div>
  );
}

export default function NotificationSettingsPage() {
  return (
    <Gate any={['notification.settings.manage']}>
      <Content />
    </Gate>
  );
}
