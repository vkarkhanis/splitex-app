/**
 * Build-time fallback values injected by platform build scripts.
 *
 * Scripts overwrite this file before native builds and restore it afterwards.
 * During local `expo start`, values usually come from EXPO_PUBLIC_* env vars.
 */
export const BUILD_ENV = {
  REVENUECAT_APPLE_API_KEY: '',
  REVENUECAT_GOOGLE_API_KEY: '',
  REVENUECAT_PRO_ENTITLEMENT_ID: 'pro',
  REVENUECAT_OFFERING_ID: 'default',
} as const;

