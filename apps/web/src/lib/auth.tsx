'use client';

import type { AuthResponse, LoginInput, MeResponse, RegisterInput } from '@tasknest/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession, setAccessToken } from './api';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  /** True after an explicit logout, so guards send users to /login without a ?next= */
  signedOut: boolean;
  me: MeResponse | null;
  login: (input: LoginInput) => Promise<MeResponse>;
  register: (input: RegisterInput) => Promise<MeResponse>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<MeResponse | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const qc = useQueryClient();

  const reloadMe = useCallback(async () => {
    try {
      const data = await api<MeResponse>('/me');
      setMe(data);
      setStatus('authenticated');
      return data;
    } catch {
      setMe(null);
      setStatus('anonymous');
      return null;
    }
  }, []);

  // On first load, try to restore the session from the refresh cookie
  useEffect(() => {
    refreshSession().then((s) => {
      if (s) reloadMe();
      else setStatus('anonymous');
    });
  }, [reloadMe]);

  const startSession = useCallback(
    async (res: AuthResponse) => {
      setAccessToken(res.accessToken);
      setSignedOut(false);
      const data = await reloadMe();
      if (!data) throw new Error('Could not load your account');
      return data;
    },
    [reloadMe],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      signedOut,
      me,
      reloadMe,
      login: async (input) => startSession(await api<AuthResponse>('/auth/login', { method: 'POST', json: input })),
      register: async (input) => startSession(await api<AuthResponse>('/auth/register', { method: 'POST', json: input })),
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        setAccessToken(null);
        setSignedOut(true);
        setMe(null);
        setStatus('anonymous');
        qc.clear();
      },
    }),
    [status, signedOut, me, reloadMe, startSession, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Where a signed-in user should land: their first workspace, or onboarding if they have none. */
export const homePath = (me: MeResponse) => (me.workspaces[0] ? `/w/${me.workspaces[0].slug}` : '/onboarding');
