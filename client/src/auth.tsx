import React, { createContext, useCallback, useContext, useState } from 'react';

export interface Auth {
  player_id: string;
  api_key: string;
  city_id: string;
  username: string;
}

interface AuthContextType {
  auth: Auth | null;
  login: (auth: Auth) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'trademmo_auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<Auth | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Auth) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((newAuth: Auth) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newAuth));
    localStorage.setItem('api_key', newAuth.api_key);
    setAuth(newAuth);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('api_key');
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
}
