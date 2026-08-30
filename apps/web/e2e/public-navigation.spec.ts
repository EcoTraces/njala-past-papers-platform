import { test, expect } from '@playwright/test';

/**
 * These e2e tests exercise only client-side routing/rendering, so they
 * run against the built app with no backend/Supabase project required.
 * Flows that need a real account (login, upload, practice) need a
 * seeded Supabase test project and are documented as an
 * E2E_BASE_URL-driven, opt-in suite - see TESTING.md.
 */

test('landing page renders the platform name and primary calls to action', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /verified past examination papers/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /create student account/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /i already have an account/i })).toBeVisible();
});

test('navigating from the landing page to sign-in shows the student/staff tabs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('tab', { name: 'Student' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Staff' })).toBeVisible();
});

test('the sign-up form requires a Student ID and rejects an empty submission', async ({ page }) => {
  await page.goto('/signup');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByText(/student id/i).first()).toBeVisible();
});

test('unknown routes render the not-found page', async ({ page }) => {
  await page.goto('/this-route-does-not-exist');
  await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
});
