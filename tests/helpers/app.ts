import { Page } from '@playwright/test';
import path from 'path';

/** Wait for the app to fully initialize */
export async function waitForAppReady(page: Page) {
  await page.waitForSelector('#preview-canvas', { timeout: 10_000 });
  await page.waitForFunction(() => {
    return document.querySelector('#preview-canvas')?.getContext?.('2d') !== null;
  });
  // Wait for printer definitions to load and dropdowns to populate
  await page.waitForFunction(() => {
    const select = document.querySelector('#printer-model') as HTMLSelectElement;
    return select && select.options.length > 1;
  }, { timeout: 10_000 });
  await page.waitForTimeout(500);
}

/** Dismiss the info dialog if it appears on first load */
export async function dismissInfoDialog(page: Page) {
  try {
    const closeBtn = page.locator('#info-dialog:not(.hidden) #info-close');
    if (await closeBtn.isVisible({ timeout: 2000 })) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }
  } catch {
    // No dialog visible, that's fine
  }
}

/** Deselect all elements by pressing Escape */
export async function deselectAll(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

/** Take a screenshot saved to docs/screenshots/{chapter}/ */
export async function screenshot(
  page: Page,
  chapter: string,
  step: number,
  description: string
) {
  const dir = path.join('docs', 'screenshots', chapter);
  const filename = `${String(step).padStart(2, '0')}-${description}.png`;
  await page.screenshot({
    path: path.join(dir, filename),
    fullPage: false,
  });
}

/** Take a screenshot of a specific element */
export async function elementScreenshot(
  page: Page,
  selector: string,
  chapter: string,
  step: number,
  description: string
) {
  const dir = path.join('docs', 'screenshots', chapter);
  const filename = `${String(step).padStart(2, '0')}-${description}.png`;
  await page.locator(selector).screenshot({
    path: path.join(dir, filename),
  });
}
