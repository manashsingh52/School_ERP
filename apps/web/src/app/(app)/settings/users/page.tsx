'use client';

import type { MemberItem, PageResponse, RoleItem } from '@schoolos/contracts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  Pagination,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
} from '@schoolos/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, apiFetch, apiPatch, apiPost } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useAction, useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

const STATUS: Record<MemberItem['status'], { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  ACTIVE: { tone: 'success', label: 'Active' },
  INVITED: { tone: 'warning', label: 'Invited' },
  SUSPENDED: { tone: 'danger', label: 'Suspended' },
  REMOVED: { tone: 'neutral', label: 'Removed' },
};

/** Everyone with access to this school and their roles (docs/04). */
export default function UsersPage() {
  const { can, me } = useMe();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<MemberItem | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const roles = useData<RoleItem[]>(['roles'], '/roles');
  const members = useQuery({
    queryKey: ['members', { q, page }],
    queryFn: () => apiFetch<PageResponse<MemberItem>>(`/members?page=${page}&pageSize=25&q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  });
  const canManage = can('user.manage');

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Users"
        description="Staff, teachers and parents who can sign in to this school."
        action={canManage && <Button size="sm" onClick={() => setInviting(true)}><UserPlus /> Invite</Button>}
      />
      <div className="mt-3 border-y border-border p-3">
        <div className="w-full max-w-sm"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or mobile" leading={<Search />} aria-label="Search users" /></div>
      </div>
      {!members.isPending && !members.data?.data.length ? (
        <EmptyState icon={<Users />} title="No users found" />
      ) : (
        <>
          <Table>
            <THead><tr><TH>Person</TH><TH>Roles</TH><TH className="w-28">Status</TH><TH className="w-32">Joined</TH></tr></THead>
            <tbody>
              {members.isPending ? <TableSkeleton columns={4} /> : members.data!.data.map((m) => (
                <TR key={m.id} interactive={canManage} tabIndex={canManage ? 0 : undefined} onClick={() => canManage && setEditing(m)}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} size={28} />
                      <div className="min-w-0">
                        <div className="font-medium">{m.name}{m.userId === me.user.id && <span className="ml-1.5 text-small text-fg-tertiary">(you)</span>}</div>
                        <div className="text-small text-fg-tertiary">{m.email ?? m.phone}</div>
                      </div>
                    </div>
                  </TD>
                  <TD className="text-fg-secondary">{m.roles.map((r) => r.name).join(', ')}</TD>
                  <TD><Badge tone={STATUS[m.status].tone} dot>{STATUS[m.status].label}</Badge></TD>
                  <TD className="text-fg-secondary">{m.joinedAt ? formatDate(m.joinedAt) : '—'}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          {!!members.data?.page.total && <div className="border-t border-border"><Pagination page={page} pageSize={25} total={members.data.page.total} onPageChange={setPage} /></div>}
        </>
      )}
      {inviting && <InviteDialog roles={roles.data ?? []} onClose={() => setInviting(false)} />}
      {editing && <EditMemberDialog member={editing} roles={roles.data ?? []} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function RolePicker({ roles, value, onChange }: { roles: RoleItem[]; value: Set<string>; onChange: (v: Set<string>) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {roles.map((r) => (
        <Checkbox
          key={r.id}
          label={r.name}
          description={r.description ?? undefined}
          checked={value.has(r.id)}
          onChange={(e) => { const n = new Set(value); if (e.target.checked) n.add(r.id); else n.delete(r.id); onChange(n); }}
        />
      ))}
    </div>
  );
}

function InviteDialog({ roles, onClose }: { roles: RoleItem[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const isEmail = contact.includes('@');
  const invite = useAction(() => apiPost('/members', { name, ...(isEmail ? { email: contact } : { phone: contact }), roleIds: [...roleIds] }), {
    success: `${name} invited`,
    invalidate: [['members'], ['roles']],
    onSuccess: onClose,
    quietErrors: true,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Invite someone" description="They get access when they sign in with their mobile (one-time code) or email.">
        <DialogBody className="flex flex-col gap-4">
          <Field label="Name" htmlFor="inv-name"><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Mobile number or email" htmlFor="inv-contact" error={error}><Input id="inv-contact" value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
          <div className="flex flex-col gap-2"><span className="text-small font-medium">Roles</span><RolePicker roles={roles} value={roleIds} onChange={setRoleIds} /></div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name.trim() || !contact.trim() || !roleIds.size}
            loading={invite.isPending}
            onClick={() => invite.mutate(undefined, { onError: (e) => setError(e instanceof ApiError ? (e.details?.[0]?.message ?? e.message) : undefined) })}
          >
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ member, roles, onClose }: { member: MemberItem; roles: RoleItem[]; onClose: () => void }) {
  const [roleIds, setRoleIds] = useState(new Set(member.roles.map((r) => r.id)));
  const save = useAction((body: object) => apiPatch(`/members/${member.id}`, body), { success: 'Access updated', invalidate: [['members'], ['roles']], onSuccess: onClose });
  const suspended = member.status === 'SUSPENDED';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={member.name} description={member.email ?? member.phone ?? undefined}>
        <DialogBody className="flex flex-col gap-2">
          <span className="text-small font-medium">Roles</span>
          <RolePicker roles={roles} value={roleIds} onChange={setRoleIds} />
        </DialogBody>
        <DialogFooter className="justify-between">
          <Button variant="ghost" className={suspended ? '' : 'text-danger'} loading={save.isPending} onClick={() => save.mutate({ status: suspended ? 'ACTIVE' : 'SUSPENDED' })}>
            {suspended ? 'Restore access' : 'Suspend access'}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={!roleIds.size} loading={save.isPending} onClick={() => save.mutate({ roleIds: [...roleIds] })}>Save roles</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
