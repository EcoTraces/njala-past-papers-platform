import { test, expect } from '@playwright/test';

/**
 * Regression test for a real bug found during a manual responsive
 * audit (see TASK.md, Loop 05): the landing page header had no
 * responsive treatment at all - at a 375px mobile viewport, "About
 * Help Contact Sign in Create student account" all sat in one flex
 * row with no wrapping/collapsing, forcing the row (and therefore the
 * whole page) wider than the viewport. That produced both a wrapped,
 * three-line logo and a horizontal scrollbar/empty margin on every
 * public page sharing the header. Fixed by hiding the secondary nav
 * links and shortening the primary CTA below the `sm` breakpoint.
 */

test('the landing page header does not cause horizontal overflow on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  const bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth);

  // The full-length CTA text is what caused the overflow; on mobile it
  // should be replaced with a shorter label instead of forcing width.
  await expect(page.getByRole('link', { name: 'Create student account' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
});

test('the landing page header shows the full navigation on a desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'About' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create student account' })).toBeVisible();

  const bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth);
});
