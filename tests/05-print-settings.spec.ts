import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, screenshot } from './helpers/app';

const CH = '05-print-settings';

test.describe.serial('Print Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);
  });

  test('open print settings dialog', async ({ page }) => {
    await page.click('#print-settings-btn');
    await expect(page.locator('#print-settings-dialog')).toBeVisible();

    await screenshot(page, CH, 1, 'print-settings-dialog');
  });

  test('printer model dropdown has options', async ({ page }) => {
    await page.click('#print-settings-btn');
    await expect(page.locator('#print-settings-dialog')).toBeVisible();

    const options = page.locator('#printer-model option');
    const count = await options.count();
    expect(count).toBeGreaterThan(5); // Auto + many printers

    const optgroups = page.locator('#printer-model optgroup');
    const groupCount = await optgroups.count();
    expect(groupCount).toBeGreaterThan(0);

    await screenshot(page, CH, 2, 'printer-model-dropdown');
  });

  test('select a printer model', async ({ page }) => {
    await page.click('#print-settings-btn');
    await expect(page.locator('#print-settings-dialog')).toBeVisible();

    await page.locator('#printer-model').selectOption('m260');
    const selected = await page.locator('#printer-model').inputValue();
    expect(selected).toBe('m260');

    await screenshot(page, CH, 3, 'printer-selected');
  });

  test('adjust print density', async ({ page }) => {
    await page.click('#print-settings-btn');
    await expect(page.locator('#print-settings-dialog')).toBeVisible();

    await page.locator('#print-density').fill('4');
    await page.locator('#print-density').dispatchEvent('input');
    await page.waitForTimeout(200);

    const displayValue = await page.locator('#print-density-value').textContent();
    expect(displayValue).toBe('4');

    await screenshot(page, CH, 4, 'density-adjusted');
  });

  test('save and verify persistence', async ({ page }) => {
    await page.click('#print-settings-btn');
    await expect(page.locator('#print-settings-dialog')).toBeVisible();

    await page.locator('#printer-model').selectOption('m260');
    await page.locator('#print-density').fill('4');
    await page.locator('#print-density').dispatchEvent('input');

    await page.click('#print-settings-save');
    await expect(page.locator('#print-settings-dialog')).toBeHidden();

    await screenshot(page, CH, 5, 'settings-saved');

    // Reopen and verify
    await page.click('#print-settings-btn');
    await expect(page.locator('#print-settings-dialog')).toBeVisible();

    const model = await page.locator('#printer-model').inputValue();
    expect(model).toBe('m260');

    await screenshot(page, CH, 6, 'settings-persisted');
  });
});
