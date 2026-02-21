import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV, getApiUrl, getEmulatorApiUrl, isLocalLikeEnv } from './config/env';

const TOKEN_KEY = '@splitex_token';
const FIREBASE_EMULATOR_KEY = '@splitex_dev_firebase_emulator';

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

export async function clearToken(): Promise<void> {
  return AsyncStorage.removeItem(TOKEN_KEY);
}

export async function isFirebaseEmulatorEnabled(): Promise<boolean> {
  if (!isLocalLikeEnv() || !ENV.LOCAL_DEV_OPTIONS_ENABLED) return false;
  return (await AsyncStorage.getItem(FIREBASE_EMULATOR_KEY)) === 'true';
}

export async function setFirebaseEmulatorEnabled(enabled: boolean): Promise<void> {
  if (!isLocalLikeEnv() || !ENV.LOCAL_DEV_OPTIONS_ENABLED) return;
  await AsyncStorage.setItem(FIREBASE_EMULATOR_KEY, enabled ? 'true' : 'false');
}

export async function getResolvedApiBaseUrl(): Promise<string> {
  if (!isLocalLikeEnv() || !ENV.LOCAL_DEV_OPTIONS_ENABLED) return getApiUrl();
  const useEmulator = await isFirebaseEmulatorEnabled();
  return useEmulator ? getEmulatorApiUrl() : getApiUrl();
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
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
  const res = await fetch(url, {
    ...options,
    headers,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = json?.error || json?.message || `Request failed (${res.status})`;
    throw new ApiRequestError(msg, res.status, json?.code, json?.feature);
  }

  return { data: json.data ?? json, status: res.status };
}

export const api = {
  get: <T = any>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
};
