'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMe } from './me';

type Child = { id: string; name: string; firstName: string; classLabel: string | null; sectionId: string | null };
interface ChildValue {
  children: Child[];
  child: Child | null;
  select: (id: string) => void;
}

const ChildContext = createContext<ChildValue>({ children: [], child: null, select: () => {} });

/** The parent's selected child, remembered per school in this browser (a convenience only). */
export function ChildProvider({ children: content }: { children: ReactNode }) {
  const { me } = useMe();
  const kids = useMemo(() => me.membership?.children ?? [], [me]);
  const key = `sos.child.${me.membership?.school.slug ?? ''}`;
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSelected(localStorage.getItem(key));
    } catch {
      /* storage unavailable */
    }
  }, [key]);
  const select = useCallback(
    (id: string) => {
      setSelected(id);
      try {
        localStorage.setItem(key, id);
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  const child = kids.find((c) => c.id === selected) ?? kids[0] ?? null;
  return <ChildContext.Provider value={{ children: kids, child, select }}>{content}</ChildContext.Provider>;
}

export const useChild = () => useContext(ChildContext);

/** Parents get the simplified parent web view (docs/06 §4); staff who are also parents keep the staff app. */
export function useIsParentView(): boolean {
  const { me, can } = useMe();
  return !!me.membership?.children.length && !can('student.view', ['ALL', 'ASSIGNED']);
}
