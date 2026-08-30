import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppRole, StudentSignupInput } from '@njala/shared';
import { supabase } from '../lib/supabaseClient';
import { api } from '../lib/apiClient';

interface AuthProfile {
  id: string;
  studentId: string | null;
  staffId: string | null;
  fullName: string;
  status: string;
  roles: AppRole[];
}

interface AuthSessionResponse {
  session: { accessToken: string; refreshToken: string; expiresAt: number };
  profile: AuthProfile;
}

interface AuthContextValue {
  user: AuthProfile | null;
  loading: boolean;
  loginStudent: (studentId: string, password: string) => Promise<void>;
  loginStaff: (email: string, password: string) => Promise<void>;
  signupStudent: (input: StudentSignupInput) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function hydrateFromResponse(res: AuthSessionResponse): Promise<void> {
  await supabase.auth.setSession({ access_token: res.session.accessToken, refresh_token: res.session.refreshToken });
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setUser(null);
        return;
      }
      const res = await api.get<{ user: AuthProfile }>('/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshMe().finally(() => setLoading(false));

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        void refreshMe();
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, [refreshMe]);

  const loginStudent = useCallback(async (studentId: string, password: string) => {
    const res = await api.post<AuthSessionResponse>('/auth/login', { studentId, password }, { auth: false });
    await hydrateFromResponse(res);
    setUser(res.profile);
  }, []);

  const loginStaff = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthSessionResponse>('/auth/staff-login', { email, password }, { auth: false });
    await hydrateFromResponse(res);
    setUser(res.profile);
  }, []);

  const signupStudent = useCallback(async (input: StudentSignupInput) => {
    const res = await api.post<AuthSessionResponse>('/auth/signup', input, { auth: false });
    await hydrateFromResponse(res);
    setUser(res.profile);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles: AppRole[]) => Boolean(user && user.roles.some((r) => roles.includes(r))), [user]);

  const value = useMemo(
    () => ({ user, loading, loginStudent, loginStaff, signupStudent, logout, hasRole }),
    [user, loading, loginStudent, loginStaff, signupStudent, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
