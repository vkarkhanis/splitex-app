/**
 * Links for the email-link sign-in landing page (`/auth/email-link`).
 *
 * The mobile app asks the API for a sign-in email; Firebase sends the user to this page with
 * `?apiKey=…&mode=signIn&oobCode=…&lang=…`. The page hands that query, unchanged, to the
 * Traxettle app (`com.traxettle.app://auth/email-link?<query>`), which finishes signing in with
 * the email address it saved when the link was requested (see the app's AuthContext).
 *
 * The query is a one-time sign-in code: never render it as text or log it.
 */
import { detectMobileOS } from './mobile-subscribe';

export const APP_SCHEME = 'com.traxettle.app';
export const ANDROID_PACKAGE = 'com.traxettle.app';
export const APP_EMAIL_LINK_PATH = 'auth/email-link';

export type EmailLinkPlatform = 'ios' | 'android' | 'desktop';

/**
 * The sign-in query without its leading `?`, or `null` when the link is missing or garbled
 * (no `mode=signIn`, no `oobCode`). The returned string is the query exactly as received.
 */
export function getSignInQuery(search: string | null | undefined): string | null {
  const query = String(search || '').replace(/^\?/, '');
  if (!query || query.includes('#')) return null;
  const params = new URLSearchParams(query);
  if (params.get('mode') !== 'signIn' || !params.get('oobCode')) return null;
  return query;
}

/** The app's own link, `com.traxettle.app://auth/email-link?<query>`. Used on iPhone and iPad. */
export function buildAppSignInUrl(query: string): string {
  return `${APP_SCHEME}://${APP_EMAIL_LINK_PATH}?${query}`;
}

/**
 * An Android intent link: Chrome opens the app with the same URL as `buildAppSignInUrl`, or
 * goes to `playStoreUrl` when the app isn't installed.
 */
export function buildAndroidIntentUrl(query: string, playStoreUrl: string): string {
  return (
    `intent://${APP_EMAIL_LINK_PATH}?${query}` +
    `#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end`
  );
}

/**
 * Which version of the page to show. `maxTouchPoints` catches iPads, whose Safari asks for the
 * desktop site by default and so sends a Mac user agent.
 */
export function detectEmailLinkPlatform(userAgent: string, maxTouchPoints = 0): EmailLinkPlatform {
  const os = detectMobileOS(userAgent);
  if (os === 'ios' || os === 'android') return os;
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'desktop';
}

/**
 * Android may try the app as soon as the page loads (Chrome falls back to Google Play by itself).
 * iOS must wait for a tap: Safari shows an error when the app isn't installed.
 */
export function shouldOpenAppOnLoad(platform: EmailLinkPlatform): boolean {
  return platform === 'android';
}

export type EmailLinkView =
  | { kind: 'incomplete' }
  | { kind: 'desktop' }
  | { kind: 'android'; appUrl: string; openOnLoad: boolean }
  | { kind: 'ios'; appUrl: string; openOnLoad: boolean };

/** Everything the page needs to decide what to show, from the browser it's running in. */
export function resolveEmailLinkView(input: {
  search: string;
  userAgent: string;
  maxTouchPoints?: number;
  playStoreUrl: string;
}): EmailLinkView {
  const query = getSignInQuery(input.search);
  if (!query) return { kind: 'incomplete' };

  const platform = detectEmailLinkPlatform(input.userAgent, input.maxTouchPoints);
  if (platform === 'android') {
    return {
      kind: 'android',
      appUrl: buildAndroidIntentUrl(query, input.playStoreUrl),
      openOnLoad: shouldOpenAppOnLoad(platform),
    };
  }
  if (platform === 'ios') {
    return { kind: 'ios', appUrl: buildAppSignInUrl(query), openOnLoad: shouldOpenAppOnLoad(platform) };
  }
  return { kind: 'desktop' };
}
