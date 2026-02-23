import { getResolvedApiBaseUrl } from '../config/dev-options';

async function getFreshToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return localStorage.getItem('traxettle.authToken');
    const token = await user.getIdToken(true);
    localStorage.setItem('traxettle.authToken', token);
    return token;
  } catch {
    return localStorage.getItem('traxettle.authToken');
  }
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = await getFreshToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const apiBaseUrl = getResolvedApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  const json = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.error || json.message || `Request failed with status ${res.status}`);
  }

  return json;
}

export const api = {
  get: <T = any>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
};
