export type MobileOS = 'ios' | 'android' | 'other';

function normalizeUA(ua?: string) {
  return String(ua || '').toLowerCase();
}

export function detectMobileOS(userAgent?: string): MobileOS {
  const ua = normalizeUA(userAgent);
  // iPadOS reports as Mac in some UAs but includes "Mobile".
  const isIOS = ua.includes('iphone') || ua.includes('ipad') || (ua.includes('macintosh') && ua.includes('mobile'));
  if (isIOS) return 'ios';
  if (ua.includes('android')) return 'android';
  return 'other';
}

export function getMobileSubscribeLinks() {
  const playStoreUrl =
    process.env.NEXT_PUBLIC_PLAY_STORE_URL ||
    'https://play.google.com/store/apps/details?id=com.traxettle.app';

  // If you don’t have a public iOS App Store URL yet, this falls back to a search page.
  const appStoreUrl =
    process.env.NEXT_PUBLIC_APP_STORE_URL ||
    'https://apps.apple.com/us/search?term=Traxettle';

  const deepLinkScheme = process.env.NEXT_PUBLIC_MOBILE_DEEPLINK_SCHEME || 'com.traxettle.app';

  return { playStoreUrl, appStoreUrl, deepLinkScheme };
}

export function buildMobileDeepLink(path?: string) {
  const { deepLinkScheme } = getMobileSubscribeLinks();
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return `${deepLinkScheme}://${cleanPath}`;
}

export function openMobileAppOrStore(options?: { path?: string }) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

  const { playStoreUrl, appStoreUrl } = getMobileSubscribeLinks();
  const os = detectMobileOS(navigator.userAgent);
  const storeUrl = os === 'android' ? playStoreUrl : os === 'ios' ? appStoreUrl : '';

  // Desktop: don’t try deep links; just open the Pro page UX.
  if (os === 'other') {
    if (storeUrl) window.location.href = storeUrl;
    return;
  }

  const deepLink = buildMobileDeepLink(options?.path || 'pro');

  // Try deep link first, then fall back to store after a short delay.
  // This is best-effort; platforms vary in how they handle custom schemes.
  window.location.href = deepLink;
  window.setTimeout(() => {
    window.location.href = storeUrl;
  }, 900);
}

