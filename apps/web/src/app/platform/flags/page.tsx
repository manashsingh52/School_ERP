'use client';

import type { FeatureFlagItem } from '@schoolos/contracts';
import { Badge, Button, Card, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Input, PageHeader, Table, TableSkeleton, TD, TH, THead, TR, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Flag, Plus } from 'lucide-react';
import { useState } from 'react';
import { useIsSuperAdmin } from '@/components/platform/console-shell';
import { ApiError, apiPut } from '@/lib/api-client';
import { useData } from '@/lib/hooks';

export default function FlagsPage() {
  const flags = useData<FeatureFlagItem[]>(['platform', 'flags'], '/platform/flags');
  const superAdmin = useIsSuperAdmin();
  const [editing, setEditing] = useState<FeatureFlagItem | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Feature flags"
        description="Order of precedence: kill switch → school override → plan → default."
        actions={superAdmin && <Button onClick={() => setEditing('new')}><Plus /> New flag</Button>}
      />
      <Card>
        {!flags.data ? (
          <Table><tbody><TableSkeleton columns={4} /></tbody></Table>
        ) : !flags.data.length ? (
          <EmptyState icon={<Flag />} title="No flags yet" />
        ) : (
          <Table>
            <THead><TR><TH>Flag</TH><TH>Default</TH><TH>School overrides</TH><TH /></TR></THead>
            <tbody>
              {flags.data.map((f) => (
                <TR key={f.key}>
                  <TD><code className="font-medium">{f.key}</code><div className="text-small text-fg-tertiary">{f.description}</div></TD>
                  <TD>{f.killSwitch ? <Badge tone="danger">Killed — off everywhere</Badge> : f.defaultEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</TD>
                  <TD className="tabular">{f.overrides}</TD>
                  <TD className="text-right">{superAdmin && <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>Edit</Button>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>{editing && <FlagDialog flag={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}</Dialog>
    </div>
  );
}

function FlagDialog({ flag, onDone }: { flag: FeatureFlagItem | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ key: flag?.key ?? '', description: flag?.description ?? '', defaultEnabled: flag?.defaultEnabled ?? false, killSwitch: flag?.killSwitch ?? false });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await apiPut('/platform/flags', v);
      await qc.invalidateQueries({ queryKey: ['platform'] });
      toast.success('Flag saved');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent title={flag ? `Edit ${flag.key}` : 'New feature flag'}>
      <DialogBody className="flex flex-col gap-4">
        <Field label="Key" htmlFor="fl-key" hint="e.g. report_builder"><Input id="fl-key" value={v.key} disabled={!!flag} onChange={(e) => setV({ ...v, key: e.target.value })} /></Field>
        <Field label="What it does" htmlFor="fl-desc"><Input id="fl-desc" value={v.description} maxLength={200} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <Checkbox checked={v.defaultEnabled} onChange={(e) => setV({ ...v, defaultEnabled: e.target.checked })} label="On by default" description="For schools whose plan doesn't mention it and that have no override." />
        <Checkbox checked={v.killSwitch} onChange={(e) => setV({ ...v, killSwitch: e.target.checked })} label="Kill switch" description="Off for every school right now, whatever their plan or override says." />
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant={v.killSwitch && !flag?.killSwitch ? 'destructive' : 'primary'} onClick={() => void save()} loading={busy} disabled={!v.key.trim() || !v.description.trim()}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}
