import {
  buildAndroidIntentUrl,
  buildAppSignInUrl,
  detectEmailLinkPlatform,
  getSignInQuery,
  resolveEmailLinkView,
  shouldOpenAppOnLoad,
} from '../../utils/email-link';

const PLAY = 'https://play.google.com/store/apps/details?id=com.traxettle.app';

// What Firebase appends to the continue URL (made-up values; the code is a one-time token).
const QUERY =
  'apiKey=AIzaSyFakeKey_123&mode=signIn&oobCode=Ab3-xY_9zQ8kLmN0pQrStUvWx&continueUrl=https%3A%2F%2Ftraxettle.app%2Fauth%2Femail-link&lang=en';

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  // iPadOS Safari's default "desktop website" user agent.
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
};

/** The query the app receives, as the app's AuthContext and Firebase would read it. */
function queryOf(url: string): URLSearchParams {
  const afterQ = url.slice(url.indexOf('?') + 1);
  return new URLSearchParams(afterQ.split('#')[0]);
}

describe('getSignInQuery', () => {
  it('returns the query exactly as received, without the leading "?"', () => {
    expect(getSignInQuery(`?${QUERY}`)).toBe(QUERY);
    expect(getSignInQuery(QUERY)).toBe(QUERY);
  });

  it('keeps encoded characters encoded', () => {
    const q = 'mode=signIn&oobCode=a%2Bb%3D%3D&lang=en';
    expect(getSignInQuery(`?${q}`)).toBe(q);
  });

  it.each([
    ['empty', ''],
    ['just a question mark', '?'],
    ['null', null],
    ['undefined', undefined],
    ['no oobCode', '?apiKey=k&mode=signIn&lang=en'],
    ['empty oobCode', '?mode=signIn&oobCode=&lang=en'],
    ['another mode', '?mode=resetPassword&oobCode=abc'],
    ['no mode', '?oobCode=abc'],
    ['cut off', '?apiKey=AIzaSyFakeKey_123&mo'],
    ['a fragment marker', '?mode=signIn&oobCode=abc#Intent;scheme=evil;end'],
  ])('rejects a missing or garbled link (%s)', (_label, search) => {
    expect(getSignInQuery(search)).toBeNull();
  });
});

describe('buildAppSignInUrl (iPhone and iPad)', () => {
  it('opens the app on its email-link path with the same query', () => {
    const url = buildAppSignInUrl(QUERY);
    expect(url).toBe(`com.traxettle.app://auth/email-link?${QUERY}`);
  });

  it('carries what the app needs to finish signing in', () => {
    const url = buildAppSignInUrl(QUERY);
    // The app's check (AuthContext isEmailLinkSignInUrl).
    expect(url.includes('oobCode=') && url.includes('mode=signIn')).toBe(true);
    expect(queryOf(url).get('oobCode')).toBe('Ab3-xY_9zQ8kLmN0pQrStUvWx');
    expect(queryOf(url).get('apiKey')).toBe('AIzaSyFakeKey_123');
    expect(queryOf(url).get('continueUrl')).toBe('https://traxettle.app/auth/email-link');
  });
});

describe('buildAndroidIntentUrl', () => {
  const url = buildAndroidIntentUrl(QUERY, PLAY);

  it('is an intent link for the app, with the query unchanged before the #Intent part', () => {
    expect(url).toBe(
      `intent://auth/email-link?${QUERY}#Intent;scheme=com.traxettle.app;package=com.traxettle.app;` +
        `S.browser_fallback_url=${encodeURIComponent(PLAY)};end`,
    );
  });

  it('names the app scheme and package, so Chrome opens com.traxettle.app://auth/email-link?<query>', () => {
    const intent = url.slice(url.indexOf('#Intent;') + '#Intent;'.length).split(';');
    expect(intent).toContain('scheme=com.traxettle.app');
    expect(intent).toContain('package=com.traxettle.app');
    expect(intent[intent.length - 1]).toBe('end');
    expect(queryOf(url).get('oobCode')).toBe('Ab3-xY_9zQ8kLmN0pQrStUvWx');
  });

  it('falls back to the Play Store, URL-encoded so it stays one intent extra', () => {
    const extra = url.split(';').find((part) => part.startsWith('S.browser_fallback_url='));
    expect(extra).toBeDefined();
    const encoded = extra!.slice('S.browser_fallback_url='.length);
    expect(encoded).not.toMatch(/[?&=:/]/);
    expect(decodeURIComponent(encoded)).toBe(PLAY);
  });

  it('uses whichever Play Store URL it is given', () => {
    const custom = 'https://play.google.com/store/apps/details?id=com.traxettle.app&hl=en_IN';
    expect(buildAndroidIntentUrl(QUERY, custom)).toContain(`S.browser_fallback_url=${encodeURIComponent(custom)};end`);
  });
});

describe('detectEmailLinkPlatform', () => {
  it.each([
    ['an Android phone', UA.android, 0, 'android'],
    ['an iPhone', UA.iphone, 5, 'ios'],
    ['an iPad', UA.ipad, 5, 'ios'],
    ['an iPad asking for the desktop site', UA.ipadDesktopMode, 5, 'ios'],
    ['a Mac', UA.mac, 0, 'desktop'],
    ['a Windows PC', UA.windows, 0, 'desktop'],
    ['a Windows touch laptop', UA.windows, 10, 'desktop'],
    ['an unknown browser', '', 0, 'desktop'],
  ] as const)('treats %s as %s', (_label, ua, touchPoints, expected) => {
    expect(detectEmailLinkPlatform(ua, touchPoints)).toBe(expected);
  });
});

describe('shouldOpenAppOnLoad', () => {
  it('tries the app on load only on Android (iOS shows an error if the app is missing)', () => {
    expect(shouldOpenAppOnLoad('android')).toBe(true);
    expect(shouldOpenAppOnLoad('ios')).toBe(false);
    expect(shouldOpenAppOnLoad('desktop')).toBe(false);
  });
});

describe('resolveEmailLinkView', () => {
  const base = { search: `?${QUERY}`, playStoreUrl: PLAY };

  it('Android: the intent link, tried on load', () => {
    expect(resolveEmailLinkView({ ...base, userAgent: UA.android })).toEqual({
      kind: 'android',
      appUrl: buildAndroidIntentUrl(QUERY, PLAY),
      openOnLoad: true,
    });
  });

  it('iPhone: the app link, only on a tap', () => {
    expect(resolveEmailLinkView({ ...base, userAgent: UA.iphone, maxTouchPoints: 5 })).toEqual({
      kind: 'ios',
      appUrl: `com.traxettle.app://auth/email-link?${QUERY}`,
      openOnLoad: false,
    });
  });

  it('computer: no app link at all', () => {
    expect(resolveEmailLinkView({ ...base, userAgent: UA.mac })).toEqual({ kind: 'desktop' });
  });

  it('an incomplete link is reported on every device', () => {
    for (const userAgent of [UA.android, UA.iphone, UA.mac]) {
      expect(resolveEmailLinkView({ search: '?mode=signIn', userAgent, playStoreUrl: PLAY })).toEqual({
        kind: 'incomplete',
      });
    }
  });
});
