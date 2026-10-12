import { Rational } from './rational.js';

export interface CatalogItem {
  id: string;
  name: string;
  raw: boolean;
}
export interface CatalogMachine {
  id: string;
  name: string;
}
export interface RecipeQuantity {
  itemId: string;
  quantity: string;
}
export interface CatalogRecipe {
  id: string;
  name: string;
  machineId: string;
  durationSeconds: string;
  inputs: RecipeQuantity[];
  outputs: RecipeQuantity[];
}
export interface GameDataManifest {
  gameVersion: string;
  build: string;
  sourceUrl: string;
  license: string;
  contentSha256: string;
  verifiedBy?: string;
  verifiedAt?: string;
}
export interface Catalog {
  schemaVersion: 1;
  catalogVersion: string;
  provenance: {
    kind: 'synthetic' | 'unverified-game' | 'verified-game';
    source: string;
    gameBuild?: string;
    verification?: string;
    manifest?: GameDataManifest;
  };
  items: CatalogItem[];
  machines: CatalogMachine[];
  recipes: CatalogRecipe[];
}

export const CATALOG_ENTRY_LIMIT = 2000;
export const CATALOG_ID_LIMIT = 256;
export const CATALOG_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_./-]*$/;
export function isCatalogId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= CATALOG_ID_LIMIT &&
    CATALOG_ID_PATTERN.test(value)
  );
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function supportedKeys(
  value: Record<string, unknown>,
  keys: string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key))
      throw new Error(`${path}: unsupported field ${key}`);
  }
}

function text(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > CATALOG_ID_LIMIT
  )
    throw new Error(
      `${path} must be a nonempty string within the ${CATALOG_ID_LIMIT}-character bound`,
    );
  return value;
}

function id(value: unknown, path: string): string {
  const result = text(value, path);
  if (!isCatalogId(result))
    throw new Error(
      `${path} must be a stable ID containing letters, digits, colon, underscore, dot, slash or dash`,
    );
  return result;
}

function entries(
  value: unknown,
  path: string,
  minimum = 0,
  maximum = CATALOG_ENTRY_LIMIT,
): unknown[] {
  if (!Array.isArray(value) || value.length < minimum)
    throw new Error(
      `${path} must be an array with at least ${minimum} entries`,
    );
  if (value.length > maximum)
    throw new Error(`${path} exceeds the ${maximum}-entry limit`);
  return value;
}

function positive(value: unknown, path: string): string {
  try {
    let parsed: Rational;
    try {
      parsed = Rational.parse(value as string);
    } catch (error) {
      // A normalized catalog may contain a canonical fraction larger than the
      // original decimal. Strict canonical syntax keeps validation idempotent.
      if (typeof value !== 'string' || !/^-?\d+(?:\/\d+)?$/.test(value))
        throw error;
      parsed = Rational.parseCanonical(value);
    }
    if (parsed.compare(Rational.parse('0')) <= 0)
      throw new Error('must be positive');
    return parsed.toString();
  } catch (error) {
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Validates references and quantities without certifying the truth of source data. */
export function validateCatalog(input: unknown): Catalog {
  const root = record(input, 'catalog');
  supportedKeys(
    root,
    [
      'schemaVersion',
      'catalogVersion',
      'provenance',
      'items',
      'machines',
      'recipes',
    ],
    'catalog',
  );
  if (root.schemaVersion !== 1)
    throw new Error('catalog.schemaVersion must be supported version 1');
  const catalogVersion = text(root.catalogVersion, 'catalog.catalogVersion');
  const source = record(root.provenance, 'catalog.provenance');
  supportedKeys(
    source,
    ['kind', 'source', 'gameBuild', 'verification', 'manifest'],
    'catalog.provenance',
  );
  if (
    source.kind !== 'synthetic' &&
    source.kind !== 'unverified-game' &&
    source.kind !== 'verified-game'
  )
    throw new Error(
      'catalog.provenance.kind must be synthetic, unverified-game or verified-game',
    );
  const provenance: Catalog['provenance'] = {
    kind: source.kind,
    source: text(source.source, 'catalog.provenance.source'),
  };
  if (source.gameBuild !== undefined)
    provenance.gameBuild = text(
      source.gameBuild,
      'catalog.provenance.gameBuild',
    );
  if (source.verification !== undefined)
    provenance.verification = text(
      source.verification,
      'catalog.provenance.verification',
    );
  if (source.kind !== 'synthetic' || source.manifest !== undefined) {
    const manifest = record(source.manifest, 'catalog.provenance.manifest');
    supportedKeys(
      manifest,
      [
        'gameVersion',
        'build',
        'sourceUrl',
        'license',
        'contentSha256',
        'verifiedBy',
        'verifiedAt',
      ],
      'catalog.provenance.manifest',
    );
    const game: GameDataManifest = {
      gameVersion: text(manifest.gameVersion, 'manifest.gameVersion'),
      build: text(manifest.build, 'manifest.build'),
      sourceUrl: text(manifest.sourceUrl, 'manifest.sourceUrl'),
      license: text(manifest.license, 'manifest.license'),
      contentSha256: text(manifest.contentSha256, 'manifest.contentSha256'),
    };
    if (!/^[a-f0-9]{64}$/.test(game.contentSha256))
      throw new Error(
        'manifest.contentSha256 must contain 64 lowercase SHA256 hex characters',
      );
    if (manifest.verifiedBy !== undefined)
      game.verifiedBy = text(manifest.verifiedBy, 'manifest.verifiedBy');
    if (manifest.verifiedAt !== undefined) {
      game.verifiedAt = text(manifest.verifiedAt, 'manifest.verifiedAt');
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(game.verifiedAt) ||
        !Number.isFinite(Date.parse(game.verifiedAt)) ||
        new Date(game.verifiedAt).toISOString() !==
          game.verifiedAt.replace('Z', '.000Z')
      )
        throw new Error('manifest.verifiedAt must be an ISO UTC timestamp');
    }
    if (
      source.kind === 'verified-game' &&
      (!game.verifiedBy || !game.verifiedAt)
    )
      throw new Error(
        'Verified game manifest requires verifiedBy and verifiedAt evidence',
      );
    provenance.manifest = game;
    if (
      provenance.gameBuild !== undefined &&
      provenance.gameBuild !== game.build
    )
      throw new Error(
        'catalog.provenance.gameBuild must match manifest.build; build claims conflict',
      );
  }

  const seen = new Set<string>();
  function identity(
    value: unknown,
    path: string,
  ): { object: Record<string, unknown>; id: string; name: string } {
    const object = record(value, path);
    supportedKeys(
      object,
      path.startsWith('catalog.items')
        ? ['id', 'name', 'raw']
        : path.startsWith('catalog.machines')
          ? ['id', 'name']
          : ['id', 'name', 'machineId', 'durationSeconds', 'inputs', 'outputs'],
      path,
    );
    const identifier = id(object.id, `${path}.id`);
    if (seen.has(identifier))
      throw new Error(`Duplicate catalog ID: ${identifier}`);
    seen.add(identifier);
    return { object, id: identifier, name: text(object.name, `${path}.name`) };
  }
  const items = entries(root.items, 'catalog.items', 1).map(
    (value, index): CatalogItem => {
      const entry = identity(value, `catalog.items[${index}]`);
      if (typeof entry.object.raw !== 'boolean')
        throw new Error(`catalog.items[${index}].raw must be boolean`);
      return { id: entry.id, name: entry.name, raw: entry.object.raw };
    },
  );
  const machines = entries(root.machines, 'catalog.machines').map(
    (value, index): CatalogMachine => {
      const entry = identity(value, `catalog.machines[${index}]`);
      return { id: entry.id, name: entry.name };
    },
  );
  const itemIds = new Set(items.map((item) => item.id));
  const machineIds = new Set(machines.map((machine) => machine.id));
  function quantities(
    value: unknown,
    path: string,
    minimum: number,
  ): RecipeQuantity[] {
    const used = new Set<string>();
    return entries(value, path, minimum, 64).map((entry, index) => {
      const object = record(entry, `${path}[${index}]`);
      supportedKeys(object, ['itemId', 'quantity'], `${path}[${index}]`);
      const itemId = id(object.itemId, `${path}[${index}].itemId`);
      if (!itemIds.has(itemId))
        throw new Error(`${path}: unknown item ${itemId}`);
      if (used.has(itemId))
        throw new Error(`${path}: duplicate item ${itemId}`);
      used.add(itemId);
      return {
        itemId,
        quantity: positive(object.quantity, `${path}[${index}].quantity`),
      };
    });
  }
  const recipes = entries(root.recipes, 'catalog.recipes').map(
    (value, index): CatalogRecipe => {
      const path = `catalog.recipes[${index}]`;
      const entry = identity(value, path);
      const machineId = id(entry.object.machineId, `${path}.machineId`);
      if (!machineIds.has(machineId))
        throw new Error(`${path}: unknown machine ${machineId}`);
      return {
        id: entry.id,
        name: entry.name,
        machineId,
        durationSeconds: positive(
          entry.object.durationSeconds,
          `${path}.durationSeconds`,
        ),
        inputs: quantities(entry.object.inputs, `${path}.inputs`, 0),
        outputs: quantities(entry.object.outputs, `${path}.outputs`, 1),
      };
    },
  );
  if (
    provenance.kind === 'verified-game' &&
    (Array.from(seen).some((identifier) =>
      /^(example|synthetic):/.test(identifier),
    ) ||
      /synthetic|fixture|example/i.test(provenance.source) ||
      /^synthetic/i.test(catalogVersion))
  )
    throw new Error(
      'Synthetic/example fixtures cannot claim verified game provenance',
    );
  return {
    schemaVersion: 1,
    catalogVersion,
    provenance,
    items,
    machines,
    recipes,
  };
}
export const syntheticCatalog: Catalog = {
  schemaVersion: 1,
  catalogVersion: 'synthetic-1',
  provenance: {
    kind: 'synthetic',
    source: 'Original Satispire arithmetic fixture; not game data',
  },
  items: [
    { id: 'example:ore', name: 'Example ore', raw: true },
    { id: 'example:ingot', name: 'Example ingot', raw: false },
    { id: 'example:plate', name: 'Example plate', raw: false },
    { id: 'example:rod', name: 'Example rod', raw: false },
  ],
  machines: [
    { id: 'example:kiln', name: 'Example kiln' },
    { id: 'example:press-machine', name: 'Example press' },
    { id: 'example:shaper', name: 'Example shaper' },
  ],
  recipes: [
    {
      id: 'example:smelt',
      name: 'Example smelting',
      machineId: 'example:kiln',
      durationSeconds: '6',
      inputs: [{ itemId: 'example:ore', quantity: '1' }],
      outputs: [{ itemId: 'example:ingot', quantity: '1' }],
    },
    {
      id: 'example:press',
      name: 'Example pressing',
      machineId: 'example:press-machine',
      durationSeconds: '6',
      inputs: [{ itemId: 'example:ingot', quantity: '3' }],
      outputs: [{ itemId: 'example:plate', quantity: '2' }],
    },
    {
      id: 'example:shape',
      name: 'Example shaping',
      machineId: 'example:shaper',
      durationSeconds: '4',
      inputs: [{ itemId: 'example:ingot', quantity: '1' }],
      outputs: [{ itemId: 'example:rod', quantity: '1' }],
    },
  ],
};
