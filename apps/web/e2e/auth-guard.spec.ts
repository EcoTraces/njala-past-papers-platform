import { test, expect } from '@playwright/test';

test('visiting a protected route while signed out redirects to /login', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
});

test('visiting a nested protected route while signed out redirects to /login', async ({ page }) => {
  await page.goto('/app/admin/users');
  await expect(page).toHaveURL(/\/login$/);
});
