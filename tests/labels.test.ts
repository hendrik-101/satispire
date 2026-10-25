import { expect, test } from 'vitest';
import { recipeUnlocks, vanillaCatalog } from '../src/domain/vanilla.js';
import { localizedName } from '../web/workspace/labels.js';

test('uses authored German labels for items, machines and recipes', () => {
  expect(localizedName('Desc_IronPlate_C')).toBe('Eisenplatte');
  expect(localizedName('Desc_SteelPlate_C')).toBe('Stahlträger');
  expect(localizedName('Desc_ConstructorMk1_C')).toBe('Konstruktor');
  expect(localizedName('Recipe_IronPlate_C')).toBe('Eisenplatte');
  expect(localizedName('Recipe_Alternate_Screw_C')).toBe(
    'Alternativ: Gegossene Schrauben',
  );
  expect(localizedName('Recipe_UnpackageWater_C')).toBe('Wasser auspacken');
});

test('covers every bundled item, machine and recipe without changing source names', () => {
  const before = JSON.stringify(vanillaCatalog);
  for (const entry of [
    ...vanillaCatalog.items,
    ...vanillaCatalog.machines,
    ...vanillaCatalog.recipes,
  ]) {
    const label = localizedName(entry.id, '__missing__');
    expect(label, `${entry.id}: ${entry.name}`).not.toBe('__missing__');
    expect(label, entry.id).not.toBe(entry.id);
    expect(label, entry.id).not.toMatch(/Alternate:|Unpackage /);
    expect(label.trim().length, entry.id).toBeGreaterThan(0);
  }
  expect(JSON.stringify(vanillaCatalog)).toBe(before);
  expect(
    vanillaCatalog.items.find((i) => i.id === 'Desc_IronPlate_C')?.name,
  ).toBe('Iron Plate');
});

test('preserves custom names and stable IDs when no translation exists', () => {
  expect(localizedName('custom:plate', 'Custom plate')).toBe('Custom plate');
  expect(localizedName('custom:plate')).toBe('custom:plate');
  expect(localizedName('custom:plate', '')).toBe('');
  expect(localizedName('Desc_IronPlate_C', 'Iron Plate')).toBe('Eisenplatte');
});

test('keeps alternate methods, conversion inputs and coproduct recipes identifiable', () => {
  for (const recipe of vanillaCatalog.recipes) {
    if (recipeUnlocks[recipe.id]!.alternate) {
      expect(localizedName(recipe.id), recipe.id).toMatch(/^Alternativ: /);
    }
  }
  expect(localizedName('Recipe_FicsiteIngot_AL_C')).toBe(
    'Ficsitbarren (Aluminium)',
  );
  expect(localizedName('Recipe_FicsiteIngot_Iron_C')).toBe(
    'Ficsitbarren (Eisen)',
  );
  // These recipes list a byproduct first; their label must name the main product.
  expect(localizedName('Recipe_Plastic_C')).toBe('Kunststoff');
  expect(localizedName('Recipe_IonizedFuel_C')).toBe('Ionisierter Treibstoff');
  expect(localizedName('Recipe_FicsoniumFuelRod_C')).toBe(
    'Ficsonium-Brennstab',
  );
});
