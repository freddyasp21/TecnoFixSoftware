import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (!getToken()) { setReady(true); return; }
      try {
        const data = await api('/auth/me');
        setUser(data.user);
      } catch {
        setToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    can: (code) => user?.role === 'Administrador' || user?.permissions?.includes(code),
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
