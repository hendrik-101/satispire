import type { ProductionPlan } from '../src/domain/production.js';
import type { Catalog } from '../src/domain/catalog.js';

/** Original arithmetic fixture; not Satisfactory recipe data. */
export const coproductCatalog: Catalog = {
  schemaVersion: 1,
  catalogVersion: 'synthetic-coproduct-layout-1',
  provenance: {
    kind: 'synthetic',
    source: 'Original coproduct layout arithmetic fixture',
  },
  items: [
    { id: 'raw', name: 'Raw', raw: true },
    { id: 'a', name: 'Main', raw: false },
    { id: 'b', name: 'Coproduct', raw: false, transport: 'pipe' },
    { id: 'c', name: 'Part', raw: false },
  ],
  machines: [{ id: 'machine', name: 'Fixture machine' }],
  recipes: [
    {
      id: 'make-a',
      name: 'Joint production',
      machineId: 'machine',
      durationSeconds: '60',
      inputs: [{ itemId: 'raw', quantity: '1' }],
      outputs: [
        { itemId: 'a', quantity: '4' },
        { itemId: 'b', quantity: '6' },
      ],
    },
    {
      id: 'make-c',
      name: 'Consumption',
      machineId: 'machine',
      durationSeconds: '60',
      inputs: [{ itemId: 'b', quantity: '5' }],
      outputs: [{ itemId: 'c', quantity: '1' }],
    },
  ],
};
export const coproductTechnology = {
  availableMachines: ['machine'],
  unlockedRecipes: ['make-a', 'make-c'],
  beltTier: 1,
  pipeTier: 1,
};
export const coproductPlan: ProductionPlan = {
  schemaVersion: 1,
  catalogVersion: coproductCatalog.catalogVersion,
  targets: [
    { itemId: 'a', rate: '80' },
    { itemId: 'b', rate: '10' },
    { itemId: 'c', rate: '20' },
  ],
  imports: [{ itemId: 'raw', rate: '20' }],
  nodes: [
    {
      itemId: 'a',
      recipeId: 'make-a',
      machineId: 'machine',
      rate: '80',
      craftsPerMinute: '20',
      machineCount: 20,
      utilization: '1',
      inputs: [{ itemId: 'raw', rate: '20' }],
      outputs: [
        { itemId: 'a', rate: '80' },
        { itemId: 'b', rate: '120' },
      ],
    },
    {
      itemId: 'c',
      recipeId: 'make-c',
      machineId: 'machine',
      rate: '20',
      craftsPerMinute: '20',
      machineCount: 20,
      utilization: '1',
      inputs: [{ itemId: 'b', rate: '100' }],
    },
  ],
  surplus: [{ itemId: 'b', rate: '10' }],
};
