import { test, expect } from '@playwright/test';
import { loginAsMockUser, logout } from '../helpers/auth';

test.describe('Authentication Pages', () => {
  test('login page renders with email/phone tabs', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.getByText('Phone')).toBeVisible();
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('login submit is disabled when fields are empty', async ({ page }) => {
    await page.goto('/auth/login');
    const submitBtn = page.getByRole('button', { name: 'Sign In' });
    await expect(submitBtn).toBeDisabled();
  });

  test('login page has link to register', async ({ page }) => {
    await page.goto('/auth/login');
    const registerLink = page.getByRole('link', { name: 'Register' });
    await expect(registerLink).toBeVisible();
    await registerLink.click();
    await expect(page).toHaveURL(/\/auth\/register/);
  });

  test('register page renders with all form fields', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.getByText('Create Account')).toBeVisible();
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
    const loginLink = page.getByRole('link', { name: 'Sign in' });
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

  test('login page phone tab shows phone input', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByText('Phone').click();
    await expect(page.getByLabel('Phone Number')).toBeVisible();
    await expect(page.getByRole('button', { name: /Send Verification Code/i })).toBeVisible();
  });
});

test.describe('Profile Page', () => {
  test('profile page shows sign-in prompt when not authenticated', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByText('not signed in')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('profile page loads user data when authenticated', async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto('/profile');
    // Should show profile form (display name, email fields)
    await expect(page.getByLabel('Display name')).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign out/i })).toBeVisible();
  });

  test('profile page sign out returns to unauthenticated state', async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto('/profile');
    await expect(page.getByRole('button', { name: /Sign out/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Sign out/i }).click();
    await page.waitForTimeout(500);
    await page.goto('/');
    await expect(page.getByTestId('nav-signin')).toBeVisible();
  });
});
