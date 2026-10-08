'use client';

import type { RoleItem } from '@schoolos/contracts';
import { PERMISSIONS, type Permission, type PermissionScope } from '@schoolos/permissions';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  Select,
  Skeleton,
  cn,
  toast,
} from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiDelete, apiPost, apiPut } from '@/lib/api-client';
import { useAction, useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

const SCOPE_LABEL: Record<PermissionScope, string> = {
  ALL: 'Whole school',
  ASSIGNED: 'Their classes',
  OWN_CHILDREN: 'Own children',
  SELF: 'Only themselves',
};

/** Group the catalog by module, in catalog order. */
const MODULES = Object.entries(PERMISSIONS).reduce<Record<string, Permission[]>>((acc, [key, def]) => {
  (acc[def.module] ??= []).push(key as Permission);
  return acc;
}, {});

/** Roles are data, not code (docs/04 §1): each permission has a scope. */
export default function RolesPage() {
  const { can } = useMe();
  const roles = useData<RoleItem[]>(['roles'], '/roles');
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0];
  const canManage = can('role.manage');

  if (roles.isPending) return <Skeleton className="h-96" />;
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Card className="h-fit shrink-0 lg:w-64">
        <CardHeader title="Roles" action={canManage && <Button size="icon-sm" variant="ghost" aria-label="New role" onClick={() => setCreating(true)}><Plus /></Button>} />
        <ul className="flex flex-col gap-0.5 p-2">
          {roles.data?.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn('flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-body', selected?.id === r.id ? 'bg-accent-tint font-medium' : 'hover:bg-hover')}
              >
                <span className="truncate">{r.name}</span>
                <span className="tabular text-small text-fg-tertiary">{r.memberCount}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {selected && <RoleEditor key={selected.id} role={selected} canManage={canManage} onDeleted={() => setSelectedId(undefined)} />}
      {creating && <NewRoleDialog roles={roles.data ?? []} onClose={(id) => { setCreating(false); if (id) setSelectedId(id); }} />}
    </div>
  );
}

function RoleEditor({ role, canManage, onDeleted }: { role: RoleItem; canManage: boolean; onDeleted: () => void }) {
  const qc = useQueryClient();
  const initial = useMemo(() => new Map(role.permissions.map((p) => [p.permission, p.scope])), [role]);
  const [grants, setGrants] = useState(initial);
  useEffect(() => setGrants(initial), [initial]);
  const [saving, setSaving] = useState(false);
  const dirty = grants.size !== initial.size || [...grants].some(([p, s]) => initial.get(p) !== s);
  const remove = useAction(() => apiDelete(`/roles/${role.id}`), { success: 'Role deleted', invalidate: [['roles']], onSuccess: onDeleted });

  async function save(confirmBroaden = false) {
    setSaving(true);
    try {
      await apiPut(`/roles/${role.id}/permissions`, { permissions: [...grants].map(([permission, scope]) => ({ permission, scope })), confirmBroaden });
      await qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success(`${role.name} updated — applies immediately`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFIRM_REQUIRED') {
        if (window.confirm(err.message)) return void save(true);
      } else {
        toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the role.');
      }
    } finally {
      setSaving(false);
    }
  }

  const set = (p: Permission, scope: PermissionScope | '') =>
    setGrants((g) => { const n = new Map(g); if (scope) n.set(p, scope); else n.delete(p); return n; });

  return (
    <Card className="min-w-0 flex-1 overflow-hidden">
      <CardHeader
        title={<span className="flex items-center gap-2">{role.name}{role.isSystem && <Badge><Lock className="size-3" /> Built-in</Badge>}</span>}
        description={role.description ?? `${role.memberCount} people have this role`}
        action={canManage && !role.isSystem && (
          <Button size="sm" variant="ghost" className="text-danger" disabled={role.memberCount > 0} loading={remove.isPending} onClick={() => remove.mutate(undefined)}>
            <Trash2 /> Delete
          </Button>
        )}
      />
      <div className="mt-3 flex flex-col divide-y divide-border border-t border-border">
        {Object.entries(MODULES).map(([module, perms]) => (
          <section key={module} className="px-5 py-3">
            <h3 className="mb-2 text-caption font-medium text-fg-tertiary">{module}</h3>
            <ul className="flex flex-col gap-1.5">
              {perms.map((p) => {
                const def = PERMISSIONS[p];
                const scopes = (def.scopes.length ? def.scopes : ['ALL']) as PermissionScope[];
                const value = grants.get(p) ?? '';
                return (
                  <li key={p} className="flex items-center justify-between gap-4">
                    <span className={cn('text-body', !value && 'text-fg-tertiary')}>{def.label}</span>
                    {scopes.length === 1 ? (
                      <input
                        type="checkbox"
                        aria-label={def.label}
                        disabled={!canManage}
                        checked={!!value}
                        onChange={(e) => set(p, e.target.checked ? scopes[0]! : '')}
                        className="size-4 accent-[var(--accent-500)]"
                      />
                    ) : (
                      <Select aria-label={def.label} disabled={!canManage} value={value} onChange={(e) => set(p, e.target.value as PermissionScope)} className="h-8 w-40 text-small">
                        <option value="">No access</option>
                        {scopes.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                      </Select>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {canManage && (
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
          {dirty && <Button variant="ghost" onClick={() => setGrants(initial)}>Discard</Button>}
          <Button disabled={!dirty} loading={saving} onClick={() => void save()}>Save permissions</Button>
        </div>
      )}
    </Card>
  );
}

function NewRoleDialog({ roles, onClose }: { roles: RoleItem[]; onClose: (id?: string) => void }) {
  const [name, setName] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const create = useAction(() => apiPost<{ data: RoleItem }>('/roles', { name, copyFromRoleId: copyFrom || undefined }), {
    success: (r) => `${r.data.name} created`,
    invalidate: [['roles']],
    onSuccess: (r) => onClose(r.data.id),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="New role" description="Start from an existing role, then adjust its permissions.">
        <DialogBody className="flex flex-col gap-4">
          <Field label="Name" htmlFor="role-name" hint="e.g. Vice Principal, Receptionist"><Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Copy permissions from" htmlFor="role-copy">
            <Select id="role-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Start empty</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose()}>Cancel</Button>
          <Button disabled={name.trim().length < 2} loading={create.isPending} onClick={() => create.mutate(undefined)}>Create role</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
