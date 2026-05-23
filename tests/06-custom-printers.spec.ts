import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, screenshot } from './helpers/app';

const CH = '06-custom-printers';

test.describe.serial('Custom Printer Definitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);
    // Clear any previous custom printers
    await page.evaluate(() => localStorage.removeItem('phomymo_custom_printers'));
  });

  test('open printer definitions manager', async ({ page }) => {
    await page.click('#print-settings-btn');
    await expect(page.locator('#print-settings-dialog')).toBeVisible();

    await page.click('#manage-printers-btn');
    await expect(page.locator('#printer-defs-dialog')).toBeVisible();

    // Verify list has printers
    const items = page.locator('#printer-defs-list > div');
    const count = await items.count();
    expect(count).toBeGreaterThan(10); // 18 built-in printers

    await screenshot(page, CH, 1, 'printer-defs-list');
  });

  test('add a new custom printer', async ({ page }) => {
    await page.click('#print-settings-btn');
    await page.click('#manage-printers-btn');
    await expect(page.locator('#printer-defs-dialog')).toBeVisible();

    await page.click('#printer-def-add');
    await expect(page.locator('#printer-def-editor')).toBeVisible();
    await screenshot(page, CH, 2, 'new-printer-form');

    await page.locator('#pdef-id').fill('test-printer');
    await page.locator('#pdef-name').fill('Test Custom Printer');
    await page.locator('#pdef-group').fill('Custom');
    await page.locator('#pdef-description').fill('A custom test printer');
    await page.locator('#pdef-protocol').selectOption('m-series');
    await page.locator('#pdef-width').fill('48');

    await screenshot(page, CH, 3, 'new-printer-filled');

    await page.click('#printer-def-save');
    await page.waitForTimeout(300);

    // Verify it appears in the list with custom badge
    await expect(page.locator('#printer-defs-list')).toContainText('Test Custom Printer');
    await expect(page.locator('#printer-defs-list')).toContainText('custom');

    await screenshot(page, CH, 4, 'custom-printer-in-list');
  });

  test('edit a built-in printer', async ({ page }) => {
    await page.click('#print-settings-btn');
    await page.click('#manage-printers-btn');
    await expect(page.locator('#printer-defs-dialog')).toBeVisible();

    // Find the M260 edit button
    const editBtn = page.locator('.pdef-edit-btn[data-id="m260"]');
    await editBtn.click();
    await expect(page.locator('#printer-def-editor')).toBeVisible();

    await screenshot(page, CH, 5, 'editing-builtin');

    // Modify description
    await page.locator('#pdef-description').fill('Modified M260 description');
    await page.click('#printer-def-save');
    await page.waitForTimeout(300);

    // Verify modified badge
    await expect(page.locator('#printer-defs-list')).toContainText('modified');

    await screenshot(page, CH, 6, 'modified-builtin-in-list');
  });

  test('delete a custom printer', async ({ page }) => {
    // First create a custom printer
    await page.click('#print-settings-btn');
    await page.click('#manage-printers-btn');
    await expect(page.locator('#printer-defs-dialog')).toBeVisible();

    await page.click('#printer-def-add');
    await page.locator('#pdef-id').fill('to-delete');
    await page.locator('#pdef-name').fill('Printer To Delete');
    await page.locator('#pdef-group').fill('Custom');
    await page.locator('#pdef-width').fill('48');
    await page.click('#printer-def-save');
    await page.waitForTimeout(300);

    await expect(page.locator('#printer-defs-list')).toContainText('Printer To Delete');

    // Accept the confirm dialog
    page.on('dialog', dialog => dialog.accept());

    // Click delete
    const deleteBtn = page.locator('.pdef-delete-btn[data-id="to-delete"]');
    await deleteBtn.click();
    await page.waitForTimeout(300);

    await expect(page.locator('#printer-defs-list')).not.toContainText('Printer To Delete');

    await screenshot(page, CH, 7, 'after-delete');
  });

  test('reset a modified built-in printer', async ({ page }) => {
    // First modify a built-in
    await page.click('#print-settings-btn');
    await page.click('#manage-printers-btn');
    await expect(page.locator('#printer-defs-dialog')).toBeVisible();

    const editBtn = page.locator('.pdef-edit-btn[data-id="m260"]');
    await editBtn.click();
    await page.locator('#pdef-description').fill('Temp modification');
    await page.click('#printer-def-save');
    await page.waitForTimeout(300);

    await expect(page.locator('#printer-defs-list')).toContainText('modified');

    // Accept confirm dialog
    page.on('dialog', dialog => dialog.accept());

    // Reset
    const resetBtn = page.locator('.pdef-reset-btn[data-id="m260"]');
    await resetBtn.click();
    await page.waitForTimeout(300);

    // The modified badge should be gone for m260
    const m260Row = page.locator('#printer-defs-list > div').filter({ hasText: 'M260' });
    await expect(m260Row).not.toContainText('modified');

    await screenshot(page, CH, 8, 'after-reset');
  });
});
