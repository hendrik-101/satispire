import { expect, test, type Page } from '@playwright/test';
import { createUnlockProfile } from '../../src/domain/session-unlocks';
import type { WebTool } from '../../src/adapters/webmcp';

const url = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';
async function ready(page: Page) {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
}
async function installSessionTools(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, unknown>();
    Object.assign(window, { workspaceTools: tools });
    Object.defineProperty(document, 'modelContext', {
      value: {
        registerTool: (tool: { name: string }) => tools.set(tool.name, tool),
        unregisterTool: (name: string) => tools.delete(name),
      },
    });
  });
}

test('shared locks mark the old plan and disable export until recalculation under current unlocks', async ({
  page,
}) => {
  await installSessionTools(page);
  await ready(page);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('HUB-Tier').selectOption('3');
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await page.getByLabel('Produktionsziel').selectOption('Desc_SteelIngot_C');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  const result = await page.evaluate(async (profile) => {
    const tools = (
      window as unknown as { workspaceTools: Map<string, WebTool> }
    ).workspaceTools;
    return tools.get('apply_command')!.execute({
      roomId: 'local',
      command: {
        id: 'lock-foundry',
        expectedRevision: 1,
        command: { type: 'set-unlocks', profile },
      },
    });
  }, createUnlockProfile(2));
  expect(result.ok).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Plan exportieren', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('status')).toContainText(
    'frühere Session-Unlocks',
  );
  await page.getByLabel('Reihen', { exact: true }).selectOption('2');
  await expect(
    page.getByRole('button', { name: 'Plan exportieren', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Produktionsziel').selectOption('Desc_IronPlate_C');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Plan exportieren', exact: true }),
  ).toBeEnabled();
});

test('blocked browser storage retains applied session settings and shows a notice', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
  });
  await ready(page);
  await expect(page.getByRole('status')).toContainText(
    'Browser-Speicherung eingeschränkt',
  );
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('HUB-Tier').selectOption('4');
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await expect(page.getByLabel('HUB-Tier')).toHaveValue('4');
});

test('session commands update the UI and a stale open dialog cannot overwrite newer settings', async ({
  page,
}) => {
  await installSessionTools(page);
  await ready(page);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('HUB-Tier').selectOption('3');
  const profile = createUnlockProfile(7);
  const result = await page.evaluate(async (profile) => {
    const tools = (
      window as unknown as { workspaceTools: Map<string, WebTool> }
    ).workspaceTools;
    return tools.get('apply_command')!.execute({
      roomId: 'local',
      command: {
        id: 'another-participant',
        expectedRevision: 0,
        command: { type: 'set-unlocks', profile },
      },
    });
  }, profile);
  expect(result.ok).toBe(true);
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('inzwischen geändert');
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await expect(page.getByLabel('HUB-Tier')).toHaveValue('7');
});

test('restores a custom profile whose usable targets exclude the default iron plate plan', async ({
  page,
}) => {
  await ready(page);
  const profile = createUnlockProfile(3);
  profile.hubTier = null;
  profile.technology.availableMachines = ['Desc_FoundryMk1_C'];
  profile.technology.unlockedRecipes = ['Recipe_IngotSteel_C'];
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'steel.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: profile.catalogVersion,
        unlocks: profile,
        production: {
          targets: [{ itemId: 'Desc_SteelIngot_C', rate: '20' }],
          recipes: { Desc_SteelIngot_C: 'Recipe_IngotSteel_C' },
          imports: ['Desc_OreIron_C', 'Desc_Coal_C'],
        },
      }),
    ),
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Produktionsziel')).toHaveValue(
    'Desc_SteelIngot_C',
  );
  await page.reload();
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Produktionsziel')).toHaveValue(
    'Desc_SteelIngot_C',
  );
});
test('applied session unlocks survive reload and initialize a fresh session from browser defaults', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('HUB-Tier').selectOption('4');
  await expect(
    page.getByLabel('Abgeschlossene Space-Elevator-Phase'),
  ).toHaveValue('1');
  await page.getByLabel('Rezepte suchen').fill('Cast Screw');
  await page
    .getByLabel('Rezept Alternate: Cast Screw', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await expect(
    page.getByLabel('Abgeschlossene Space-Elevator-Phase'),
  ).toHaveValue('1');
  await expect(
    page.getByLabel('Maschine Foundry', { exact: true }),
  ).toBeChecked();
  await page.getByLabel('Rezepte suchen').fill('Cast Screw');
  await expect(
    page.getByLabel('Rezept Alternate: Cast Screw', { exact: true }),
  ).toBeChecked();
  await page
    .getByLabel('Abgeschlossene Space-Elevator-Phase')
    .selectOption('2');
  await expect(
    page.getByLabel('Rezept Alternate: Cast Screw', { exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await expect(
    page.getByLabel('Maschine Foundry', { exact: true }),
  ).toBeChecked();
  await page.getByLabel('HUB-Tier').selectOption('9');
  await page
    .getByLabel('Abgeschlossene Space-Elevator-Phase')
    .selectOption('0');
  await expect(page.getByLabel('HUB-Tier')).toHaveValue('2');
  await expect(
    page.getByLabel('Maschine Foundry', { exact: true }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await expect(
    page.getByLabel('Abgeschlossene Space-Elevator-Phase'),
  ).toHaveValue('1');
});
