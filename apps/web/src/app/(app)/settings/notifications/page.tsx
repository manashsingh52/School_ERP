'use client';

import type { NotificationChannel, NotificationRuleItem } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Checkbox, Skeleton, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Gate } from '@/components/gate';
import { ApiError, apiPut } from '@/lib/api-client';
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

function Content() {
  const rules = useData<NotificationRuleItem[]>(['notification-rules'], '/notification-rules');
  if (!rules.data) return <Skeleton className="h-96" />;
  return <NotificationRules initial={rules.data} />;
}

export default function NotificationSettingsPage() {
  return (
    <Gate any={['notification.settings.manage']}>
      <Content />
    </Gate>
  );
}
