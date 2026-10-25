import { expect, test } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FloorView } from '../../web/workspace/FloorView.js';
import { defaultBuildVariant } from '../../src/domain/build-variants.js';
import { solveProduction } from '../../src/domain/production.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../../src/domain/vanilla.js';

const technology = technologyAtTier(4);
const plan = solveProduction(vanillaCatalog, {
  targets: [{ itemId: 'Desc_IronPlateReinforced_C', rate: '25' }],
  recipes: availableChoices(technology),
  imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
  technology,
});
const sides = ['west', 'east', 'north', 'south'] as const;
for (const compact of [false, true])
  for (const inputSide of sides)
    for (const outputSide of sides) {
      test(`clear labels and connected short-edge ports (${compact ? 'mobile' : 'desktop'}): ${inputSide} → ${outputSide}`, async ({
        page,
      }) => {
        const markup = renderToStaticMarkup(
          createElement(FloorView, {
            catalog: vanillaCatalog,
            plan,
            technology,
            selected: 'Desc_IronPlateReinforced_C',
            compact,
            zoom: 1,
            rows: 2,
            variant: {
              ...defaultBuildVariant,
              pattern: 'fixed',
              inputSide,
              outputSide,
            },
            changeVariant: () => {},
          }),
        );
        await page.setContent(
          `<style>.drawing{height:700px}.floor-scene{height:700px;width:100%}</style>${markup}`,
        );
        const result = await page.getByTestId('floor-scene').evaluate((svg) => {
          const paths = [
            ...svg.querySelectorAll<SVGPathElement>('.supply-belt-edge'),
          ];
          const labels = [
            ...svg.querySelectorAll<SVGRectElement>('.flow-label > rect'),
          ].map((r) => r.getBBox());
          const intersections: string[] = [];
          for (const path of paths) {
            const length = path.getTotalLength();
            for (let d = 0.2; d < length; d += 0.2) {
              const p = path.getPointAtLength(d);
              if (
                labels.some(
                  (r) =>
                    p.x > r.x + 0.1 &&
                    p.x < r.x + r.width - 0.1 &&
                    p.y > r.y + 0.1 &&
                    p.y < r.y + r.height - 0.1,
                )
              ) {
                intersections.push(path.getAttribute('d')!);
                break;
              }
            }
          }
          const disconnected: string[] = [];
          const portrait: boolean[] = [];
          for (const machine of svg.querySelectorAll('[data-machine-id]')) {
            const body = machine
              .querySelector('.machine-base')!
              .getBoundingClientRect();
            portrait.push(body.height > body.width);
            for (const port of machine.querySelectorAll<SVGRectElement>(
              '.machine-port',
            )) {
              const out = Number(port.getAttribute('y')) > 0;
              const point = new DOMPoint(
                Number(port.getAttribute('x')) +
                  Number(port.getAttribute('width')) / 2,
                Number(port.getAttribute('y')) +
                  (out ? Number(port.getAttribute('height')) : 0),
              ).matrixTransform(port.getScreenCTM()!);
              const resource = port.getAttribute('data-resource-id');
              const connected = paths
                .filter(
                  (path) =>
                    path.parentElement!.getAttribute('data-resource-id') ===
                    resource,
                )
                .some((path) => {
                  const p = path.getPointAtLength(
                    out ? 0 : path.getTotalLength(),
                  );
                  const endpoint = new DOMPoint(p.x, p.y).matrixTransform(
                    path.getScreenCTM()!,
                  );
                  return (
                    Math.hypot(point.x - endpoint.x, point.y - endpoint.y) < 0.5
                  );
                });
              if (!connected)
                disconnected.push(
                  `${machine.getAttribute('data-machine-id')}: ${resource}`,
                );
            }
          }
          return { intersections, disconnected, portrait };
        });
        expect(result.intersections).toEqual([]);
        expect(result.disconnected).toEqual([]);
        expect(result.portrait.every(Boolean)).toBe(true);
      });
    }
