import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog } from './helpers/app';

/**
 * End-to-end tests for the server sync layer (sync.js + server/).
 * The Playwright webServer runs with PHOMYMO_TEST=1: in-memory SQLite and
 * the /api/testing/reset route enabled.
 */

async function resetServer(request: APIRequestContext) {
  const res = await request.post('/api/testing/reset');
  expect(
    res.ok(),
    'POST /api/testing/reset failed — is a non-test server already running on port 8081?'
  ).toBe(true);
}

async function getServerState(request: APIRequestContext) {
  const res = await request.get('/api/state');
  expect(res.ok()).toBe(true);
  return res.json();
}

async function openApp(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForAppReady(page);
  await dismissInfoDialog(page);
}

/** Add a text element and save the design under the given name. */
async function saveDesignAs(page: Page, name: string) {
  await page.click('#add-text');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.click('#save-btn');
  await page.locator('#save-name').fill(name);
  await page.click('#save-confirm');
  await page.waitForTimeout(200);
}

test.describe.serial('Server Sync', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await openApp(page);
  });

  test('design round-trips through the server', async ({ page, request }) => {
    await saveDesignAs(page, 'Sync Test');

    // Background flush is debounced; poll until the design lands server-side
    await expect
      .poll(async () => (await getServerState(request)).designs['Sync Test']?.deleted)
      .toBe(false);

    // Simulate a fresh machine: wipe localStorage, reload, reconcile pulls
    await page.evaluate(() => localStorage.clear());
    await openApp(page);

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('phomymo_designs') || ''))
      .toContain('Sync Test');

    await page.click('#load-btn');
    await expect(page.locator('#design-list')).toContainText('Sync Test');

    // Loading it should close the dialog without errors
    await page.locator('.design-item', { hasText: 'Sync Test' }).click();
    await expect(page.locator('#load-dialog')).toBeHidden();
  });

  test('design name with special characters round-trips (URL encoding)', async ({ page, request }) => {
    // Slashes are rejected by validateDesignName, but %, & and # are allowed
    // and all need URL encoding in the PUT path
    await saveDesignAs(page, '100% cotton & labels #2');

    await expect
      .poll(async () => (await getServerState(request)).designs['100% cotton & labels #2']?.deleted)
      .toBe(false);
  });

  test('delete propagates and tombstone prevents resurrection', async ({ page, request }) => {
    await saveDesignAs(page, 'Doomed');
    await expect
      .poll(async () => (await getServerState(request)).designs['Doomed']?.deleted)
      .toBe(false);

    // Delete via the load dialog (native confirm())
    page.on('dialog', (dialog) => dialog.accept());
    await page.click('#load-btn');
    await page.locator('.delete-design[data-name="Doomed"]').click();

    await expect
      .poll(async () => (await getServerState(request)).designs['Doomed']?.deleted)
      .toBe(true);

    // Simulate a stale machine that still has the design but has never
    // synced it: reconcile must honor the newer server tombstone, not
    // resurrect the design.
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        'phomymo_designs',
        JSON.stringify({
          Doomed: { elements: [], labelSize: { width: 40, height: 30 }, savedAt: 1000 },
        })
      );
    });
    await openApp(page);

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('phomymo_designs') || '{}'))
      .not.toContain('Doomed');

    // And the server still holds the tombstone (stale copy was not pushed)
    const state = await getServerState(request);
    expect(state.designs['Doomed'].deleted).toBe(true);
  });

  test('multi-label preset round-trips through the server', async ({ page, request }) => {
    // Saving a preset uses window.prompt for the name
    page.on('dialog', (dialog) => dialog.accept('Sync/Preset 50%'));

    await page.locator('#label-size').selectOption('multi-label');
    await expect(page.locator('#multi-label-modal')).toBeVisible();
    await page.click('#multi-label-save-preset');

    await expect
      .poll(async () => {
        const state = await getServerState(request);
        return state.multi_label_presets['Sync/Preset 50%']?.deleted;
      })
      .toBe(false);

    // Fresh machine
    await page.evaluate(() => localStorage.clear());
    await openApp(page);

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('phomymo_multi_label_presets') || ''))
      .toContain('Sync/Preset 50%');

    await page.locator('#label-size').selectOption('multi-label');
    await expect(page.locator('#multi-label-modal')).toBeVisible();
    await expect(page.locator('#multi-label-preset option', { hasText: 'Sync/Preset 50%' })).toHaveCount(1);
  });

  test('custom printer round-trips through the server', async ({ page, request }) => {
    await page.click('#print-settings-btn');
    await page.click('#manage-printers-btn');
    await expect(page.locator('#printer-defs-dialog')).toBeVisible();

    await page.click('#printer-def-add');
    await page.locator('#pdef-id').fill('sync-printer');
    await page.locator('#pdef-name').fill('Sync Test Printer');
    await page.locator('#pdef-group').fill('Custom');
    await page.locator('#pdef-width').fill('48');
    await page.click('#printer-def-save');

    await expect
      .poll(async () => {
        const state = await getServerState(request);
        return state.custom_printers['sync-printer']?.deleted;
      })
      .toBe(false);

    // Fresh machine: reconcile pulls the definition and refreshes the dropdown
    await page.evaluate(() => localStorage.clear());
    await openApp(page);

    await expect
      .poll(() => page.locator('#printer-model').innerText())
      .toContain('Sync Test Printer');
  });

  test('app works locally when the sync API is unreachable', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort());

    await openApp(page);
    await saveDesignAs(page, 'Offline Design');

    await page.click('#load-btn');
    await expect(page.locator('#design-list')).toContainText('Offline Design');

    // No error toast appeared
    await expect(page.locator('#toast-container .bg-red-600')).toHaveCount(0);
  });
});
