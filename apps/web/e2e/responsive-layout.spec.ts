import { test, expect } from '@playwright/test';

/**
 * Regression test for a real bug found during a manual responsive
 * audit (see TASK.md, Loop 05): the landing page header had no
 * responsive treatment at all - at a 375px mobile viewport, "About
 * Help Contact Sign in Create student account" all sat in one flex
 * row with no wrapping/collapsing, forcing the row (and therefore the
 * whole page) wider than the viewport.
 *
 * Loop 13 replaced the original fix (hide secondary links, shorten the
 * CTA label) with a shared `PublicHeader` that gives mobile a real
 * hamburger menu instead of silently dropping About/Help/Contact with
 * no way to reach them - "Sign in" is the always-visible quick action
 * (existing students returning to search/practice are the common
 * case), and "Create student account" plus the secondary nav links
 * live inside the menu. The overflow assertion this test exists for
 * still applies at every breakpoint; the specific link visible outside
 * the menu changed on purpose, so the assertions below were updated to
 * match rather than pinning the old implementation detail.
 */

test('the landing page header does not cause horizontal overflow on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  const bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth);

  // The full nav is what caused the overflow; on mobile it now
  // collapses into a hamburger menu, leaving only a compact "Sign in"
  // quick action visible outside it. `exact: true` disambiguates from
  // the page body's unrelated "Staff sign in" link further down.
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle menu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create student account' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'About' })).toBeHidden();
});

test('the landing page mobile menu opens, reveals the full nav, and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  const toggle = page.getByRole('button', { name: 'Toggle menu' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const menu = page.locator('#public-mobile-menu');
  await expect(menu.getByRole('link', { name: 'About' })).toBeVisible();
  // The desktop "Create student account" link stays in the DOM
  // (CSS-hidden below `sm`) even while the mobile menu is open, so
  // this must be scoped to the menu itself to avoid matching both.
  await expect(menu.getByRole('link', { name: 'Create student account' })).toBeVisible();

  const bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth);

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('link', { name: 'About' })).toBeHidden();
});

test('the landing page header shows the full navigation on a desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'About' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create student account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle menu' })).toBeHidden();

  const bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth);
});
