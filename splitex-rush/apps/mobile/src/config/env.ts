import { Platform } from 'react-native';

/**
 * Mobile app environment configuration.
 *
 * In development (__DEV__ = true), the app connects to the local API server.
 * Android emulator uses 10.0.2.2 to reach host machine's localhost.
 * For real-device testing on the same Wi-Fi network, replace with your
 * machine's LAN IP address (e.g. 192.168.1.42).
 *
 * In production, it points to the deployed API.
 */

const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const ENV = {
  /** Base URL for the Splitex API */
  API_URL: __DEV__
    ? `http://${DEV_HOST}:3001`
    : 'https://api.splitex.app',

  /** WebSocket URL for real-time updates (future use) */
  WS_URL: __DEV__
    ? `ws://${DEV_HOST}:3001/ws`
    : 'wss://api.splitex.app/ws',

  /** AsyncStorage key prefix */
  STORAGE_PREFIX: '@splitex_',

  /** App version shown in settings */
  APP_VERSION: '1.0.0',

  /**
   * Google OAuth Client IDs for Google Sign-In via expo-auth-session.
   * Get these from: Google Cloud Console → APIs & Services → Credentials
   * The Expo/Web client ID is used for the OAuth redirect.
   * The Android client ID must match the SHA-1 of your signing key.
   * The iOS client ID must match your iOS bundle identifier.
   *
   * You can also set these via EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, etc.
   */
  GOOGLE_WEB_CLIENT_ID:
    (process.env as any).EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    '368026022797-fbiqh6sgmcel4r6kblcg16tb3pa12nn1.apps.googleusercontent.com',
  GOOGLE_ANDROID_CLIENT_ID:
    (process.env as any).EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '368026022797-v07qjj1ns2j1lv7dka6rsds89besfiud.apps.googleusercontent.com',
  GOOGLE_IOS_CLIENT_ID:
    (process.env as any).EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '368026022797-qvfan0k9d0e4jktefqu15r8jaqhetg86.apps.googleusercontent.com',
};

/**
 * Override API_URL for real-device testing.
 * Set this to your machine's LAN IP before running on a physical device.
 *
 * Usage (in your terminal before starting Expo):
 *   EXPO_PUBLIC_API_URL=http://192.168.1.42:3001 npx expo start
 *
 * Then in code, process.env.EXPO_PUBLIC_API_URL will be available.
 */
export function getApiUrl(): string {
  // Expo public env vars are inlined at build time
  const override = (process.env as any).EXPO_PUBLIC_API_URL;
  if (override) return override;
  return ENV.API_URL;
}
