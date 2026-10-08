'use client';

import type {
  AcademicYearItem,
  AssignmentItem,
  ClassItem,
  ClassSubjectItem,
  PageResponse,
  SubjectItem,
  TeacherListItem,
} from '@schoolos/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useData } from './hooks';

/** Query keys, so mutations can refresh the right lists. */
export const keys = {
  years: ['academic-years'] as const,
  classes: (yearId?: string) => ['classes', yearId ?? 'current'] as const,
  subjects: ['subjects'] as const,
  classSubjects: (yearId?: string) => ['class-subjects', yearId ?? 'current'] as const,
  assignments: (q: string) => ['assignments', q] as const,
  teachersAll: ['teachers', 'all'] as const,
};

export const useYears = () => useData<AcademicYearItem[]>(keys.years, '/academic-years');

export const useClasses = (yearId?: string) =>
  useData<ClassItem[]>(keys.classes(yearId), `/classes${yearId ? `?academicYearId=${yearId}` : ''}`);

export const useSubjects = () => useData<SubjectItem[]>(keys.subjects, '/subjects');

export const useClassSubjects = (yearId?: string) =>
  useData<ClassSubjectItem[]>(keys.classSubjects(yearId), `/class-subjects${yearId ? `?academicYearId=${yearId}` : ''}`);

export const useAssignments = (query: string) => useData<AssignmentItem[]>(keys.assignments(query), `/teaching-assignments?${query}`);

/** Active teachers for pickers (V1 schools have well under 100). */
export function useTeacherOptions(enabled = true) {
  return useQuery({
    queryKey: keys.teachersAll,
    queryFn: () => apiFetch<PageResponse<TeacherListItem>>('/teachers?pageSize=100').then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

/** "Class 8" + "A" → "8-A" */
export const sectionLabel = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;
