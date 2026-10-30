'use client';

import type { OnboardingState } from '@schoolos/contracts';
import { Button, Card } from '@schoolos/ui';
import { ArrowRight, Rocket } from 'lucide-react';
import Link from 'next/link';
import { ParentHome } from '@/components/parent/parent-home';
import { StaffHome } from '@/components/dashboard/staff-home';
import { useIsParentView } from '@/lib/child';
import { useData, useSchool } from '@/lib/hooks';
import { greeting, today } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { hindiToday } from '@/lib/i18n-translate';
import { useMe } from '@/lib/me';

export default function DashboardPage() {
  const { me } = useMe();
  const firstName = me.user.name.split(' ')[0];
  const isParent = useIsParentView();
  const { lang, t } = useI18n();
  const date = lang === 'hi' ? hindiToday() : today();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-display font-semibold tracking-[-0.02em]">
          {t(greeting())}, {firstName}.
        </h1>
        <p className="mt-1 text-body text-fg-secondary">{date} · {t('Here’s what needs you today.')}</p>
      </div>
      {isParent ? <ParentHome /> : <><SetupCard /><StaffHome /></>}
    </div>
  );
}

/** Shown until the school goes live (Master Prompt §22). */
function SetupCard() {
  const { can } = useMe();
  const school = useSchool();
  const enabled = can('school.settings.manage') && school.data?.status === 'ONBOARDING';
  const state = useData<OnboardingState>(['onboarding'], '/onboarding', { enabled });
  if (!enabled || !state.data) return null;
  const done = state.data.checklist.filter((c) => c.done).length;
  return (
    <Card className="flex flex-wrap items-center gap-4 border-accent bg-accent-tint p-5">
      <span className="flex size-10 items-center justify-center rounded-lg bg-surface text-accent-strong shadow-e1"><Rocket className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">Finish setting up your school</div>
        <div className="text-small text-fg-secondary">{done} of {state.data.checklist.length} done · step {state.data.step} of 10</div>
      </div>
      <Button asChild><Link href="/onboarding">Continue setup <ArrowRight /></Link></Button>
    </Card>
  );
}

