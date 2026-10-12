'use strict';
// Original, dependency-free local discovery importer. Never executes source content.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const VERSION = '0.1.0-discovery';
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const idOf = (p) =>
  p
    .replace(/['"]+$/, '')
    .split('.')
    .pop()
    .split('/')
    .pop();
function number(v, label) {
  if (v === undefined || v === null || v === '') return null;
  if (!/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(v)))
    throw Error(`Invalid number ${label}`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw Error(`Nonfinite ${label}`);
  return n;
}
function split(s) {
  let out = [],
    start = 0,
    depth = 0,
    quote = false,
    escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quote = false;
    } else if (c === '"') quote = true;
    else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth < 0) throw Error('Unbalanced struct');
    } else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  if (quote || depth !== 0) throw Error('Unbalanced struct');
  if (start < s.length) out.push(s.slice(start));
  return out;
}
function struct(s) {
  if (s === undefined || s === null || s === '') return null;
  s = s.trim();
  if (s.startsWith('(')) {
    if (!s.endsWith(')')) throw Error('Unclosed struct');
    const parts = split(s.slice(1, -1));
    if (!parts.length) return [];
    const keyed = parts.every((p) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(p));
    if (keyed)
      return Object.fromEntries(
        parts.map((p) => {
          const i = p.indexOf('=');
          return [p.slice(0, i), struct(p.slice(i + 1))];
        }),
      );
    return parts.map(struct);
  }
  if (s.startsWith('"')) return JSON.parse(s);
  if (s === 'True') return true;
  if (s === 'False') return false;
  if (/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s))
    return number(s, 'struct');
  return s;
}
function refs(s) {
  const v = struct(s);
  if (v === null) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))
    throw Error('Expected class path array');
  return v.map((p) => ({ id: idOf(p), classPath: p }));
}
function readDocs(file) {
  const b = fs.readFileSync(file);
  const encoding = b[0] === 255 && b[1] === 254 ? 'utf16le' : 'utf8';
  const groups = JSON.parse(b.toString(encoding).replace(/^\uFEFF/, ''));
  if (!Array.isArray(groups))
    throw Error('Expected NativeClass groups (current/legacy Docs array)');
  const rows = [];
  groups.forEach((g, gi) => {
    if (typeof g.NativeClass !== 'string' || !Array.isArray(g.Classes))
      throw Error(`Invalid group ${gi}`);
    g.Classes.forEach((c, ci) => {
      if (typeof c.ClassName !== 'string') throw Error('ClassName missing');
      rows.push({ c, native: g.NativeClass, pointer: `/${gi}/Classes/${ci}` });
    });
  });
  if (new Set(rows.map((r) => r.c.ClassName)).size !== rows.length)
    throw Error('Duplicate class IDs');
  return { b, encoding, groups, rows };
}
function normalize(file, metadata) {
  const { b, encoding, groups, rows } = readDocs(file);
  const sourceSha = hash(b);
  const lookup = new Map(rows.map((r) => [r.c.ClassName, r]));
  const provenance = (r) => ({
    source: 'docs-en-US',
    jsonPointer: r.pointer,
    nativeClass: r.native,
    verification: 'parsed-game-shipped-defaults',
  });
  const base = (r) => ({
    id: r.c.ClassName,
    classPath: r.c.FullName || null,
    provenance: provenance(r),
  });
  const numericFields = (c, names) =>
    Object.fromEntries(
      names.map((k) => [k, number(c[k], `${c.ClassName}.${k}`)]),
    );
  const boolFields = (c, names) =>
    Object.fromEntries(
      names.map((k) => {
        if (c[k] !== undefined && !['True', 'False'].includes(c[k]))
          throw Error(`Invalid bool ${k}`);
        return [k, c[k] === undefined ? null : c[k] === 'True'];
      }),
    );
  const items = rows
    .filter((r) => 'mForm' in r.c)
    .map((r) => ({
      ...base(r),
      form: r.c.mForm,
      quantityUnit: ['RF_LIQUID', 'RF_GAS'].includes(r.c.mForm)
        ? 'm3'
        : r.c.mForm === 'RF_SOLID'
          ? 'item'
          : null,
      sourceAmountUnit: ['RF_LIQUID', 'RF_GAS'].includes(r.c.mForm)
        ? 'liter'
        : r.c.mForm === 'RF_SOLID'
          ? 'item'
          : 'descriptor-count',
      kind: r.native.includes('FGBuildingDescriptor')
        ? 'building-descriptor'
        : 'item-descriptor',
      parameters: numericFields(r.c, [
        'mCachedStackSize',
        'mEnergyValue',
        'mRadioactiveDecay',
        'mResourceSinkPoints',
        'mExtraPotential',
        'mExtraProductionBoost',
      ]),
      powerShardType: r.c.mPowerShardType || null,
    }));
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const unresolvedItemRefs = [],
    missingAmounts = [];
  const quantities = (s, label) => {
    const list = struct(s);
    if (list === null) return [];
    if (!Array.isArray(list)) throw Error(`Bad quantity list ${label}`);
    return list.map((a) => {
      if (
        !a ||
        typeof a.ItemClass !== 'string' ||
        Object.keys(a).some((k) => !['ItemClass', 'Amount'].includes(k))
      )
        throw Error(`Bad amount ${label}`);
      const id = idOf(a.ItemClass),
        item = itemMap.get(id);
      const raw = number(a.Amount, label);
      if (raw !== null && raw < 0) throw Error(`Bad amount ${label}`);
      if (raw === null)
        missingAmounts.push({
          recordId: label,
          itemId: id,
          reason:
            'Amount omitted in source; Unreal implicit default not asserted',
        });
      if (!item) {
        unresolvedItemRefs.push({
          recordId: label,
          itemId: id,
          classPath: a.ItemClass,
          reason: 'descriptor-not-exported-in-docs',
        });
        return {
          itemId: id,
          classPath: a.ItemClass,
          sourceAmount: raw,
          sourceUnit: null,
          quantity: null,
          unit: null,
          referenceStatus: 'unresolved',
        };
      }
      const fluid = ['RF_LIQUID', 'RF_GAS'].includes(item.form);
      return {
        itemId: id,
        classPath: a.ItemClass,
        sourceAmount: raw,
        sourceUnit: item.sourceAmountUnit,
        quantity: raw === null ? null : raw / (fluid ? 1000 : 1),
        unit: fluid
          ? 'm3'
          : item.form === 'RF_SOLID'
            ? 'item'
            : 'descriptor-count',
      };
    });
  };
  const producerExceptions = {
    BP_WorkBenchComponent_C: 'hand-craft',
    BP_WorkshopComponent_C: 'equipment-workshop',
    BP_BuildGun_C: 'build-gun',
    FGBuildGun: 'build-gun',
    FGBuildableAutomatedWorkBench: 'native-automated-workbench',
  };
  const recipes = rows
    .filter((r) => r.native.endsWith(".FGRecipe'"))
    .map((r) => {
      const c = r.c,
        duration = number(c.mManufactoringDuration, c.ClassName),
        producers = refs(c.mProducedIn).map((p) => ({
          ...p,
          kind: lookup.has(p.id)
            ? 'buildable'
            : producerExceptions[p.id] || 'unresolved',
        }));
      if (duration === null || duration <= 0)
        throw Error(`Bad duration ${c.ClassName}`);
      const rates = (s) =>
        quantities(s, c.ClassName).map((a) => ({
          ...a,
          perMinute: a.quantity === null ? null : (a.quantity * 60) / duration,
        }));
      return {
        ...base(r),
        ingredients: rates(c.mIngredients),
        products: rates(c.mProduct),
        durationSeconds: duration,
        manualDurationMultiplier: number(
          c.mManualManufacturingMultiplier,
          c.ClassName,
        ),
        eligibleProducers: producers,
        alternate:
          /\/AlternateRecipes\//.test(c.FullName || '') ||
          /^Recipe_Alternate_/.test(c.ClassName),
        alternateEvidence: 'source-class-path-and-id-convention',
        events: struct(c.mRelevantEvents),
        gameplayTags: struct(c.mGameplayTags),
        variablePower: numericFields(c, [
          'mVariablePowerConsumptionConstant',
          'mVariablePowerConsumptionFactor',
        ]),
        unlockIds: [],
      };
    });
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const schematics = rows
    .filter((r) => r.native.endsWith(".FGSchematic'"))
    .map((r) => {
      const c = r.c;
      if (
        !Array.isArray(c.mUnlocks) ||
        !Array.isArray(c.mSchematicDependencies)
      )
        throw Error('Invalid unlock/dependency arrays');
      const unlocks = c.mUnlocks.map((u) => ({
        type: u.Class,
        recipeRefs: refs(u.mRecipes),
        schematicRefs: refs(u.mSchematics),
        numericParameters: Object.fromEntries(
          Object.entries(u)
            .filter(
              ([k, v]) =>
                k !== 'Class' && /^[+-]?\d+(?:\.\d+)?$/.test(String(v)),
            )
            .map(([k, v]) => [k, number(v, k)]),
        ),
        unhandledFields: Object.keys(u).filter(
          (k) =>
            !['Class', 'mRecipes', 'mSchematics'].includes(k) &&
            !/^[+-]?\d+(?:\.\d+)?$/.test(String(u[k])),
        ),
      }));
      for (const u of unlocks)
        for (const p of u.recipeRefs) {
          const recipe = recipeMap.get(p.id);
          if (recipe) recipe.unlockIds.push(c.ClassName);
        }
      return {
        ...base(r),
        type: c.mType,
        tier: number(c.mTechTier, c.ClassName),
        cost: quantities(c.mCost, c.ClassName),
        durationSeconds: number(c.mTimeToComplete, c.ClassName),
        events: struct(c.mRelevantEvents),
        includeInBuilds: c.mIncludeInBuilds || null,
        unlocks,
        dependencies: c.mSchematicDependencies.map((dep) => ({
          type: dep.Class,
          schematicRefs: refs(dep.mSchematics),
          unhandledFields: Object.keys(dep).filter(
            (k) => !['Class', 'mSchematics'].includes(k),
          ),
        })),
        dependencyPolicy: boolFields(c, [
          'mDependenciesBlocksSchematicAccess',
          'mHiddenUntilDependenciesMet',
        ]),
      };
    });
  const buildingRows = rows.filter((r) =>
    /\.FG(?:Buildable|PipeHyper|CentralStorageContainer)/.test(r.native),
  );
  const paramNames = [
    'mManufacturingSpeed',
    'mPowerConsumption',
    'mPowerConsumptionExponent',
    'mProductionBoostPowerConsumptionExponent',
    'mMinPotential',
    'mMaxPotential',
    'mBaseProductionBoost',
    'mPotentialShardSlots',
    'mProductionShardSlotSize',
    'mProductionShardBoostMultiplier',
    'mEstimatedMininumPowerConsumption',
    'mEstimatedMaximumPowerConsumption',
    'mExtractCycleTime',
    'mItemsPerCycle',
    'mExtractStartupTime',
    'mFlowLimit',
    'mSpeed',
    'mMaxHeadLift',
    'mDesignHeadLift',
    'mPowerProduction',
    'mSupplementalToPowerRatio',
    'mDefaultFlowLimit',
    'mDefaultPotentialExtractionPerMinute',
    'mMeshHeight',
    'mOpposingConnectionClearance',
  ];
  const buildings = buildingRows.map((r) => ({
    ...base(r),
    descriptorId: null,
    descriptorMappingStatus: 'not-present-in-docs',
    parameters: numericFields(r.c, paramNames),
    flags: boolFields(r.c, [
      'mCanChangePotential',
      'mCanChangeProductionBoost',
      'mOverridePotentialShardSlots',
      'mOverrideProductionShardSlotSize',
      'mOnlyAllowCertainResources',
    ]),
    allowedResourceForms: struct(r.c.mAllowedResourceForms),
    allowedResourceRefs: refs(r.c.mAllowedResources),
    eligibleRecipeIds: recipes
      .filter((p) => p.eligibleProducers.some((b) => b.id === r.c.ClassName))
      .map((p) => p.id),
    effectiveClockLimit: null,
    effectiveClockLimitReason:
      'Global default shard slots/settings are not exported in this Docs dataset; mMaxPotential excludes installed shards',
    purityMultipliers: null,
  }));
  const transport = buildingRows
    .filter((r) =>
      /\.FGBuildable(?:ConveyorBelt|ConveyorLift|Pipeline)'/.test(r.native),
    )
    .map((r) => {
      const c = r.c,
        pipe = r.native.endsWith("Pipeline'"),
        raw = number(c[pipe ? 'mFlowLimit' : 'mSpeed'], c.ClassName);
      return {
        ...base(r),
        kind: pipe ? 'pipe' : r.native.endsWith("Lift'") ? 'lift' : 'belt',
        sourceField: pipe ? 'mFlowLimit' : 'mSpeed',
        sourceValue: raw,
        sourceUnit: pipe ? 'm3/s' : 'cm/s',
        capacityPerMinute: raw === null ? null : raw * (pipe ? 60 : 60 / 120),
        capacityUnit: pipe ? 'm3/min' : 'item/min',
        conversionEvidence: pipe
          ? 'shipped FGBuildablePipeline.h mFlowLimit [m^3/s]'
          : 'shipped FGBuildableConveyorBase.h ITEM_SPACING = 120.0f; capacity = speed/spacing*60',
        geometryReady: false,
      };
    });
  const geometry = buildingRows.map((r) => ({
    ...base(r),
    layoutReady: false,
    units: 'source-unreal-cm',
    coordinateFrameVerification:
      'actor-local-field-structure-only; axis-facing/pivot not independently verified',
    physicalBounds: null,
    collisionBounds: null,
    ports: null,
    portStatus:
      'not-exported-or-not-verified; empty component fields are not zero ports',
    dimensions: numericFields(r.c, ['mWidth', 'mDepth', 'mHeight']),
    sizeField: struct(r.c.mSize),
    originOffset: struct(r.c.OriginOffset),
    clearanceBoxes: struct(r.c.mClearanceData),
    clearanceSemantics:
      'preserve Type and ExcludeForSnapping; omitted defaults unresolved; not physical/collision bounds',
    rainOcclusionBounds: struct(r.c.mRainOcclusionBoundingBox),
    snappingAnchors: null,
  }));
  const unresolvedProducers = recipes.flatMap((r) =>
    r.eligibleProducers
      .filter((p) => p.kind === 'unresolved')
      .map((p) => ({ recipeId: r.id, ...p })),
  );
  const unresolvedUnlockRecipeRefs = schematics.flatMap((s) =>
    s.unlocks.flatMap((u) =>
      u.recipeRefs
        .filter((p) => !recipeMap.has(p.id))
        .map((p) => ({ schematicId: s.id, ...p })),
    ),
  );
  const unresolvedSchematicRefs = schematics.flatMap((s) =>
    [...s.unlocks, ...s.dependencies].flatMap((u) =>
      u.schematicRefs
        .filter((p) => !lookup.has(p.id))
        .map((p) => ({ schematicId: s.id, ...p })),
    ),
  );
  const cycles = [];
  const edges = new Map();
  for (const r of recipes)
    for (const a of r.ingredients) {
      if (!edges.has(a.itemId)) edges.set(a.itemId, new Set());
      for (const p of r.products) edges.get(a.itemId).add(p.itemId);
    }
  // Tarjan SCC records genuine recycling/data loops without solving or dropping them.
  let counter = 0;
  const indexes = new Map(),
    low = new Map(),
    stack = [],
    onStack = new Set();
  function visit(v) {
    indexes.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) || []) {
      if (!indexes.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w))
        low.set(v, Math.min(low.get(v), indexes.get(w)));
    }
    if (low.get(v) === indexes.get(v)) {
      let w,
        scc = [];
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1 || (edges.get(v) || new Set()).has(v))
        cycles.push(scc.sort());
    }
  }
  for (const v of [...edges.keys()].sort()) if (!indexes.has(v)) visit(v);
  const coverage = {
    counts: {
      nativeGroups: groups.length,
      sourceClasses: rows.length,
      items: items.length,
      recipes: recipes.length,
      alternates: recipes.filter((r) => r.alternate).length,
      multiOutputRecipes: recipes.filter((r) => r.products.length > 1).length,
      seasonalRecipes: recipes.filter(
        (r) => r.events && JSON.stringify(r.events) !== '[]',
      ).length,
      buildables: buildings.length,
      machineRecipeCount: recipes.filter((r) =>
        r.eligibleProducers.some((p) => p.kind === 'buildable'),
      ).length,
      schematics: schematics.length,
      transport: transport.length,
      clearanceRecords: geometry.filter(
        (g) => Array.isArray(g.clearanceBoxes) && g.clearanceBoxes.length,
      ).length,
      allThreeDimensions: geometry.filter((g) =>
        ['mWidth', 'mDepth', 'mHeight'].every((k) => g.dimensions[k] !== null),
      ).length,
      layoutReady: 0,
    },
    unresolvedProducers,
    unresolvedUnlockRecipeRefs,
    unresolvedSchematicRefs,
    recipesWithoutUnlock: recipes
      .filter((r) => !r.unlockIds.length)
      .map((r) => r.id),
    nativeProducerExceptions: producerExceptions,
    recyclingStronglyConnectedComponents: cycles.sort((a, b) =>
      a[0].localeCompare(b[0]),
    ),
    gaps: [
      'Effective shard slots and upper clock limit require shipped global settings, not CDO override zeros',
      'Resource purity multipliers require FGResourceSettings values; header only declares configurable array',
      'Variable power curve shape/integral is absent; constants/factors are preserved, not treated as actual average power',
      'Building descriptor-to-actor mapping not explicitly exported',
      'Dependency types/extra unlock fields enumerated but not fully interpreted',
      'No validated belt/pipe port transforms, physical bounds, collision envelopes or snapping anchors',
      'Per-world resource randomization and recipe/power multipliers require explicit plan input; no saves read',
      'Only game-shipped docs; no mods; seasonal tags retained; public-build filtering is consumer responsibility',
      'Legacy grouped Docs.json shape accepted, but no genuine legacy installation fixture available',
    ],
  };
  coverage.deliberatelyExcludedUnlockRecipeRefs =
    coverage.unresolvedUnlockRecipeRefs
      .filter((p) => lookup.has(p.id))
      .map((p) => ({
        ...p,
        sourceNativeClass: lookup.get(p.id).native,
        reason:
          'Customization recipe, outside production recipe dataset; not absent from source',
      }));
  coverage.unresolvedUnlockRecipeRefs =
    coverage.unresolvedUnlockRecipeRefs.filter((p) => !lookup.has(p.id));
  coverage.unresolvedItemRefs = unresolvedItemRefs;
  coverage.missingAmounts = missingAmounts;
  coverage.counts.usableSolidLiquidGasItems = items.filter(
    (i) => i.form !== 'RF_INVALID',
  ).length;
  coverage.counts.buildingDescriptors = items.filter(
    (i) => i.kind === 'building-descriptor',
  ).length;
  const importedIds = new Set(
    [...items, ...recipes, ...buildings, ...schematics].map((r) => r.id),
  );
  coverage.excludedClasses = rows
    .filter((r) => !importedIds.has(r.c.ClassName))
    .map((r) => ({
      id: r.c.ClassName,
      nativeClass: r.native,
      reason: r.native.endsWith(".FGCustomizationRecipe'")
        ? 'Customization, not production recipe'
        : 'Equipment/vehicle actor or non-production object; inventory fields still enumerated',
    }));
  coverage.counts.recipeAmountRefsUnresolved = unresolvedItemRefs.filter((p) =>
    recipeMap.has(p.recordId),
  ).length;
  coverage.counts.machineRecipesWithResolvedRefs = recipes.filter(
    (r) =>
      r.eligibleProducers.some((p) => p.kind === 'buildable') &&
      !r.eligibleProducers.some((p) => p.kind === 'unresolved') &&
      [...r.ingredients, ...r.products].every((a) => a.quantity !== null),
  ).length;
  const schemaInventory = groups.map((g) => ({
    nativeClass: g.NativeClass,
    count: g.Classes.length,
    fields: [...new Set(g.Classes.flatMap((c) => Object.keys(c)))].sort(),
  }));
  const manifest = {
    schemaVersion: 'satispire.discovery/0.1',
    catalogVersion: `cl-${metadata.changelist}-${sourceSha.slice(0, 12)}`,
    geometryVersion: `discovery-cl-${metadata.changelist}-0.1`,
    game: metadata,
    source: {
      id: 'docs-en-US',
      relativePath: 'CommunityResources/Docs/en-US.json',
      sha256: sourceSha,
      bytes: b.length,
      encoding,
      rights: 'Coffee Stain content; redistribution unresolved',
    },
    importer: {
      version: VERSION,
      sha256: hash(fs.readFileSync(__filename)),
      dependencies: 'Node.js built-ins only',
    },
    ruleset: {
      id: 'vanilla-defaults',
      saveModifiersRead: false,
      supportedWorldModifiers: [],
      unsupportedModifierPolicy:
        'reject; do not silently apply vanilla results',
    },
    redistribution: {
      rawSource: 'blocked',
      numericCatalog:
        'unresolved; private local use only pending rights decision',
      localization: 'excluded',
      iconsMeshes: 'excluded',
    },
  };
  return {
    manifest,
    items,
    recipes,
    buildings,
    transport,
    schematics,
    geometry,
    coverage,
    schemaInventory,
  };
}
if (require.main === module) {
  const [file, out, metadataFile] = process.argv.slice(2);
  if (!file || !out || !metadataFile)
    throw Error('Usage: node normalize.cjs SOURCE OUTPUT_DIR METADATA_JSON');
  if (fs.existsSync(out))
    throw Error(
      'Use a new output directory; existing discovery files are preserved.',
    );
  const catalog = normalize(
    file,
    JSON.parse(fs.readFileSync(metadataFile, 'utf8')),
  );
  fs.mkdirSync(out);
  for (const [name, v] of Object.entries(catalog))
    fs.writeFileSync(
      path.join(out, name + '.json'),
      JSON.stringify(v, null, 2) + '\n',
      { flag: 'wx' },
    );
  fs.writeFileSync(
    path.join(out, 'generation.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        substantiveOutputTimestampExcluded: true,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  console.log(JSON.stringify(catalog.coverage.counts, null, 2));
  console.log(
    JSON.stringify({
      unresolvedProducers: catalog.coverage.unresolvedProducers,
      unresolvedUnlockRecipeRefs:
        catalog.coverage.unresolvedUnlockRecipeRefs.length,
      unresolvedSchematicRefs: catalog.coverage.unresolvedSchematicRefs.length,
    }),
  );
}
module.exports = { normalize, readDocs, struct, number, refs, idOf };
