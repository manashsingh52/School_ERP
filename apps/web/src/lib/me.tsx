'use client';

import type { MeResponse } from '@schoolos/contracts';
import type { Permission, PermissionScope } from '@schoolos/permissions';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface MeValue {
  me: MeResponse;
  /** UI convenience only — the API enforces every permission (docs/09 §2). */
  can: (permission: Permission, scopes?: PermissionScope[]) => boolean;
}

const MeContext = createContext<MeValue | null>(null);

export function MeProvider({ me, children }: { me: MeResponse; children: ReactNode }) {
  const value = useMemo<MeValue>(() => {
    const perms = me.membership?.permissions ?? {};
    return {
      me,
      can: (permission, scopes) => {
        const scope = perms[permission];
        return !!scope && (!scopes || scopes.includes(scope));
      },
    };
  }, [me]);
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): MeValue {
  const value = useContext(MeContext);
  if (!value) throw new Error('useMe must be used inside the signed-in app');
  return value;
}
