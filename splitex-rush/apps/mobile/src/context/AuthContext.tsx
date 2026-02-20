import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken, clearToken, getToken } from '../api';
import { ENV } from '../config/env';

interface AuthUser {
  userId: string;
  email: string;
  displayName: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  tier: 'free' | 'pro';
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  upgradeToPro: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  tier: 'free',
  login: async () => {},
  loginWithGoogle: async () => {},
  register: async () => {},
  logout: async () => {},
  upgradeToPro: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<'free' | 'pro'>('free');

  const loadUser = useCallback(async () => {
    console.log('[AuthContext] loadUser called, API_URL:', ENV.API_URL);
    try {
      const token = await getToken();
      console.log('[AuthContext] stored token:', token ? 'exists' : 'none');
      if (!token) { setLoading(false); return; }

      // Add timeout to prevent hanging forever
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const { data } = await api.get('/api/users/profile');
        clearTimeout(timeout);
        setUser({ userId: data.userId, email: data.email, displayName: data.displayName });
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        console.error('[AuthContext] loadUser fetch error:', fetchErr.message);
        throw fetchErr;
      }
    } catch {
      await clearToken();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/api/auth/login', {
      identifier: email,
      password,
      provider: 'email',
    });
    await setToken(data.accessToken || data.token);
    await loadUser();
  };

  const loginWithGoogle = async (idToken: string) => {
    console.log('[AuthContext] loginWithGoogle called, API_URL:', ENV.API_URL);
    try {
      const { data } = await api.post('/api/auth/google', { token: idToken });
      console.log('[AuthContext] Google auth response:', JSON.stringify(data));
      const token = data.tokens?.accessToken || data.accessToken || data.token;
      if (!token) throw new Error('No token received from server');
      await setToken(token);
      await loadUser();
    } catch (err: any) {
      console.error('[AuthContext] loginWithGoogle error:', err.message, err);
      throw err;
    }
  };

  const register = async (email: string, password: string, displayName: string) => {
    const { data } = await api.post('/api/auth/register', {
      email,
      password,
      displayName,
      provider: 'email',
    });
    await setToken(data.accessToken || data.token);
    await loadUser();
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  const upgradeToPro = () => setTier('pro');

  return (
    <AuthContext.Provider value={{ user, loading, tier, login, loginWithGoogle, register, logout, upgradeToPro }}>
      {children}
    </AuthContext.Provider>
  );
};
