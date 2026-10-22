import { vanillaCatalog } from '../../src/domain/vanilla.js';

/** Fixed, high-contrast palette shared by resource inputs and outputs. */
export const resourcePalette = [
  '#78dce8',
  '#f6c85f',
  '#a8dc76',
  '#f497b6',
  '#c7a7ef',
  '#f3a76b',
  '#73d9b6',
  '#9ebcfa',
  '#e7df8b',
  '#e9a1d0',
  '#92d2d2',
  '#ff9b85',
] as const;

// Assign once against the catalog, so floor, plan and recipe changes retain colors.
// Resources occurring together in any recipe get distinct palette entries.
const neighbors = new Map<string, Set<string>>();
for (const recipe of vanillaCatalog.recipes) {
  const ids = [...recipe.inputs, ...recipe.outputs].map((i) => i.itemId);
  for (const id of ids) {
    const adjacent = neighbors.get(id) ?? new Set<string>();
    for (const other of ids) if (other !== id) adjacent.add(other);
    neighbors.set(id, adjacent);
  }
}
const colors = new Map<string, string>();
for (const id of [...neighbors.keys()].sort()) {
  const used = new Set(
    [...neighbors.get(id)!].map((other) => colors.get(other)),
  );
  colors.set(
    id,
    resourcePalette.find((color) => !used.has(color)) ?? fallbackColor(id),
  );
}
function fallbackColor(itemId: string): string {
  let hash = 0;
  for (const char of itemId)
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return resourcePalette[hash % resourcePalette.length]!;
}
export function resourceColor(itemId: string): string {
  return colors.get(itemId) ?? fallbackColor(itemId);
}
