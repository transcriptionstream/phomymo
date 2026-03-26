import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, screenshot } from './helpers/app';

const CH = '01-getting-started';

test.describe.serial('Getting Started', () => {
  test('app loads successfully', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);

    await expect(page.locator('#preview-canvas')).toBeVisible();
    await expect(page.locator('#add-text')).toBeVisible();
    await expect(page.locator('#add-image')).toBeVisible();
    await expect(page.locator('#add-barcode')).toBeVisible();
    await expect(page.locator('#add-qr')).toBeVisible();

    await screenshot(page, CH, 1, 'app-loaded');
  });

  test('interface overview', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);

    await expect(page.locator('#props-panel')).toBeVisible();
    await expect(page.locator('#label-size')).toBeVisible();
    await expect(page.locator('#connect-btn')).toBeVisible();
    await expect(page.locator('#print-btn')).toBeVisible();

    await screenshot(page, CH, 2, 'interface-overview');
  });
});
