'use client';

import type { AttendanceSettings } from '@schoolos/contracts';
import { Button, Card, CardHeader, Checkbox, Field, Input, Select, Skeleton, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, apiPut } from '@/lib/api-client';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AttendanceSettingsPage() {
  const settings = useData<AttendanceSettings>(['attendance', 'settings'], '/attendance/settings');
  if (!settings.data) return <Skeleton className="h-80" />;
  return <SettingsForm initial={settings.data} />;
}

function SettingsForm({ initial }: { initial: AttendanceSettings }) {
  const { can } = useMe();
  const qc = useQueryClient();
  const readOnly = !can('school.settings.manage');
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);

  async function save() {
    setSaving(true);
    try {
      const res = await apiPut<{ data: AttendanceSettings }>('/attendance/settings', value);
      qc.setQueryData(['attendance', 'settings'], res.data);
      await qc.invalidateQueries({ queryKey: ['attendance'] });
      toast.success('Attendance rules saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the rules.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Attendance" description="Who marks the register, and for how long it can be corrected." />
      <fieldset disabled={readOnly} className="flex flex-col gap-5 p-5">
        <Field label="Who marks student attendance" htmlFor="att-by">
          <Select id="att-by" value={value.markedBy} onChange={(e) => setValue({ ...value, markedBy: e.target.value as AttendanceSettings['markedBy'] })}>
            <option value="CLASS_TEACHER">Class teacher only</option>
            <option value="ANY_ASSIGNED">Any teacher of the section</option>
          </Select>
        </Field>
        <Field
          label="Teachers can correct a register for"
          htmlFor="att-window"
          hint="Days after the date. After that, only staff with “Edit attendance after the edit window” can change it."
        >
          <div className="flex items-center gap-2">
            <Input
              id="att-window"
              type="number"
              min={0}
              max={30}
              value={value.editWindowDays}
              onChange={(e) => setValue({ ...value, editWindowDays: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
              className="w-24"
            />
            <span className="text-body text-fg-secondary">days</span>
          </div>
        </Field>
        <div>
          <div className="mb-2 text-body font-medium">Weekly off</div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {WEEKDAYS.map((day, i) => (
              <Checkbox
                key={day}
                label={day}
                checked={value.weeklyOffDays.includes(i)}
                onChange={(e) =>
                  setValue({ ...value, weeklyOffDays: e.target.checked ? [...value.weeklyOffDays, i].sort() : value.weeklyOffDays.filter((d) => d !== i) })
                }
              />
            ))}
          </div>
        </div>
      </fieldset>
      {!readOnly && (
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button onClick={() => void save()} loading={saving} disabled={!dirty}>Save changes</Button>
        </div>
      )}
    </Card>
  );
}
