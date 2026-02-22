const DEV_FIREBASE_EMULATOR_KEY = 'splitex.dev.firebaseEmulatorEnabled';

export function getAppEnv(): string {
  return (process.env.NEXT_PUBLIC_APP_ENV || (process.env.NODE_ENV === 'development' ? 'local' : 'production')).toLowerCase();
}

export function isLocalEnv(): boolean {
  return getAppEnv() === 'local';
}

export function getDefaultApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
}

export function getEmulatorApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL_EMULATOR || 'http://localhost:3002').replace(/\/$/, '');
}

export function isFirebaseEmulatorEnabled(): boolean {
  if (typeof window === 'undefined' || !isLocalEnv()) return false;
  return window.localStorage.getItem(DEV_FIREBASE_EMULATOR_KEY) === 'true';
}

export function setFirebaseEmulatorEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || !isLocalEnv()) return;
  window.localStorage.setItem(DEV_FIREBASE_EMULATOR_KEY, enabled ? 'true' : 'false');
}

export function getResolvedApiBaseUrl(): string {
  if (isFirebaseEmulatorEnabled()) return getEmulatorApiBaseUrl();
  return getDefaultApiBaseUrl();
}

