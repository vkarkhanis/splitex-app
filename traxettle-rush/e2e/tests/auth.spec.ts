import { test, expect } from '@playwright/test';
import { loginAsMockUser, logout } from '../helpers/auth';

test.describe('Authentication Pages', () => {
  test('login page renders supported sign-in options', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /Google/i })).toBeVisible();
    await expect(page.getByText('Phone')).toHaveCount(0);
  });

  test('login submit is disabled when fields are empty', async ({ page }) => {
    await page.goto('/auth/login');
    const submitBtn = page.getByRole('button', { name: 'Sign In', exact: true });
    await expect(submitBtn).toBeDisabled();
  });

  test('login page has link to register', async ({ page }) => {
    await page.goto('/auth/login');
    const registerLink = page.locator('a[href="/auth/register"]').last();
    await expect(registerLink).toBeVisible();
    await registerLink.click();
    await expect(page).toHaveURL(/\/auth\/register/);
  });

  test('register page renders with all form fields', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByLabel('Full Name')).toBeVisible();
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Phone Number')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('register submit is disabled when required fields are empty', async ({ page }) => {
    await page.goto('/auth/register');
    const submitBtn = page.getByRole('button', { name: 'Create Account' });
    await expect(submitBtn).toBeDisabled();
  });

  test('register page has link to login', async ({ page }) => {
    await page.goto('/auth/register');
    const loginLink = page.locator('a[href="/auth/login"]').last();
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('login page shows Google sign-in button', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('button', { name: /Google/i })).toBeVisible();
  });

  test('register page shows Google sign-up button', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.getByRole('button', { name: /Google/i })).toBeVisible();
  });
});

test.describe('Profile Page', () => {
  test('profile page shows sign-in prompt when not authenticated', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByText('not signed in')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('dashboard shell loads authenticated navigation for a mocked session', async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('profile-menu-button')).toBeVisible();
    await expect(page.getByTestId('nav-signin')).toHaveCount(0);
  });

  test('header sign out returns to unauthenticated state', async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto('/dashboard');
    await page.getByTestId('profile-menu-button').click();
    await expect(page.getByTestId('menu-signout')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('menu-signout').click();
    await page.waitForTimeout(500);
    await page.goto('/');
    await expect(page.getByTestId('nav-signin')).toBeVisible();
  });

  test('web session shows lock overlay when auth is invalidated', async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('profile-menu-button')).toBeVisible();

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('traxettle:webAuthUnauthorized'));
    });

    await expect(page.getByText('Session locked')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  test('session lock overlay can sign the user out cleanly', async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('profile-menu-button')).toBeVisible();

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('traxettle:webAuthUnauthorized'));
    });

    await expect(page.getByText('Session locked')).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByTestId('nav-signin')).toBeVisible({ timeout: 10000 });
  });
});
