import { z } from 'zod';
import {
  validateCatalog,
  isCatalogId,
  type Catalog,
} from './domain/catalog.js';
import { Rational } from './domain/rational.js';

const rowId = z.string().max(256).refine(isCatalogId);
const amount = z.object({
  itemId: rowId,
  quantity: z.number().finite().nullable(),
});
const bundleSchema = z.object({
  manifest: z.object({
    schemaVersion: z.literal('satispire.discovery/0.1'),
    catalogVersion: z.string().min(1).max(256),
    game: z.object({
      version: z.string().min(1).max(128),
      changelist: z.number().int().positive(),
    }),
    source: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  }),
  items: z
    .array(
      z.object({
        id: rowId,
        form: z.string().max(64),
        provenance: z.object({ nativeClass: z.string().max(512) }),
      }),
    )
    .min(1)
    .max(2000),
  buildings: z
    .array(
      z.object({
        id: rowId,
        parameters: z.object({
          mManufacturingSpeed: z.number().finite().nullable().optional(),
        }),
      }),
    )
    .max(2000),
  recipes: z
    .array(
      z.object({
        id: rowId,
        durationSeconds: z.number().finite().positive(),
        ingredients: z.array(amount).max(64),
        products: z.array(amount).min(1).max(64),
        eligibleProducers: z
          .array(z.object({ id: rowId, kind: z.string().max(64) }))
          .max(64),
        alternate: z.boolean(),
        events: z.unknown().optional(),
        unlockIds: z.array(rowId).max(2000),
      }),
    )
    .max(2000),
});

export interface DiscoveryRecipeDetails {
  sourceRecipeId: string;
  alternate: boolean;
  eventRestricted: boolean;
  unlockIds: string[];
  layoutReady: false;
}
export interface DiscoveryConversion {
  catalog: Catalog;
  details: Record<string, DiscoveryRecipeDetails>;
  excluded: { id: string; reason: string }[];
}

/** Decimal spelling of the parsed discovery number, never a claim of source-perfect precision. */
function exactNumber(n: number): Rational {
  const spelling = String(n);
  if (!/[eE]/.test(spelling)) return Rational.parse(spelling);
  const [mantissa, power] = spelling.toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa!.split('.');
  const digits = whole! + fraction;
  const point = whole!.length + Number(power);
  const expanded =
    point <= 0
      ? '0.' + '0'.repeat(-point) + digits
      : point >= digits.length
        ? digits + '0'.repeat(point - digits.length)
        : digits.slice(0, point) + '.' + digits.slice(point);
  return Rational.parse(expanded);
}

/** Convert only explicit manufacturer records. Unknowns remain diagnostics, never defaults. */
export function convertDiscovery(input: unknown): DiscoveryConversion {
  const data = bundleSchema.parse(input);
  for (const rows of [data.items, data.buildings, data.recipes]) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw new Error('Duplicate discovery IDs');
  }
  const items = data.items.filter((row) =>
    ['RF_SOLID', 'RF_LIQUID', 'RF_GAS'].includes(row.form),
  );
  const itemIds = new Set(items.map((row) => row.id));
  const machines = new Map(data.buildings.map((row) => [row.id, row]));
  const excluded: DiscoveryConversion['excluded'] = [];
  const details: DiscoveryConversion['details'] = Object.create(
    null,
  ) as DiscoveryConversion['details'];
  const recipes: Catalog['recipes'] = [];
  for (const recipe of data.recipes) {
    const parts = [...recipe.ingredients, ...recipe.products];
    if (
      parts.some(
        (part) =>
          !itemIds.has(part.itemId) ||
          part.quantity === null ||
          part.quantity <= 0,
      )
    ) {
      excluded.push({
        id: recipe.id,
        reason: 'unresolved item, quantity or unsupported descriptor unit',
      });
      continue;
    }
    const producers = recipe.eligibleProducers.filter(
      (producer) => producer.kind === 'buildable',
    );
    if (!producers.length)
      excluded.push({
        id: recipe.id,
        reason: 'no exported automated manufacturer',
      });
    for (const producer of producers) {
      const speed = machines.get(producer.id)?.parameters.mManufacturingSpeed;
      if (speed === null || speed === undefined || speed <= 0) {
        excluded.push({
          id: recipe.id,
          reason: 'unknown manufacturer or manufacturing speed: ' + producer.id,
        });
        continue;
      }
      const id = recipe.id + '/' + producer.id;
      if (!isCatalogId(id)) {
        excluded.push({
          id: recipe.id,
          reason: 'combined recipe/producer ID exceeds catalog bound',
        });
        continue;
      }
      const converted = {
        id,
        name: recipe.id + ' · ' + producer.id,
        machineId: producer.id,
        durationSeconds: exactNumber(recipe.durationSeconds)
          .divide(exactNumber(speed))
          .toString(),
        inputs: recipe.ingredients.map((part) => ({
          itemId: part.itemId,
          quantity: exactNumber(part.quantity!).toString(),
        })),
        outputs: recipe.products.map((part) => ({
          itemId: part.itemId,
          quantity: exactNumber(part.quantity!).toString(),
        })),
      };
      recipes.push(converted);
      details[id] = {
        sourceRecipeId: recipe.id,
        alternate: recipe.alternate,
        eventRestricted:
          recipe.events !== undefined &&
          recipe.events !== null &&
          JSON.stringify(recipe.events) !== '[]',
        unlockIds: [...recipe.unlockIds],
        layoutReady: false,
      };
    }
  }
  const usedMachines = new Set(recipes.map((recipe) => recipe.machineId));
  const catalog = validateCatalog({
    schemaVersion: 1,
    catalogVersion: data.manifest.catalogVersion,
    provenance: {
      kind: 'unverified-game',
      source:
        'Local discovery import; source numbers parsed, physical geometry unknown',
      gameBuild: String(data.manifest.game.changelist),
      manifest: {
        gameVersion: data.manifest.game.version,
        build: String(data.manifest.game.changelist),
        sourceUrl: 'local:CommunityResources/Docs/en-US.json',
        license: 'unresolved-local-only',
        contentSha256: data.manifest.source.sha256,
      },
    },
    items: items.map((row) => ({
      id: row.id,
      name: row.id,
      raw: /(?:^|\.)FGResourceDescriptor(?:'|$)/.test(
        row.provenance.nativeClass,
      ),
    })),
    machines: [...usedMachines].map((id) => ({ id, name: id })),
    recipes,
  });
  return { catalog, details, excluded };
}
