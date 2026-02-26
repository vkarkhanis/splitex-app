import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setToken, clearToken, getToken } from '../api';
import { ENV, isLocalLikeEnv } from '../config/env';

interface AuthUser {
  userId: string;
  email: string;
  displayName: string;
}

interface AuthCapabilities {
  multiCurrencySettlement: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  tier: 'free' | 'pro';
  capabilities: AuthCapabilities;
  internalTester: boolean;
  login: (email: string, password: string) => Promise<void>;
  sendEmailLinkSignIn: (email: string) => Promise<void>;
  completeEmailLinkSignIn: (url: string, email?: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchTier: (tier: 'free' | 'pro') => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  tier: 'free',
  capabilities: { multiCurrencySettlement: false },
  internalTester: false,
  login: async () => {},
  sendEmailLinkSignIn: async () => {},
  completeEmailLinkSignIn: async () => {},
  loginWithGoogle: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
  switchTier: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const EMAIL_LINK_PENDING_EMAIL_KEY = '@traxettle_pending_email_link_email';

function isEmailLinkSignInUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.includes('oobCode=') && url.includes('mode=signIn');
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<'free' | 'pro'>(ENV.DEFAULT_TIER === 'pro' ? 'pro' : 'free');
  const [capabilities, setCapabilities] = useState<AuthCapabilities>({
    multiCurrencySettlement: ENV.DEFAULT_TIER === 'pro',
  });
  const [internalTester, setInternalTester] = useState(false);

  const applyProfile = useCallback((data: any) => {
    setUser({ userId: data.userId, email: data.email, displayName: data.displayName });
    const serverTier = data?.tier === 'pro' ? 'pro' : 'free';
    const allowLocalTierOverride = ENV.INTERNAL_FEATURES_ENABLED && isLocalLikeEnv();
    const nextTier = allowLocalTierOverride ? (ENV.DEFAULT_TIER === 'pro' ? 'pro' : serverTier) : serverTier;
    setTier(nextTier);
    const serverCapabilities: AuthCapabilities = {
      multiCurrencySettlement: Boolean(data?.capabilities?.multiCurrencySettlement),
    };
    setCapabilities(
      allowLocalTierOverride
        ? { multiCurrencySettlement: nextTier === 'pro' || serverCapabilities.multiCurrencySettlement }
        : serverCapabilities,
    );
    setInternalTester(Boolean(data?.internalTester));
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await api.get('/api/users/profile');
    applyProfile(data);
  }, [applyProfile]);

  const loadUser = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) { setLoading(false); return; }

      try {
        const { data } = await api.get('/api/users/profile');
        applyProfile(data);
      } catch (fetchErr: any) {
        throw fetchErr;
      }
    } catch {
      await clearToken();
    } finally {
      setLoading(false);
    }
  }, [applyProfile]);

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

  const sendEmailLinkSignIn = async (email: string) => {
    const normalized = email.trim().toLowerCase();
    await api.post('/api/auth/email-link/send', { email: normalized });
    await AsyncStorage.setItem(EMAIL_LINK_PENDING_EMAIL_KEY, normalized);
  };

  const completeEmailLinkSignIn = useCallback(async (url: string, emailOverride?: string) => {
    const storedEmail = await AsyncStorage.getItem(EMAIL_LINK_PENDING_EMAIL_KEY);
    const email = (emailOverride || storedEmail || '').trim().toLowerCase();
    if (!email) {
      throw new Error('Enter your email first, then tap the sign-in link from your inbox.');
    }

    const { data } = await api.post('/api/auth/email-link/complete', { email, link: url });
    const token = data.tokens?.accessToken || data.accessToken || data.token;
    if (!token) throw new Error('No token received from server');

    await setToken(token);
    await AsyncStorage.removeItem(EMAIL_LINK_PENDING_EMAIL_KEY);
    await loadUser();
  }, [loadUser]);

  const loginWithGoogle = async (idToken: string) => {
    try {
      const { data } = await api.post('/api/auth/google', { token: idToken });
      const token = data.tokens?.accessToken || data.accessToken || data.token;
      if (!token) throw new Error('No token received from server');
      await setToken(token);
      await loadUser();
    } catch (err: any) {
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
    setTier('free');
    setCapabilities({ multiCurrencySettlement: false });
    setInternalTester(false);
  };

  const switchTier = async (nextTier: 'free' | 'pro') => {
    await api.post('/api/internal/entitlements/switch', { tier: nextTier });
    await refreshProfile();
  };

  useEffect(() => {
    let active = true;

    const processUrl = async (url?: string | null) => {
      if (!active || !url || !isEmailLinkSignInUrl(url)) return;
      try {
        await completeEmailLinkSignIn(url);
      } catch (err) {
        console.warn('Email link completion failed:', err);
      }
    };

    Linking.getInitialURL().then(processUrl).catch(() => {});
    const sub = Linking.addEventListener('url', (evt) => {
      processUrl(evt?.url).catch(() => {});
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, [completeEmailLinkSignIn]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        tier,
        capabilities,
        internalTester,
        login,
        sendEmailLinkSignIn,
        completeEmailLinkSignIn,
        loginWithGoogle,
        register,
        logout,
        refreshProfile,
        switchTier,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
