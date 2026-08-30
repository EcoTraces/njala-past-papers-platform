import { test, expect } from '@playwright/test';

/**
 * Login-form failure scenarios (Loop 12 QA pass). These stay entirely
 * client-side - react-hook-form's zodResolver blocks the submit
 * handler (and therefore any network call) before validation passes -
 * so, like the signup-form test in public-navigation.spec.ts, they run
 * against the built app with no backend/Supabase project required. A
 * real "wrong password" server-rejection scenario needs an actual
 * account and API response and is out of scope here for the same
 * reason documented in public-navigation.spec.ts.
 */

test('submitting the empty student login form shows a validation error and does not navigate away', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText(/student id/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('submitting the empty staff login form shows a validation error and does not navigate away', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Staff' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText(/valid email/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('an invalid email on the staff login tab is rejected before any submission', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Staff' }).click();
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Password', { exact: true }).fill('whatever');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText(/valid email/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
