import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/usr/bin/chromium',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173');
  await page.locator('main.workspace[data-ready="true"]').waitFor();
  await page.getByLabel('Zielrate pro Minute').fill('320');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page.getByLabel('Reihen', { exact: true }).selectOption('3');
  await mkdir('docs/qa', { recursive: true });
  await page.screenshot({
    path: 'docs/qa/vanilla-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await page.screenshot({ path: 'docs/qa/vanilla-panels.png', fullPage: true });
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/qa/vanilla-mobile.png', fullPage: true });
  await page.locator('.view-options summary').click();
  await page.screenshot({
    path: 'docs/qa/vanilla-mobile-sheet.png',
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page
    .getByLabel('Produktionsziel')
    .selectOption('Desc_IronPlateReinforced_C');
  await page.getByLabel('Zielrate pro Minute').fill('20');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlateReinforced_C');
  await page.screenshot({
    path: 'docs/qa/vanilla-assembler.png',
    fullPage: true,
  });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Captured desktop, panels and mobile; no browser page errors.');
} finally {
  await browser.close();
}
