import { expect, it } from 'vitest';
import { generateSupplyLayout } from '../src/domain/supply-layout.js';
import {
  vanillaCatalog,
  technologyAtTier,
  availableChoices,
} from '../src/domain/vanilla.js';
import { solveProduction } from '../src/domain/production.js';
const technology = technologyAtTier(4);
const input = {
  targets: [{ itemId: 'Desc_IronPlate_C', rate: '320' }],
  recipes: availableChoices(technology),
  imports: ['Desc_OreIron_C'],
  technology,
};
it('generates automatic and manual row variants with identical floor area', () => {
  const plan = solveProduction(vanillaCatalog, input);
  const layout = generateSupplyLayout(vanillaCatalog, plan, technology, 0);
  expect(layout.floors).toHaveLength(2);
  expect(
    layout.floors.every(
      (f) => JSON.stringify(f.footprint) === JSON.stringify(layout.footprint),
    ),
  ).toBe(true);
  const manual = generateSupplyLayout(vanillaCatalog, plan, technology, 3);
  expect(
    manual.floors.find((f) => f.itemId === 'Desc_IronPlate_C')!.rowCounts,
  ).toEqual([6, 5, 5]);
  expect(manual.floors[0]!.physicalFootprint).toBeNull();
  expect(manual.floors[0]!.physicalPorts).toBeNull();
});
it('separates licensed 1.2 machine bounds, hard clearance and local ports from schematic placement', () => {
  const layout = generateSupplyLayout(
    vanillaCatalog,
    solveProduction(vanillaCatalog, input),
    technology,
    0,
  );
  const constructor = layout.floors.find(
    (f) => f.itemId === 'Desc_IronPlate_C',
  )!;
  expect(constructor.machineGeometry).toMatchObject({
    units: 'm',
    bounds: { size: { width: 7.574, depth: 9.632, height: 8.307 } },
    clearance: { size: { width: 8, depth: 10, height: 6 } },
    provenance: { license: 'MIT', gameVersion: '1.2', gameBuild: null },
  });
  expect(constructor.machineGeometry!.ports).toContainEqual({
    id: 'Input0',
    direction: 'in',
    position: [0, -3, 1],
    facing: [0, -1, 0],
  });
  expect(layout.units).toBe('logical');
  expect(constructor.physicalFootprint).toBeNull();
  expect(constructor.physicalPorts).toBeNull();
});
it('leaves unsupported machines and other catalog versions without invented geometry', async () => {
  const { getMachineGeometry } = await import(
    '../src/domain/machine-geometry.js'
  );
  expect(
    getMachineGeometry(vanillaCatalog.catalogVersion, 'Desc_Blender_C'),
  ).toBeNull();
  expect(
    getMachineGeometry(
      'vanilla-1.0-tools-a1eb2fef-v1',
      'Desc_ConstructorMk1_C',
    ),
  ).toBeNull();
  expect(
    getMachineGeometry(vanillaCatalog.catalogVersion, 'toString'),
  ).toBeNull();
});
it('sizes supply lanes for current belts and orients logical output towards lifts', () => {
  const plan = solveProduction(vanillaCatalog, input);
  const low = generateSupplyLayout(
    vanillaCatalog,
    plan,
    { ...technology, beltTier: 1 },
    0,
  );
  const high = generateSupplyLayout(vanillaCatalog, plan, technology, 0);
  expect(
    low.floors.find((f) => f.itemId === 'Desc_IronPlate_C')!.inputs[0]!.lines,
  ).toBe(8);
  expect(
    high.floors.find((f) => f.itemId === 'Desc_IronPlate_C')!.inputs[0]!.lines,
  ).toBe(2);
  expect(
    low.floors.map((f) => [
      f.connections.input.side,
      f.connections.output.side,
    ]),
  ).toEqual([
    ['west', 'east'],
    ['east', 'west'],
  ]);
  expect(low.transfers[0]).toMatchObject({ side: 'east', sideChanges: 0 });
});
it('rejects excessive layouts and invalid row settings rather than truncating machines', () => {
  const plan = solveProduction(vanillaCatalog, {
    ...input,
    targets: [{ itemId: 'Desc_IronPlate_C', rate: '100000' }],
  });
  expect(() =>
    generateSupplyLayout(vanillaCatalog, plan, technology, 0),
  ).toThrow(/capacity|Kapazität/i);
  expect(() =>
    generateSupplyLayout(
      vanillaCatalog,
      solveProduction(vanillaCatalog, input),
      technology,
      NaN,
    ),
  ).toThrow();
});
it('rejects raw-only plans before replacing the last valid workspace', () => {
  const plan = solveProduction(vanillaCatalog, {
    targets: [{ itemId: 'Desc_OreIron_C', rate: '30' }],
    recipes: {},
    imports: ['Desc_OreIron_C'],
    technology,
  });
  expect(() =>
    generateSupplyLayout(vanillaCatalog, plan, technology, 0),
  ).toThrow(/manufactured|Produktionsstufe/i);
});
it('separates target deliveries from internal transfers without double counting production', () => {
  const plan = solveProduction(vanillaCatalog, {
    ...input,
    targets: [
      { itemId: 'Desc_IronPlate_C', rate: '20' },
      { itemId: 'Desc_IronIngot_C', rate: '20' },
    ],
  });
  const layout = generateSupplyLayout(vanillaCatalog, plan, technology, 0);
  const ingot = layout.floors.find((f) => f.itemId === 'Desc_IronIngot_C')!;
  expect(ingot.output.rate).toBe('50');
  expect(ingot.targetOutput).toMatchObject({
    itemId: 'Desc_IronIngot_C',
    rate: '20',
    lines: 1,
  });
  expect(
    layout.transfers.find((t) => t.fromItemId === 'Desc_IronIngot_C')!.rate,
  ).toBe('30');
  expect(ingot.connections.targetOutput).not.toEqual(ingot.connections.output);
  const chain = generateSupplyLayout(
    vanillaCatalog,
    solveProduction(vanillaCatalog, input),
    technology,
    0,
  );
  expect(chain.floors[0]!.targetOutput).toBeNull();
  expect(chain.floors[0]!.connections.targetOutput).toBeNull();
});
