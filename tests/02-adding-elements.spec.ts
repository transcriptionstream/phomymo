import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, deselectAll, screenshot } from './helpers/app';
import path from 'path';

const CH = '02-adding-elements';

test.describe.serial('Adding Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);
  });

  test('add text element', async ({ page }) => {
    await page.click('#add-text');
    await page.waitForTimeout(200);
    // Dismiss inline editor
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    await expect(page.locator('#props-text')).toBeVisible();
    const content = await page.locator('#prop-text-content').inputValue();
    expect(content).toContain('Text');

    await screenshot(page, CH, 1, 'text-element-added');
  });

  test('add barcode element', async ({ page }) => {
    await page.click('#add-barcode');
    await page.waitForTimeout(300);

    await expect(page.locator('#props-barcode')).toBeVisible();
    const data = await page.locator('#prop-barcode-data').inputValue();
    expect(data).toBeTruthy();

    await screenshot(page, CH, 2, 'barcode-element-added');
  });

  test('add QR code element', async ({ page }) => {
    await page.click('#add-qr');
    await page.waitForTimeout(300);

    await expect(page.locator('#props-qr')).toBeVisible();
    const data = await page.locator('#prop-qr-data').inputValue();
    expect(data).toContain('http');

    await screenshot(page, CH, 3, 'qr-element-added');
  });

  test('add shape element', async ({ page }) => {
    await page.click('#add-shape-btn');
    await expect(page.locator('#shape-dropdown')).toBeVisible();
    await screenshot(page, CH, 4, 'shape-dropdown');

    await page.click('button[data-shape="rectangle"]');
    await page.waitForTimeout(300);

    await expect(page.locator('#props-shape')).toBeVisible();

    await screenshot(page, CH, 5, 'rectangle-element-added');
  });

  test('add image element', async ({ page }) => {
    const fixtureImage = path.join(__dirname, 'fixtures', 'sample-image.png');
    await page.locator('#image-file-input').setInputFiles(fixtureImage);
    await page.waitForTimeout(500);

    await expect(page.locator('#props-image')).toBeVisible();

    await screenshot(page, CH, 6, 'image-element-added');
  });

  test('canvas with multiple elements', async ({ page }) => {
    await page.click('#add-text');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await deselectAll(page);

    await page.click('#add-barcode');
    await page.waitForTimeout(300);
    await deselectAll(page);

    await page.click('#add-qr');
    await page.waitForTimeout(300);
    await deselectAll(page);

    await page.click('#add-shape-btn');
    await page.click('button[data-shape="rectangle"]');
    await page.waitForTimeout(300);

    await screenshot(page, CH, 7, 'all-elements-on-canvas');
  });
});
