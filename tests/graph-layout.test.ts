import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { ProductionPlan } from '../src/domain/production.js';
import { syntheticCatalog } from '../src/domain/catalog.js';
import { Graph } from '../web/workspace/Graph.js';
import { resourceColor } from '../web/workspace/resource-colors.js';

const plan: ProductionPlan = {
  schemaVersion: 1,
  catalogVersion: syntheticCatalog.catalogVersion,
  targets: [],
  imports: ['a', 'b'].map((itemId) => ({ itemId, rate: '1' })),
  nodes: [
    { itemId: 'c', input: 'b' },
    { itemId: 'd', input: 'a' },
  ].map(({ itemId, input }) => ({
    itemId,
    recipeId: 'test',
    machineId: 'test',
    rate: '1',
    craftsPerMinute: '1',
    machineCount: 1,
    utilization: '1',
    inputs: [{ itemId: input, rate: '1' }],
  })),
};
function render(selected = '') {
  return renderToStaticMarkup(
    createElement(Graph, {
      plan,
      catalog: syntheticCatalog,
      selected,
      select: () => {},
      motion: false,
    }),
  );
}
function positions(markup: string) {
  return new Map(
    [
      ...markup.matchAll(
        /<foreignObject[^>]*y="([\d.]+)"[^>]*>(.*?)<\/foreignObject>/g,
      ),
    ].map((match) => [
      match[2]!.match(/class="graph-node-name" title="([^"]+)"/)![1]!,
      Number(match[1]),
    ]),
  );
}

test('parallel dependencies keep the same vertical order at both ends', () => {
  const y = positions(render());
  expect(Math.sign(y.get('a')! - y.get('b')!)).toBe(
    Math.sign(y.get('d')! - y.get('c')!),
  );
  expect(render()).toBe(render());
});

test('selected graph connections retain the floor material color', () => {
  const markup = render('c');
  const edges = [...markup.matchAll(/<path class="graph-edge[^\"]*"[^>]*>/g)];
  expect(edges).toHaveLength(2);
  expect(edges[0]![0]).toContain(`stroke="${resourceColor('b')}"`);
  expect(edges[1]![0]).toContain(`stroke="${resourceColor('a')}"`);
});

test('bypass branches leave a shared source without crossing its other stems', () => {
  const branchPlan: ProductionPlan = {
    ...plan,
    imports: [{ itemId: 'a', rate: '3' }],
    nodes: ['z', 'c', 'd'].map((itemId) => ({
      ...plan.nodes[0]!,
      itemId,
      inputs: (itemId === 'z' ? ['a'] : ['z', 'a']).map((input) => ({
        itemId: input,
        rate: '1',
      })),
    })),
  };
  const markup = renderToStaticMarkup(
    createElement(Graph, {
      plan: branchPlan,
      catalog: syntheticCatalog,
      selected: '',
      select: () => {},
      motion: false,
    }),
  );
  const stems = [...markup.matchAll(/d="M [\d.]+ ([\d.]+) H ([\d.]+) V /g)]
    .map((match) => ({ y: Number(match[1]), x: Number(match[2]) }))
    .sort((a, b) => a.y - b.y);
  expect(stems).toHaveLength(2);
  expect(stems[0]!.x).toBeGreaterThan(stems[1]!.x);
});
