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
  APP_ENV:
    ((process.env as any).EXPO_PUBLIC_APP_ENV || (__DEV__ ? 'local' : 'production')) as 'local' | 'staging' | 'production' | 'internal',
  /** Base URL for the Traxettle API */
  API_URL: __DEV__
    ? `http://${DEV_HOST}:3001`
    : 'https://traxettle-api-staging-lomxjapdhq-uc.a.run.app',
  /** Local emulator-backed API URL */
  API_URL_EMULATOR: __DEV__
    ? `http://${DEV_HOST}:3002`
    : 'https://traxettle-api-staging-lomxjapdhq-uc.a.run.app',

  /** WebSocket URL for real-time updates (future use) */
  WS_URL: __DEV__
    ? `ws://${DEV_HOST}:3001/ws`
    : 'wss://traxettle-api-staging-lomxjapdhq-uc.a.run.app/ws',

  /** AsyncStorage key prefix */
  STORAGE_PREFIX: '@traxettle_',

  /** App version shown in settings */
  APP_VERSION: '1.0.0',
  /**
   * Default behavior:
   * - false: keep payment initiation mocked in local/TestFlight/internal environments.
   * - true: request real gateway checkout (still subject to API-side policy).
   */
  USE_REAL_PAYMENTS:
    ((process.env as any).EXPO_PUBLIC_USE_REAL_PAYMENTS || 'false') === 'true',
  /**
   * Local/internal testing override for feature-gated flows.
   * Allowed values: 'free' | 'pro'
   */
  DEFAULT_TIER:
    ((process.env as any).EXPO_PUBLIC_DEFAULT_TIER || 'free') as 'free' | 'pro',
  INTERNAL_FEATURES_ENABLED:
    ((process.env as any).EXPO_PUBLIC_INTERNAL_FEATURES_ENABLED || 'false') === 'true',
  LOCAL_DEV_OPTIONS_ENABLED:
    ((process.env as any).EXPO_PUBLIC_LOCAL_DEV_OPTIONS_ENABLED || 'true') === 'true',

  /**
   * RevenueCat API Keys for in-app purchases.
   * Get these from: RevenueCat Dashboard → Project → API Keys
   * - Apple API Key: Used for iOS App Store purchases
   * - Google API Key: Used for Google Play Store purchases
   *
   * You can also set via EXPO_PUBLIC_REVENUECAT_APPLE_KEY / EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY
   */
  REVENUECAT_APPLE_API_KEY:
    (process.env as any).EXPO_PUBLIC_REVENUECAT_APPLE_KEY || '',
  REVENUECAT_GOOGLE_API_KEY:
    (process.env as any).EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY || '',

  /**
   * RevenueCat entitlement identifier — must match the entitlement ID
   * configured in RevenueCat Dashboard → Entitlements.
   */
  REVENUECAT_PRO_ENTITLEMENT_ID:
    (process.env as any).EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT || 'pro',

  /**
   * RevenueCat offering identifier — must match the offering ID
   * configured in RevenueCat Dashboard → Offerings.
   */
  REVENUECAT_OFFERING_ID:
    (process.env as any).EXPO_PUBLIC_REVENUECAT_OFFERING || 'default',

  /**
   * Google OAuth Client IDs for Google Sign-In.
   * Get these from: Google Cloud Console → APIs & Services → Credentials
   */
  GOOGLE_WEB_CLIENT_ID:
    (process.env as any).EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    (__DEV__
      ? '603084161476-igddelh46pe5l2t0hajsl52da0rici6o.apps.googleusercontent.com'
      : '943648574702-n7h4msh3iho1187po0dnc8tja7insc89.apps.googleusercontent.com'),
  GOOGLE_ANDROID_CLIENT_ID:
    (process.env as any).EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    (__DEV__
      ? '603084161476-ii602klf0go223a0ve690kopl7u5e7a0.apps.googleusercontent.com'
      : '943648574702-0qk99r3oql0sv3k4h6cgluffdqs7letj.apps.googleusercontent.com'),
  GOOGLE_IOS_CLIENT_ID:
    (process.env as any).EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    (__DEV__
      ? '603084161476-j4ht8hs7kk6tqqh273q2ks89udmdc3pe.apps.googleusercontent.com'
      : '943648574702-cvgj086ppdcbqgcagrekjs4pekn0q1ok.apps.googleusercontent.com'),
};

export function isLocalLikeEnv(): boolean {
  return ENV.APP_ENV === 'local' || __DEV__;
}

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
  const platformOverride =
    Platform.OS === 'android'
      ? (process.env as any).EXPO_PUBLIC_API_URL_ANDROID
      : (process.env as any).EXPO_PUBLIC_API_URL_IOS;
  if (platformOverride) return platformOverride;

  // Expo public env vars are inlined at build time
  const override = (process.env as any).EXPO_PUBLIC_API_URL;
  if (override) return override;
  return ENV.API_URL;
}

export function getEmulatorApiUrl(): string {
  const platformOverride =
    Platform.OS === 'android'
      ? (process.env as any).EXPO_PUBLIC_API_URL_EMULATOR_ANDROID
      : (process.env as any).EXPO_PUBLIC_API_URL_EMULATOR_IOS;
  if (platformOverride) return platformOverride;

  const override = (process.env as any).EXPO_PUBLIC_API_URL_EMULATOR;
  if (override) return override;
  const sharedOverride = (process.env as any).EXPO_PUBLIC_API_URL;
  if (sharedOverride) return sharedOverride;
  return ENV.API_URL_EMULATOR;
}
