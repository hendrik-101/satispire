import { describe, expect, it } from 'vitest';
import {
  syntheticCatalog,
  validateCatalog,
  type Catalog,
} from '../src/domain/catalog';

const fixture = (): Catalog => structuredClone(syntheticCatalog);
const manifest = {
  gameVersion: 'test-version',
  build: 'test-build',
  sourceUrl: 'local:user-provided-dataset',
  license: 'unresolved-local-only',
  contentSha256: 'a'.repeat(64),
  verifiedBy: 'test-reviewer',
  verifiedAt: '2026-10-11T00:00:00Z',
};

describe('versioned catalog contract', () => {
  it('validates the explicitly synthetic catalog and normalizes exact values', () => {
    const catalog = fixture();
    catalog.recipes[0]!.durationSeconds = '12/2';
    expect(validateCatalog(catalog).recipes[0]?.durationSeconds).toBe('6');
    expect(validateCatalog(syntheticCatalog).provenance.kind).toBe('synthetic');
    expect(
      syntheticCatalog.items.every((item) => item.id.startsWith('example:')),
    ).toBe(true);
  });
  it.each([
    [
      'unsupported schema version',
      (c: Catalog) => {
        c.schemaVersion = 2 as 1;
      },
      /schemaVersion/,
    ],
    [
      'missing catalog version',
      (c: Catalog) => {
        c.catalogVersion = '';
      },
      /catalogVersion/,
    ],
    [
      'duplicate ID',
      (c: Catalog) => {
        c.items.push(c.items[0]!);
      },
      /duplicate/i,
    ],
    [
      'missing input item',
      (c: Catalog) => {
        c.recipes[0]!.inputs[0]!.itemId = 'absent';
      },
      /unknown.*item/i,
    ],
    [
      'missing machine',
      (c: Catalog) => {
        c.recipes[0]!.machineId = 'absent';
      },
      /unknown.*machine/i,
    ],
    [
      'nonpositive quantity',
      (c: Catalog) => {
        c.recipes[0]!.outputs[0]!.quantity = '0';
      },
      /positive/i,
    ],
    [
      'negative duration',
      (c: Catalog) => {
        c.recipes[0]!.durationSeconds = '-1';
      },
      /positive/i,
    ],
    [
      'numeric quantity',
      (c: Catalog) => {
        c.recipes[0]!.inputs[0]!.quantity = 2 as unknown as string;
      },
      /string/i,
    ],
    [
      'empty outputs',
      (c: Catalog) => {
        c.recipes[0]!.outputs = [];
      },
      /outputs/,
    ],
    [
      'synthetic IDs claiming verification',
      (c: Catalog) => {
        c.provenance = {
          kind: 'verified-game',
          source: 'example fixture',
          manifest: structuredClone(manifest),
        };
      },
      /synthetic|example/i,
    ],
  ])('rejects %s', (_name, mutate, diagnostic) => {
    const c = fixture();
    mutate(c);
    expect(() => validateCatalog(c)).toThrow(diagnostic);
  });
  it('requires traceable provenance for verified game data', () => {
    const c = fixture();
    c.provenance = { kind: 'verified-game', source: 'dataset' };
    expect(() => validateCatalog(c)).toThrow(/manifest|gameBuild|verification/);
  });
  it('requires a full game manifest instead of a scalar build claim', () => {
    const c = fixture();
    c.provenance = {
      kind: 'unverified-game',
      source: 'local export',
      gameBuild: 'test-build',
    };
    expect(() => validateCatalog(c)).toThrow(/manifest/i);
  });
  it('validates an unverified local data manifest without upgrading trust', () => {
    const c = fixture();
    c.provenance = {
      kind: 'unverified-game',
      source: 'local export',
      manifest: structuredClone(manifest),
    };
    expect(validateCatalog(c).provenance.kind).toBe('unverified-game');
    c.provenance.manifest!.contentSha256 = 'fake';
    expect(() => validateCatalog(c)).toThrow(/sha256/i);
  });
  it('rejects unsupported recipe modifiers instead of silently ignoring them', () => {
    const c = fixture();
    Object.assign(c.recipes[0]!, { amplification: '2' });
    expect(() => validateCatalog(c)).toThrow(/unsupported.*amplification/i);
  });
  it('rejects noncalendar verification dates and conflicting build claims', () => {
    const c = fixture();
    c.provenance = {
      kind: 'unverified-game',
      source: 'local export',
      manifest: { ...manifest, verifiedAt: '2026-02-30T00:00:00Z' },
    };
    expect(() => validateCatalog(c)).toThrow(/timestamp|date/i);
    c.provenance.manifest!.verifiedAt = manifest.verifiedAt;
    c.provenance.gameBuild = 'different-build';
    expect(() => validateCatalog(c)).toThrow(/build.*conflict|build.*match/i);
  });
  it('bounds the total catalog size and rejects malformed records', () => {
    expect(() => validateCatalog(null)).toThrow(/catalog/i);
    const c = fixture();
    c.items = Array.from({ length: 2001 }, (_, i) => ({
      id: `item:${i}`,
      name: 'Item',
      raw: true,
    }));
    expect(() => validateCatalog(c)).toThrow(/limit|bound/i);
  });
});
