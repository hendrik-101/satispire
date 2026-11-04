import { expect, it } from 'vitest';
import {
  vanillaCatalog,
  technologyAtTier,
  availableChoices,
  availableRecipes,
  recipeUnlocks,
} from '../src/domain/vanilla.js';
import { solveProduction } from '../src/domain/production.js';
it('binds the active numeric catalog to the licensed 1.2.4.0 build instead of relabelling 1.0', () => {
  expect(vanillaCatalog.catalogVersion).toBe(
    'vanilla-1.2.4.0-mcdowell-a3313235-v1',
  );
  expect(vanillaCatalog.provenance.manifest).toMatchObject({
    gameVersion: '1.2.4.0',
    build: '502094',
    sourceUrl:
      'https://github.com/GMcDowellJr/satisfactory_progression_planner/tree/a3313235d94ac1ab2e0bc4626cdb5ee6dd1f4bef/planning_data/game/reference',
  });
});
it('keeps the 1.2 Turbofuel MAM unlock separate from hard-drive alternates', () => {
  const id = 'Recipe_Alternate_Turbofuel_C';
  expect(recipeUnlocks[id]).toMatchObject({ alternate: false, tier: null });
  expect(recipeUnlocks[id]!.unlockIds).toContain('Research_Sulfur_TurboFuel_C');
  expect(technologyAtTier(9).unlockedRecipes).not.toContain(id);
  expect(technologyAtTier(9, [id]).unlockedRecipes).toContain(id);
});
it('keeps 1.2 game modifiers explicit rather than calculating them as default recipes', () => {
  const technology = technologyAtTier(2);
  const modified = {
    targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
    recipes: availableChoices(technology),
    imports: ['Desc_OreIron_C'],
    recipeCostMultiplier: '1.75',
  };
  expect(() => solveProduction(vanillaCatalog, modified)).toThrow(
    /unsupported.*recipeCostMultiplier/i,
  );
});
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
it('prefers the standard circuit board chain now its plastic coproduct recipe is supported', () => {
  const profile = technologyAtTier(5, [
    'Recipe_Alternate_CircuitBoard_1_C',
    'Recipe_Silica_C',
  ]);
  const recipes = availableChoices(profile);
  expect(recipes.Desc_CircuitBoard_C).toBe('Recipe_CircuitBoard_C');
  const plan = solveProduction(vanillaCatalog, {
    targets: [{ itemId: 'Desc_CircuitBoard_C', rate: '7.5' }],
    recipes,
    imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
    technology: profile,
  });
  expect(plan.nodes.map((n) => n.itemId)).toContain('Desc_Plastic_C');
  expect(plan.nodes.find((n) => n.itemId === 'Desc_CircuitBoard_C')?.rate).toBe(
    '15/2',
  );
});
it('solves default chains or explicitly diagnoses manufactured recycling with every unlock', () => {
  const profile = technologyAtTier(
    9,
    vanillaCatalog.recipes.map((r) => r.id),
  );
  const recipes = availableChoices(profile);
  // These newly reachable coproduct chains require manufactured feedback;
  // unlike raw-water recycling, that remains outside the planner contract.
  const feedbackTargets = new Set([
    'Desc_CrystalShard_C',
    'Desc_QuantumOscillator_C',
    'Desc_AlienPowerFuel_C',
    'Desc_IonizedFuel_C',
    'Desc_UraniumCell_C',
    'Desc_NobeliskNuke_C',
    'Desc_NuclearFuelRod_C',
    'Desc_PackagedIonizedFuel_C',
    'Desc_SpaceElevatorPart_11_C',
    'Desc_SpaceElevatorPart_12_C',
  ]);
  for (const itemId of Object.keys(recipes)) {
    const solve = () =>
      solveProduction(vanillaCatalog, {
        targets: [{ itemId, rate: '1' }],
        recipes,
        imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
        technology: profile,
      });
    if (feedbackTargets.has(itemId)) expect(solve, itemId).toThrow(/cycle/i);
    else expect(solve, itemId).not.toThrow();
  }
});
it('selects alternatives using the explicit resource import policy', () => {
  const profile = technologyAtTier(2, ['Recipe_Alternate_Wire_1_C']);
  const imports = ['Desc_OreIron_C'];
  const recipes = availableChoices(profile, imports);
  expect(recipes.Desc_CopperSheet_C).toBeUndefined();
  expect(recipes.Desc_Wire_C).toBe('Recipe_Alternate_Wire_1_C');
  expect(() =>
    solveProduction(vanillaCatalog, {
      targets: [{ itemId: 'Desc_Wire_C', rate: '22.5' }],
      recipes,
      imports,
      technology: profile,
    }),
  ).not.toThrow();
});
it('rejects manufactured and unknown imports consistently with the solver', () => {
  const profile = technologyAtTier(2);
  const imports = ['Desc_IronIngot_C'];
  expect(() => availableChoices(profile, imports)).toThrow(/raw catalog items/);
  expect(() => availableChoices(profile, ['unknown:item'])).toThrow(
    /raw catalog items/,
  );
});

it('offers all oil outputs at tier five and keeps the recipes locked below it', () => {
  const basic = availableRecipes(technologyAtTier(4));
  const oil = availableRecipes(technologyAtTier(5));
  for (const id of [
    'Recipe_Rubber_C',
    'Recipe_Plastic_C',
    'Recipe_LiquidFuel_C',
  ]) {
    expect(basic.some((recipe) => recipe.id === id)).toBe(false);
    expect(oil.some((recipe) => recipe.id === id)).toBe(true);
  }
  const choices = availableChoices(technologyAtTier(5));
  expect(choices.Desc_Rubber_C).toBe('Recipe_Rubber_C');
  expect(choices.Desc_Plastic_C).toBe('Recipe_Plastic_C');
  expect(choices.Desc_LiquidFuel_C).toBe('Recipe_LiquidFuel_C');
  expect(choices.Desc_HeavyOilResidue_C).toBeDefined();
  expect(choices.Desc_PolymerResin_C).toBeDefined();
});
