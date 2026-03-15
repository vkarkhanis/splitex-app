import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  api,
  setTokens,
  clearTokens,
  getToken,
  getResolvedApiBaseUrl,
  registerAuthFailureHandler,
} from '../api';
import { ENV, isLocalLikeEnv } from '../config/env';
import {
  getLocalUnlockState,
  hasStoredPin,
  isBiometricSupported,
  saveLocalUnlockPreferences,
  tryBiometricUnlock,
  verifyPin,
} from '../services/local-session';

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
  preferredCurrency: string;
  sessionLocked: boolean;
  pinSetupRequired: boolean;
  biometricsAvailable: boolean;
  biometricsEnabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  sendEmailLinkSignIn: (email: string) => Promise<void>;
  completeEmailLinkSignIn: (url: string, email?: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchTier: (tier: 'free' | 'pro') => Promise<void>;
  setupPin: (pin: string, enableBiometrics: boolean) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  lockSession: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  tier: 'free',
  capabilities: { multiCurrencySettlement: false },
  internalTester: false,
  preferredCurrency: 'USD',
  sessionLocked: false,
  pinSetupRequired: false,
  biometricsAvailable: false,
  biometricsEnabled: false,
  login: async () => {},
  sendEmailLinkSignIn: async () => {},
  completeEmailLinkSignIn: async () => {},
  loginWithGoogle: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
  switchTier: async () => {},
  setupPin: async () => {},
  unlockWithPin: async () => false,
  unlockWithBiometrics: async () => false,
  lockSession: () => {},
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
  const [preferredCurrency, setPreferredCurrency] = useState('USD');
  const [sessionLocked, setSessionLocked] = useState(false);
  const [pinSetupRequired, setPinSetupRequired] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);

  const applyProfile = useCallback((data: any) => {
    setUser({ userId: data.userId, email: data.email, displayName: data.displayName });
    const serverTier = data?.tier === 'pro' ? 'pro' : 'free';
    const allowLocalTierOverride = ENV.INTERNAL_FEATURES_ENABLED && isLocalLikeEnv();
    const nextTier = allowLocalTierOverride ? (ENV.DEFAULT_TIER === 'pro' ? 'pro' : serverTier) : serverTier;
    setTier(nextTier);
    const serverCapabilities: AuthCapabilities = {
      multiCurrencySettlement: Boolean(data?.capabilities?.multiCurrencySettlement),
    };
    
    console.log('[AuthContext] Profile data:', {
      serverTier: serverTier,
      nextTier,
      serverCapabilities,
      allowLocalTierOverride,
      dataCapabilities: data?.capabilities,
    });
    
    setCapabilities(
      allowLocalTierOverride
        ? { multiCurrencySettlement: nextTier === 'pro' || serverCapabilities.multiCurrencySettlement }
        : serverCapabilities,
    );
    setInternalTester(Boolean(data?.internalTester));
    setPreferredCurrency(data?.preferences?.currency || 'USD');
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await api.get('/api/users/profile');
    applyProfile(data);
  }, [applyProfile]);

  const syncLocalUnlockState = useCallback(async () => {
    const [supported, pinStored, localState] = await Promise.all([
      isBiometricSupported(),
      hasStoredPin(),
      getLocalUnlockState(),
    ]);
    setBiometricsAvailable(supported);
    setBiometricsEnabled(localState.biometricsEnabled && supported);
    setPinSetupRequired(Boolean(user) && !pinStored);
    if (!user) {
      setSessionLocked(false);
    }
  }, [user]);

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
      await clearTokens();
    } finally {
      setLoading(false);
    }
  }, [applyProfile]);

  useEffect(() => { loadUser(); }, [loadUser]);
  useEffect(() => { syncLocalUnlockState().catch(() => {}); }, [syncLocalUnlockState]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/api/auth/login', {
      identifier: email,
      password,
      provider: 'email',
    });
    await setTokens(data.accessToken || data.token, data.refreshToken || data.tokens?.refreshToken);
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

    await setTokens(token, data.refreshToken || data.tokens?.refreshToken);
    await AsyncStorage.removeItem(EMAIL_LINK_PENDING_EMAIL_KEY);
    await loadUser();
  }, [loadUser]);

  const loginWithGoogle = async (idToken: string) => {
    try {
      const { data } = await api.post('/api/auth/google', { token: idToken });
      const token = data.tokens?.accessToken || data.accessToken || data.token;
      if (!token) throw new Error('No token received from server');
      await setTokens(token, data.refreshToken || data.tokens?.refreshToken);
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
    await setTokens(data.accessToken || data.token, data.refreshToken || data.tokens?.refreshToken);
    await loadUser();
  };

  const logout = useCallback(async () => {
    const token = await getToken();
    if (token) {
      try {
        const apiBase = await getResolvedApiBaseUrl();
        await fetch(`${apiBase}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // Best-effort server logout
      }
    }

    await clearTokens();
    setUser(null);
    setTier('free');
    setCapabilities({ multiCurrencySettlement: false });
    setInternalTester(false);
    setPreferredCurrency('USD');
    setSessionLocked(false);
    setPinSetupRequired(false);
    setBiometricsEnabled(false);
    backgroundedAtRef.current = null;
  }, []);

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

  useEffect(() => {
    registerAuthFailureHandler(async (error) => {
      if (error.status !== 401) return;
      await logout();
    });
    return () => registerAuthFailureHandler(null);
  }, [logout]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAtRef.current = Date.now();
        return;
      }

      if (state === 'active' && user) {
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (backgroundedAt && Date.now() - backgroundedAt >= 5 * 60 * 1000) {
          setSessionLocked(true);
        }
      }
    });

    return () => sub.remove();
  }, [user]);

  const setupPin = useCallback(async (pin: string, enableBiometrics: boolean) => {
    await saveLocalUnlockPreferences(pin, enableBiometrics);
    setPinSetupRequired(false);
    setSessionLocked(false);
    await syncLocalUnlockState();
  }, [syncLocalUnlockState]);

  const unlockWithPin = useCallback(async (pin: string) => {
    const ok = await verifyPin(pin);
    if (ok) {
      setSessionLocked(false);
    }
    return ok;
  }, []);

  const unlockWithBiometrics = useCallback(async () => {
    const ok = await tryBiometricUnlock();
    if (ok) {
      setSessionLocked(false);
    }
    return ok;
  }, []);

  const lockSession = useCallback(() => {
    if (user) {
      setSessionLocked(true);
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        tier,
        capabilities,
        internalTester,
        preferredCurrency,
        sessionLocked,
        pinSetupRequired,
        biometricsAvailable,
        biometricsEnabled,
        login,
        sendEmailLinkSignIn,
        completeEmailLinkSignIn,
        loginWithGoogle,
        register,
        logout,
        refreshProfile,
        switchTier,
        setupPin,
        unlockWithPin,
        unlockWithBiometrics,
        lockSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
