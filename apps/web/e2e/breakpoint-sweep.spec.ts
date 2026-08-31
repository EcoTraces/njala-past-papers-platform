import { test, expect } from '@playwright/test';

/**
 * Loop 13 (UI/UX quality pass): the brief calls out five specific
 * breakpoints to test at - 360, 390, 768, 1024, 1440px. Rather than a
 * one-off manual check, this sweeps every public page (the only ones
 * renderable without a live backend - see public-navigation.spec.ts)
 * at all five and asserts the one invariant that matters at every
 * single width: no horizontal overflow. This is a real regression
 * class in this codebase (see responsive-layout.spec.ts's Loop 05
 * history) and previously only the landing page had any breakpoint
 * coverage at all - About/Help/Contact/Login/Signup/404 had none.
 */

const BREAKPOINTS = [
  { width: 360, height: 800, label: '360px (small Android)' },
  { width: 390, height: 844, label: '390px (iPhone)' },
  { width: 768, height: 1024, label: '768px (tablet)' },
  { width: 1024, height: 768, label: '1024px (small laptop)' },
  { width: 1440, height: 900, label: '1440px (desktop)' },
];

const PAGES = ['/', '/about', '/help', '/contact', '/login', '/signup', '/this-route-does-not-exist'];

for (const bp of BREAKPOINTS) {
  test.describe(`at ${bp.label}`, () => {
    for (const path of PAGES) {
      test(`${path || '/'} has no horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width: bp.width, height: bp.height });
        await page.goto(path);

        const bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const viewportWidth = await page.evaluate(() => window.innerWidth);
        expect(bodyScrollWidth, `${path} overflows horizontally at ${bp.width}px`).toBeLessThanOrEqual(viewportWidth);
      });
    }
  });
}
