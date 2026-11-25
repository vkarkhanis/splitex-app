import { buildMobileDeepLink, detectMobileOS, getMobileSubscribeLinks } from '../../utils/mobile-subscribe';

describe('mobile-subscribe utils', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_MOBILE_DEEPLINK_SCHEME;
    delete process.env.NEXT_PUBLIC_APP_STORE_URL;
    delete process.env.NEXT_PUBLIC_PLAY_STORE_URL;
  });

  it('links to the published store listings, not a search', () => {
    expect(getMobileSubscribeLinks()).toMatchObject({
      appStoreUrl: 'https://apps.apple.com/app/traxettle/id6823113088',
      playStoreUrl: 'https://play.google.com/store/apps/details?id=com.traxettle.app',
    });
  });

  it('lets a build override the store links', () => {
    process.env.NEXT_PUBLIC_APP_STORE_URL = 'https://apps.apple.com/in/app/traxettle/id6823113088';
    expect(getMobileSubscribeLinks().appStoreUrl).toBe('https://apps.apple.com/in/app/traxettle/id6823113088');
  });

  it('detectMobileOS identifies android', () => {
    expect(detectMobileOS('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122.0 Mobile Safari/537.36')).toBe('android');
  });

  it('detectMobileOS identifies iOS', () => {
    expect(detectMobileOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('ios');
  });

  it('detectMobileOS treats iPadOS "Macintosh + Mobile" as iOS', () => {
    expect(detectMobileOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('ios');
  });

  it('buildMobileDeepLink uses default scheme and normalizes path', () => {
    expect(buildMobileDeepLink('/pro')).toBe('com.traxettle.app://pro');
  });

  it('buildMobileDeepLink uses env scheme when provided', () => {
    process.env.NEXT_PUBLIC_MOBILE_DEEPLINK_SCHEME = 'traxettle';
    expect(buildMobileDeepLink('pro')).toBe('traxettle://pro');
  });
});

