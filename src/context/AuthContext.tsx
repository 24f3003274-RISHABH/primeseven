import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiRequest, getAuthToken, setAuthToken } from '../api/client.ts';
import { UserProfile } from '../types/domain.ts';

interface AuthContextValue {
  profile: UserProfile | null;
  purchasedSubjectIds: string[];
  stats: {
    purchased_subjects_count: number;
    attempts_total: number;
    attempts_completed: number;
  };
  loading: boolean;
  authError: string | null;
  loginWithEmail: (email: string, password?: string, fullName?: string) => Promise<UserProfile | null>;
  registerWithEmail: (fullName: string, email: string, password: string) => Promise<UserProfile | null>;
  signInWithGoogle: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchRoleView: (targetRole: 'student' | 'admin') => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [purchasedSubjectIds, setPurchasedSubjectIds] = useState<string[]>([]);
  const [stats, setStats] = useState({
    purchased_subjects_count: 0,
    attempts_total: 0,
    attempts_completed: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchBackendSession = useCallback(async (): Promise<UserProfile | null> => {
    const token = getAuthToken();
    if (!token) {
      setProfile(null);
      setPurchasedSubjectIds([]);
      setStats({ purchased_subjects_count: 0, attempts_total: 0, attempts_completed: 0 });
      setLoading(false);
      return null;
    }

    try {
      const data = await apiRequest<{
        user: UserProfile;
        purchased_subject_ids: string[];
        stats: {
          purchased_subjects_count: number;
          attempts_total: number;
          attempts_completed: number;
        };
      }>('/api/v1/auth/me');

      setProfile(data.user);
      setPurchasedSubjectIds(data.purchased_subject_ids || []);
      setStats(data.stats);
      setLoading(false);
      return data.user;
    } catch (err: any) {
      console.error('Failed to verify session:', err);
      setAuthToken(null);
      setProfile(null);
      setPurchasedSubjectIds([]);
      setLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    fetchBackendSession();
  }, [fetchBackendSession]);

  const loginWithEmail = async (
    email: string,
    password = '',
    fullName?: string
  ): Promise<UserProfile | null> => {
    setAuthError(null);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: fullName,
        }),
      });
      setAuthToken(res.token);
      return await fetchBackendSession();
    } catch (err: any) {
      setAuthError(err.message || 'Sign-in failed. Please check your credentials.');
      return null;
    }
  };

  const registerWithEmail = async (
    fullName: string,
    email: string,
    password: string
  ): Promise<UserProfile | null> => {
    setAuthError(null);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        }),
      });
      setAuthToken(res.token);
      return await fetchBackendSession();
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed.');
      return null;
    }
  };

  const signInWithGoogle = async (): Promise<UserProfile | null> => {
    return loginWithEmail('student@primeprep.in', '', 'Aarav Sharma');
  };

  const logout = async (): Promise<void> => {
    setAuthToken(null);
    setProfile(null);
    setPurchasedSubjectIds([]);
    setStats({ purchased_subjects_count: 0, attempts_total: 0, attempts_completed: 0 });
  };

  const refreshProfile = async (): Promise<void> => {
    await fetchBackendSession();
  };

  const switchRoleView = async (targetRole: 'student' | 'admin'): Promise<void> => {
    const res = await apiRequest<{ user: UserProfile }>('/api/v1/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ target_role: targetRole }),
    });
    setProfile(res.user);
  };

  return (
    <AuthContext.Provider
      value={{
        profile,
        purchasedSubjectIds,
        stats,
        loading,
        authError,
        loginWithEmail,
        registerWithEmail,
        signInWithGoogle,
        logout,
        refreshProfile,
        switchRoleView,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
