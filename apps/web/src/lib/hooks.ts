'use client';

import type { FileInfo, FilePurpose, SchoolProfile, UploadTicket } from '@schoolos/contracts';
import { toast } from '@schoolos/ui';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, apiFetch, apiPost } from './api-client';

/** GET an endpoint that answers `{ data: T }` and unwrap it. */
export function useData<T>(key: QueryKey, path: string | null, opts: { enabled?: boolean; staleTime?: number } = {}) {
  return useQuery({
    queryKey: key,
    queryFn: () => apiFetch<{ data: T }>(path!).then((r) => r.data),
    enabled: !!path && (opts.enabled ?? true),
    staleTime: opts.staleTime,
  });
}

/**
 * A user action: runs `fn`, shows a toast, refreshes the given queries. Errors show as a toast
 * unless the caller handles them (e.g. to put field errors on a form).
 */
export function useAction<TInput, TResult>(
  fn: (input: TInput) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onSuccess?: (r: TResult) => void; quietErrors?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await Promise.all((opts.invalidate ?? []).map((key) => qc.invalidateQueries({ queryKey: key })));
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result) : opts.success);
      opts.onSuccess?.(result);
    },
    onError: (error) => {
      if (opts.quietErrors && error instanceof ApiError && error.details?.length) return;
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
    },
  });
}

/**
 * Put server-side field errors (422/409 details) onto a React Hook Form, focusing (and so scrolling
 * to) the first one — the submit button is often far below it. Returns true if any matched.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: string[]): boolean {
  if (!(error instanceof ApiError) || !error.details?.length) return false;
  let matched = false;
  for (const d of error.details) {
    if (d.field && fields.includes(d.field)) {
      setError(d.field as Path<T>, { message: d.message }, { shouldFocus: !matched });
      matched = true;
    }
  }
  return matched;
}

/** Upload through the signed-URL pipeline (docs/09 §3): link → PUT → server checks real type. */
export async function uploadFile(file: File, purpose: FilePurpose): Promise<FileInfo> {
  const ticket = await apiPost<{ data: UploadTicket }>('/files/upload-url', {
    purpose,
    fileName: file.name,
    mimeType: file.type || (file.name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'application/octet-stream'),
    sizeBytes: file.size,
  });
  const { url, headers } = ticket.data.upload;
  // Our own BFF (local storage in development) needs the CSRF header; cloud storage links must not get it.
  const sameOrigin = url.startsWith('/');
  const put = await fetch(url, {
    method: 'PUT',
    headers: sameOrigin ? { ...headers, 'x-schoolos-csrf': '1' } : headers,
    body: file,
    credentials: sameOrigin ? 'same-origin' : 'omit',
  });
  if (!put.ok) throw new ApiError(put.status, 'UPLOAD_FAILED', "The upload didn't finish. Please try again.");
  return (await apiPost<{ data: FileInfo }>(`/files/${ticket.data.fileId}/complete`)).data;
}

export function useSchool() {
  return useData<SchoolProfile>(['school'], '/school', { staleTime: 60_000 });
}

/**
 * A tab kept in the address (?tab=…), so a link, a refresh or the back button opens the same tab.
 * Unknown values fall back to the first tab; the first tab keeps the URL clean.
 */
export function useTabParam<T extends string>(allowed: readonly T[], fallback: T = allowed[0]!): [T, (next: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get('tab');
  const tab = allowed.find((t) => t === raw) ?? fallback;
  const set = useCallback(
    (next: T) => {
      const q = new URLSearchParams(params.toString());
      if (next === fallback) q.delete('tab');
      else q.set('tab', next);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router, fallback],
  );
  return [tab, set];
}
