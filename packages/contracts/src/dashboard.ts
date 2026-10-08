import type { TodaySchedule } from './timetable.js';

export interface AttentionItem {
  key: string;
  tone: 'danger' | 'warning' | 'info';
  title: string;
  detail?: string;
  href: string;
}

/** Role-aware home page data (Master Prompt §21): each block is null when the caller can't see it. */
export interface DashboardData {
  date: string;
  isWeeklyOff: boolean;
  kpis: {
    students: number | null;
    teachers: number | null;
    /** Present-equivalent % across submitted registers today. */
    presentPercent: number | null;
    absentToday: number | null;
    registers: { taken: number; total: number } | null;
  };
  attention: AttentionItem[];
  /** Registers the caller marks that are still open today. */
  myRegisters: { sectionId: string; label: string; status: 'NOT_TAKEN' | 'DRAFT' }[];
  /** Teachers: today's classes. */
  today: TodaySchedule | null;
}
