import { expect, it } from 'vitest';
import {
  vanillaCatalog,
  technologyAtTier,
  availableChoices,
} from '../src/domain/vanilla.js';
import { solveProduction } from '../src/domain/production.js';
it('ships fixed numeric game data and solves 20 plates for 30 iron ore', () => {
  const technology = technologyAtTier(2);
  const plan = solveProduction(vanillaCatalog, {
    targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
    recipes: availableChoices(technology),
    imports: ['Desc_OreIron_C'],
    technology,
  });
  expect(plan.imports).toEqual([{ itemId: 'Desc_OreIron_C', rate: '30' }]);
  expect(
    plan.nodes.find((n) => n.itemId === 'Desc_IronPlate_C')!.machineCount,
  ).toBe(1);
  expect(vanillaCatalog.machines.map((m) => m.name)).not.toContain(
    'Constructor Mk.2',
  );
});
it('gates alternates and machines by explicit technology', () => {
  const basic = technologyAtTier(2);
  expect(basic.unlockedRecipes).not.toContain('Recipe_Alternate_Screw_C');
  expect(basic.availableMachines).not.toContain('Desc_FoundryMk1_C');
  const advanced = technologyAtTier(4, ['Recipe_Alternate_Screw_C']);
  expect(advanced.unlockedRecipes).toContain('Recipe_Alternate_Screw_C');
  expect(advanced.availableMachines).toContain('Desc_FoundryMk1_C');
});
it('uses a solvable unlocked alternate when the standard chain needs unsupported coproducts', () => {
  const profile = technologyAtTier(5, [
    'Recipe_Alternate_CircuitBoard_1_C',
    'Recipe_Silica_C',
  ]);
  const recipes = availableChoices(profile);
  expect(recipes.Desc_CircuitBoard_C).toBe('Recipe_Alternate_CircuitBoard_1_C');
  const plan = solveProduction(vanillaCatalog, {
    targets: [{ itemId: 'Desc_CircuitBoard_C', rate: '7.5' }],
    recipes,
    imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
    technology: profile,
  });
  expect(plan.nodes.map((n) => n.itemId)).not.toContain('Desc_Plastic_C');
  expect(plan.nodes.find((n) => n.itemId === 'Desc_CircuitBoard_C')?.rate).toBe(
    '15/2',
  );
});
it('keeps default chains acyclic and solvable even with every alternate unlocked', () => {
  const profile = technologyAtTier(
    9,
    vanillaCatalog.recipes.map((r) => r.id),
  );
  const recipes = availableChoices(profile);
  for (const itemId of Object.keys(recipes)) {
    expect(
      () =>
        solveProduction(vanillaCatalog, {
          targets: [{ itemId, rate: '1' }],
          recipes,
          imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
          technology: profile,
        }),
      itemId,
    ).not.toThrow();
  }
});
