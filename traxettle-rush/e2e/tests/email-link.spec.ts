import { test, expect, type Page } from '@playwright/test';

/**
 * The page the mobile app's email-link sign-in lands on (`/auth/email-link`). Firebase appends
 * the sign-in query to the API's continue URL; the page hands it to the app unchanged.
 */

const OOB_CODE = 'Ab3-xY_9zQ8kLmN0pQrStUvWx';
const QUERY = `apiKey=AIzaSyFakeKey_123&mode=signIn&oobCode=${OOB_CODE}&lang=en`;
const PLAY = 'https://play.google.com/store/apps/details?id=com.traxettle.app';
const APP_STORE_RE = /^https:\/\/apps\.apple\.com\/.*id6823113088/;

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
};

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function expectCodeNotShown(page: Page) {
  await expect(page.locator('body')).not.toContainText(OOB_CODE);
  await expect(page.locator('body')).not.toContainText('apiKey');
}

/**
 * Every non-web navigation the page asks Chrome for (app links). Read through the DevTools
 * protocol because Chrome never loads them: with no app to hand them to, it stays on the page.
 */
async function recordAppLaunches(page: Page): Promise<string[]> {
  const launches: string[] = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  cdp.on('Page.frameRequestedNavigation', (event) => {
    if (!/^https?:/.test(event.url)) launches.push(event.url);
  });
  return launches;
}

async function openLanding(page: Page, query = QUERY) {
  await page.goto(`/auth/email-link?${query}`);
  await expect(page.getByTestId('email-link-page')).not.toHaveAttribute('data-view', 'checking');
}

test.describe('Email-link sign-in landing page', () => {
  test.describe('on an Android phone', () => {
    test.use({ ...phone, userAgent: UA.android });

    test('opens the app with an intent link that falls back to Google Play', async ({ page }) => {
      const intentUrl =
        `intent://auth/email-link?${QUERY}#Intent;scheme=com.traxettle.app;package=com.traxettle.app;` +
        `S.browser_fallback_url=${encodeURIComponent(PLAY)};end`;
      const launches = await recordAppLaunches(page);

      await openLanding(page);
      await expect(page.getByTestId('email-link-page')).toHaveAttribute('data-view', 'android');
      await expect(page.getByRole('heading', { name: 'Finish signing in' })).toBeVisible();

      const open = page.getByTestId('email-link-open-app');
      await expect(open).toHaveText('Open in Traxettle');
      await expect(open).toHaveAttribute('href', intentUrl);
      await expect(page.getByText('If you just installed the app, open it and ask for a new sign-in link.')).toBeVisible();
      await expect(page.getByTestId('email-link-app-store')).toHaveCount(0);

      // The app is tried once on load; with nothing to open it, the page stays.
      await expect.poll(() => launches).toEqual([intentUrl]);
      await page.waitForTimeout(500);
      expect(launches).toEqual([intentUrl]);
      await expect(page).toHaveURL(/\/auth\/email-link\?/);
      await expectCodeNotShown(page);
    });
  });

  test.describe('on an iPhone', () => {
    test.use({ ...phone, userAgent: UA.iphone });

    test('offers "Open in Traxettle" plus the stores, and does not redirect by itself', async ({ page }) => {
      const launches = await recordAppLaunches(page);
      await openLanding(page);
      await expect(page.getByTestId('email-link-page')).toHaveAttribute('data-view', 'ios');

      const open = page.getByTestId('email-link-open-app');
      await expect(open).toHaveText('Open in Traxettle');
      await expect(open).toHaveAttribute('href', `com.traxettle.app://auth/email-link?${QUERY}`);
      await expect(page.getByTestId('email-link-app-store')).toHaveAttribute('href', APP_STORE_RE);
      await expect(page.getByTestId('email-link-play-store')).toHaveAttribute('href', PLAY);
      await expect(page.getByText('If you just installed the app, open it and ask for a new sign-in link.')).toBeVisible();

      await page.waitForTimeout(1000);
      expect(launches).toEqual([]);
      await expect(page).toHaveURL(new RegExp(`/auth/email-link\\?${QUERY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      await expectCodeNotShown(page);

      // A tap hands the app the query unchanged.
      await open.click();
      await expect.poll(() => launches).toEqual([`com.traxettle.app://auth/email-link?${QUERY}`]);
    });
  });

  test.describe('on an iPad asking for the desktop site', () => {
    test.use({ viewport: { width: 1024, height: 1366 }, hasTouch: true, userAgent: UA.ipadDesktopMode });

    test('is still treated as iOS', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
      });
      await openLanding(page);
      await expect(page.getByTestId('email-link-page')).toHaveAttribute('data-view', 'ios');
      await expect(page.getByTestId('email-link-open-app')).toHaveAttribute('href', `com.traxettle.app://auth/email-link?${QUERY}`);
    });
  });

  test.describe('on a computer', () => {
    test('asks to open the email on the phone and links to the web sign-in', async ({ page }) => {
      await openLanding(page);
      await expect(page.getByTestId('email-link-page')).toHaveAttribute('data-view', 'desktop');
      await expect(page.getByRole('heading', { name: 'Open this link on your phone' })).toBeVisible();
      await expect(page.getByText('signs you in to the Traxettle app on the phone where you asked for it')).toBeVisible();
      await expect(page.locator('a[href^="intent:"], a[href^="com.traxettle.app:"]')).toHaveCount(0);
      await expectCodeNotShown(page);

      await page.getByTestId('email-link-web-signin').click();
      await expect(page).toHaveURL(/\/auth\/login$/);
    });

    test('keeps the sign-in code out of referrers and search results', async ({ page }) => {
      await openLanding(page);
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    });
  });

  test.describe('with an incomplete link', () => {
    test('says so on a computer', async ({ page }) => {
      await openLanding(page, 'apiKey=AIzaSyFakeKey_123&mode=signIn');
      await expect(page.getByTestId('email-link-page')).toHaveAttribute('data-view', 'incomplete');
      await expect(page.getByRole('heading', { name: 'This sign-in link is incomplete' })).toBeVisible();
      await expect(page.getByText('Ask for a new one in the Traxettle app.')).toBeVisible();
    });

    test.describe('on a phone', () => {
      test.use({ ...phone, userAgent: UA.android });

      test('says so and offers no app link', async ({ page }) => {
        await page.goto('/auth/email-link');
        await expect(page.getByTestId('email-link-page')).toHaveAttribute('data-view', 'incomplete');
        await expect(page.getByRole('heading', { name: 'This sign-in link is incomplete' })).toBeVisible();
        await expect(page.getByTestId('email-link-open-app')).toHaveCount(0);
      });
    });
  });
});
