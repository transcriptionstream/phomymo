import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, deselectAll, screenshot, elementScreenshot } from './helpers/app';

const CH = '03-element-properties';

test.describe.serial('Element Properties', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);
  });

  test('text element properties', async ({ page }) => {
    await page.click('#add-text');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    await expect(page.locator('#props-text')).toBeVisible();
    await elementScreenshot(page, '#props-panel', CH, 1, 'text-properties-panel');

    // Modify text content
    await page.locator('#prop-text-content').fill('Hello World');
    await page.locator('#prop-text-content').dispatchEvent('input');
    await page.waitForTimeout(200);

    // Modify font size
    await page.locator('#prop-font-size').fill('36');
    await page.locator('#prop-font-size').dispatchEvent('change');
    await page.waitForTimeout(200);

    const content = await page.locator('#prop-text-content').inputValue();
    expect(content).toBe('Hello World');

    await screenshot(page, CH, 2, 'text-properties-modified');
  });

  test('barcode element properties', async ({ page }) => {
    await page.click('#add-barcode');
    await page.waitForTimeout(300);

    await expect(page.locator('#props-barcode')).toBeVisible();
    await elementScreenshot(page, '#props-panel', CH, 3, 'barcode-properties-panel');

    await page.locator('#prop-barcode-data').fill('PHOMYMO-TEST');
    await page.locator('#prop-barcode-data').dispatchEvent('input');
    await page.waitForTimeout(200);

    await screenshot(page, CH, 4, 'barcode-properties-modified');
  });

  test('QR code element properties', async ({ page }) => {
    await page.click('#add-qr');
    await page.waitForTimeout(300);

    await expect(page.locator('#props-qr')).toBeVisible();
    await elementScreenshot(page, '#props-panel', CH, 5, 'qr-properties-panel');

    await page.locator('#prop-qr-data').fill('https://phomymo.affordablemagic.net');
    await page.locator('#prop-qr-data').dispatchEvent('input');
    await page.waitForTimeout(200);

    await screenshot(page, CH, 6, 'qr-properties-modified');
  });

  test('shape element properties', async ({ page }) => {
    await page.click('#add-shape-btn');
    await page.click('button[data-shape="ellipse"]');
    await page.waitForTimeout(300);

    await expect(page.locator('#props-shape')).toBeVisible();
    await elementScreenshot(page, '#props-panel', CH, 7, 'shape-properties-panel');

    await page.locator('#prop-shape-type').selectOption('triangle');
    await page.waitForTimeout(200);

    await screenshot(page, CH, 8, 'shape-properties-modified');
  });

  test('position and size properties', async ({ page }) => {
    await page.click('#add-text');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    await expect(page.locator('#prop-x')).toBeVisible();
    await expect(page.locator('#prop-y')).toBeVisible();
    await expect(page.locator('#prop-width')).toBeVisible();
    await expect(page.locator('#prop-height')).toBeVisible();

    await screenshot(page, CH, 9, 'position-properties');
  });
});
