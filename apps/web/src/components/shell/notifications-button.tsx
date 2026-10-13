'use client';

import type { NotificationItem } from '@schoolos/contracts';
import { Button, Menu, MenuContent, MenuTrigger, Skeleton, cn } from '@schoolos/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Bell, CalendarCheck, CalendarDays, CalendarX, Check, Megaphone, MessagesSquare, NotebookPen, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch, apiPost } from '@/lib/api-client';
import { useIsParentView } from '@/lib/child';
import { timeAgo } from '@/lib/format';

const ICON: Record<string, typeof Bell> = {
  'attendance.absent': CalendarX,
  'attendance.late': CalendarX,
  'homework.published': NotebookPen,
  'notice.published': Megaphone,
  'attendance.arrived': CalendarCheck,
  'message.received': MessagesSquare,
  'complaint.status_changed': MessagesSquare,
  'meeting.scheduled': Video,
  'meeting.rescheduled': Video,
  'meeting.cancelled': Video,
  'meeting.starting': Video,
  'reminder.due': AlarmClock,
  'calendar.added': CalendarDays,
};

/** Alerts carry the staff route; parents have their own pages for the same things. */
const PARENT_ROUTE: Record<string, string> = { '/attendance': '/my/attendance', '/homework': '/my/homework', '/results': '/my/results', '/fees': '/my/fees' };

/** Header bell: unread badge (polled), latest notifications, mark read. */
export function NotificationsButton() {
  const qc = useQueryClient();
  const router = useRouter();
  const parentView = useIsParentView();
  const [open, setOpen] = useState(false);
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => apiFetch<{ data: { count: number } }>('/notifications/unread-count').then((r) => r.data.count),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const list = useQuery({
    queryKey: ['notifications', 'latest'],
    queryFn: () => apiFetch<{ data: NotificationItem[] }>('/notifications?limit=12').then((r) => r.data),
    enabled: open,
  });
  const count = unread.data ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  async function openItem(n: NotificationItem) {
    setOpen(false);
    if (!n.readAt) await apiPost(`/notifications/${n.id}/read`).catch(() => null);
    void refresh();
    const route = typeof n.data.route === 'string' ? n.data.route : null;
    if (route) router.push(parentView ? (PARENT_ROUTE[route] ?? route) : route);
  }

  return (
    <Menu open={open} onOpenChange={(o) => { setOpen(o); if (o) void refresh(); }}>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={count ? `Notifications, ${count} unread` : 'Notifications'} className="relative">
          <Bell />
          {count > 0 && (
            <span className="tabular absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-fg-inverse">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </MenuTrigger>
      <MenuContent className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-body font-semibold">Notifications</span>
          {count > 0 && (
            <button className="text-small text-accent-strong hover:underline" onClick={() => void apiPost('/notifications/read-all').then(refresh)}>
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {!list.data ? (
            <div className="flex flex-col gap-3 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : !list.data.length ? (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-subtle text-fg-tertiary">
                <Check className="size-4" />
              </div>
              <p className="text-body font-medium">You're all caught up</p>
              <p className="mt-0.5 text-small text-fg-secondary">Absences, homework and notices will show up here.</p>
            </div>
          ) : (
            list.data.map((n) => {
              const Icon = ICON[n.event] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => void openItem(n)}
                  className={cn('flex w-full gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-hover', !n.readAt && 'bg-accent-tint/50')}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-secondary">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-small', !n.readAt ? 'font-semibold text-fg' : 'text-fg')}>{n.title}</span>
                    <span className="line-clamp-2 block text-small text-fg-secondary">{n.body}</span>
                    <span className="mt-0.5 block text-caption text-fg-tertiary">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                </button>
              );
            })
          )}
        </div>
      </MenuContent>
    </Menu>
  );
}
