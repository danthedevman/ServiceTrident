import { clearRecordTabs } from '../components/record-navigation.jsx';
import { useLocation } from 'react-router-dom';
import { PreferencesProvider } from '../preferences/ui-preferences.jsx';

import { useQuery } from '@tanstack/react-query';
import { setSessionUser } from '../data/query-client.js';

import { AuthContext } from './auth-context.js';

import React, { useEffect } from 'react';

import { api } from '../data/api.js';

/** The session is fetched once; private queries remain disabled until authentication succeeds. */
export function AuthProvider({ children }) {
  const publicStatus = useLocation().pathname.startsWith('/status/public/');
  const session = useQuery({
    queryKey: ['session'],
    enabled: !publicStatus,
    queryFn: ({ signal }) => api('/auth/me', { signal }),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    const expire = () => {
      clearRecordTabs();
      setSessionUser(null);
    };
    const synchronize = (event) => {
      if (event.key !== 'servicetrident-role-change') return;
      // Remove the old view before any new-role requests can finish.
      window.location.reload();
    };
    window.addEventListener('storage', synchronize);
    window.addEventListener('session-expired', expire);
    return () => {
      window.removeEventListener('session-expired', expire);
      window.removeEventListener('storage', synchronize);
    };
  }, []);
  return (
    <AuthContext.Provider
      value={{
        user: publicStatus ? null : (session.data?.user ?? null),
        setUser: setSessionUser,
        loading: !publicStatus && session.isPending,
      }}
    >
      <PreferencesProvider>{children}</PreferencesProvider>
    </AuthContext.Provider>
  );
}
