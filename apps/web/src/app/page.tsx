import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Landing } from '@/components/site/landing';
import { currentSlug } from '@/lib/server-api';
import { serverEnv } from '@/lib/server-env';
import { CONSOLE_HEADER } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  if (!serverEnv.siteOnly && !serverEnv.demo && (await currentSlug())) return {};
  return {
    title: { absolute: 'Bastaa · School management for Indian schools' },
    description: 'Attendance, fees, exams, homework and parent messages in one simple app. The office works on the web; parents and teachers on their phones.',
    robots: { index: true, follow: true },
  };
}

/** The bare domain is the public website; a school's own address goes straight to its dashboard. */
export default async function Home() {
  const [slug, headerStore] = await Promise.all([currentSlug(), headers()]);
  if (serverEnv.siteOnly || serverEnv.demo || (!slug && headerStore.get(CONSOLE_HEADER) !== '1')) return <Landing />;
  redirect('/dashboard');
}
