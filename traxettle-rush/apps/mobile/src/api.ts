import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV, getApiUrl, getEmulatorApiUrl, isLocalLikeEnv } from './config/env';

const TOKEN_KEY = '@traxettle_token';
const REFRESH_TOKEN_KEY = '@traxettle_refresh_token';
const FIREBASE_EMULATOR_KEY = '@traxettle_dev_firebase_emulator';
const STAGING_MODE_KEY = '@traxettle_staging_mode';

type AuthFailureHandler = (error: ApiRequestError) => void | Promise<void>;

let authFailureHandler: AuthFailureHandler | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  feature?: string;

  constructor(message: string, status: number, code?: string, feature?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.feature = feature;
  }
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  return AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  return AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export async function setTokens(accessToken: string, refreshToken?: string | null): Promise<void> {
  await setToken(accessToken);
  if (refreshToken) {
    await setRefreshToken(refreshToken);
  } else {
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export async function clearToken(): Promise<void> {
  return AsyncStorage.removeItem(TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(TOKEN_KEY),
    AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
  ]);
}

export function registerAuthFailureHandler(handler: AuthFailureHandler | null): void {
  authFailureHandler = handler;
}

export async function isFirebaseEmulatorEnabled(): Promise<boolean> {
  if (!isLocalLikeEnv() || !ENV.LOCAL_DEV_OPTIONS_ENABLED) return false;
  return (await AsyncStorage.getItem(FIREBASE_EMULATOR_KEY)) === 'true';
}

export async function setFirebaseEmulatorEnabled(enabled: boolean): Promise<void> {
  if (!isLocalLikeEnv() || !ENV.LOCAL_DEV_OPTIONS_ENABLED) return;
  await AsyncStorage.setItem(FIREBASE_EMULATOR_KEY, enabled ? 'true' : 'false');
}

export async function isStagingModeEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STAGING_MODE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setStagingModeEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(STAGING_MODE_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(STAGING_MODE_KEY);
  }
}

export async function getResolvedApiBaseUrl(): Promise<string> {
  if (isLocalLikeEnv() && ENV.LOCAL_DEV_OPTIONS_ENABLED) {
    const useEmulator = await isFirebaseEmulatorEnabled();
    return useEmulator ? getEmulatorApiUrl() : getApiUrl();
  }

  const useStaging = await isStagingModeEnabled();
  return useStaging ? ENV.STAGING_API_URL : ENV.PROD_API_URL;
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
  allowAuthRetry = true,
): Promise<{ data: T; status: number }> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const apiBase = await getResolvedApiBaseUrl();
  const url = `${apiBase}${path}`;
  console.log(`[api] ${options.method || 'GET'} ${url}`);

  let res: Response;
  const controller = new AbortController();
  const timeoutMs = 25000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (networkError: any) {
    clearTimeout(timeout);
    if (networkError?.name === 'AbortError') {
      throw new ApiRequestError(
        `Request timed out. Please try again.`,
        0,
        'TIMEOUT',
      );
    }
    console.error(`[api] Network error for ${url}:`, networkError?.message);
    throw new ApiRequestError(
      `Unable to reach server. Please check your internet connection and try again.`,
      0,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeout);
  }

  const json = await res.json().catch(() => ({}));

  if (res.status === 401 && allowAuthRetry && path !== '/api/auth/refresh') {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      return request<T>(path, options, false);
    }
  }

  if (!res.ok) {
    const msg = json?.error || json?.message || `Request failed (${res.status})`;
    const error = new ApiRequestError(msg, res.status, json?.code, json?.feature);
    if (res.status === 401 && authFailureHandler) {
      await authFailureHandler(error);
    }
    throw error;
  }

  return { data: json.data ?? json, status: res.status };
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const [{ getAuth }] = await Promise.all([import('firebase/auth')]);
      const auth = getAuth();
      if (auth.currentUser) {
        const firebaseToken = await auth.currentUser.getIdToken(true);
        if (firebaseToken) {
          await setTokens(firebaseToken, null);
          return firebaseToken;
        }
      }
    } catch {
      // Fall back to legacy refresh-token flow if Firebase session refresh is unavailable.
    }

    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    const apiBase = await getResolvedApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await clearTokens();
        return null;
      }

      const nextAccessToken = json?.data?.tokens?.accessToken || json?.data?.accessToken || json?.data?.token;
      const nextRefreshToken = json?.data?.tokens?.refreshToken || json?.data?.refreshToken || refreshToken;
      if (!nextAccessToken) {
        await clearTokens();
        return null;
      }

      await setTokens(nextAccessToken, nextRefreshToken);
      return nextAccessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export const api = {
  get: <T = any>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
};
