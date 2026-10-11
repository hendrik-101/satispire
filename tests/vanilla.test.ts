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
