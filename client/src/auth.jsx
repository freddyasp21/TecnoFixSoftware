import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  async function refreshUser() {
    if (!getToken()) {
      setUser(null);
      return false;
    }
    try {
      const data = await api('/auth/me');
      setUser(data.user);
      return true;
    } catch {
      setToken(null);
      setUser(null);
      return false;
    }
  }

  useEffect(() => {
    (async () => {
      if (!getToken()) { setReady(true); return; }
      await refreshUser();
      setReady(true);
    })();
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    can: (code) => {
      if (!user) return false;
      if (user.role === 'Administrador') return true;
      return Array.isArray(user.permissions) && user.permissions.includes(code);
    },
    async login(username, password) {
      const data = await api('/auth/login', { method: 'POST', body: { username, password } });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    logout() {
      setToken(null);
      setUser(null);
    },
  }), [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
