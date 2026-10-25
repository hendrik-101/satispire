import type { generateSupplyLayout } from '../../src/domain/supply-layout.js';
import type { Catalog } from '../../src/domain/catalog.js';
import {
  transportCapacity,
  type TechnologyProfile,
} from '../../src/domain/technology.js';
import { itemName } from '../../src/domain/vanilla.js';
import { formatRate } from './format-rate.js';
import {
  optimizeCorridors,
  type CorridorBundle,
} from './corridor-optimizer.js';
import { placeBeltNetwork } from './belt-scene.js';
import { placeBeltLoadLabels } from './belt-load-labels.js';
import {
  deliveryPitch,
  transportBodyHalf,
  transportPortRadius,
} from './transport-symbol.js';
type Layout = ReturnType<typeof generateSupplyLayout>;
type Floor = Layout['floors'][number];
export type Point = { x: number; y: number };
export type FlowLabel = {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  rate: string;
  transport: string;
  destinations: {
    text: string;
    transfer?: Layout['transfers'][number] | undefined;
  }[];
};

export function flowDescription(
  catalog: Catalog,
  technology: TechnologyProfile,
  flow: { itemId: string; rate: string; lines: number },
) {
  const pipe =
    catalog.items.find((i) => i.id === flow.itemId)?.transport === 'pipe';
  const unit = pipe ? 'm³/min' : 'Stk./min';
  const tier = pipe ? technology.pipeTier : technology.beltTier;
  const transport = pipe
    ? flow.lines === 1
      ? 'Rohr'
      : 'Rohre'
    : flow.lines === 1
      ? 'Band'
      : 'Bänder';
  return {
    name:
      catalog.items.find((i) => i.id === flow.itemId)?.name ??
      itemName(flow.itemId),
    rate: `${formatRate(flow.rate)} ${unit}`,
    transport: `${flow.lines} ${transport} Mk.${tier} · je ${transportCapacity(catalog, flow.itemId, technology)} ${unit}`,
  };
}

/** Renderer-only schematic routes. Each material owns an intake and a rail. */
export function supplySceneMetrics(
  layout: Layout,
  floor: Floor,
  catalog: Catalog,
  technology: TechnologyProfile,
  compact = false,
) {
  const shift = 17,
    feeds = floor.inputs.length;
  const maxX = Math.max(...floor.machines.map((m) => m.x + m.width)) + shift;
  const maxY = Math.max(...floor.machines.map((m) => m.y + m.depth)) + shift;
  const firstY = floor.machines[0]!.y + shift - 3;
  const lastY = Math.max(...floor.machines.map((m) => m.y)) + shift - 3;
  const inputCount = floor.inputs.reduce((sum, feed) => sum + feed.lines, 0);
  const inputSpines = Array.from({ length: inputCount }, (_, lane) =>
    floor.inputSide === 'east'
      ? shift + floor.width + 4 + lane * 2
      : shift - 4 - lane * 2,
  );
  let inputOffset = 0;
  const feeders = floor.inputs.map((feed) => {
    const x = inputSpines[inputOffset]!;
    inputOffset += feed.lines;
    return x;
  });
  const inputRail = feeders[0] ?? shift - 4;
  let outputRail =
    floor.outputSide === 'west' || floor.outputSide === 'north'
      ? Math.min(shift - 8, ...inputSpines.map((x) => x - 4))
      : Math.max(shift + floor.width + 8, ...inputSpines.map((x) => x + 4));
  const outgoing = layout.transfers.filter((t) => t.fromFloor === floor.index);
  const incoming = layout.transfers.filter((t) => t.toFloor === floor.index);
  const makeLabel = (
    flow: { itemId: string; rate: string; lines: number },
    destinations: FlowLabel['destinations'],
  ): FlowLabel => {
    const description = flowDescription(catalog, technology, flow);
    // Reserve a full em for wide/Unicode glyphs, even without the workspace font.
    const textWidth = (text: string, size: number) =>
      Array.from(text).reduce(
        (sum, char) =>
          sum +
          (/[MW@]/.test(char) || char.codePointAt(0)! > 0xff ? 1.1 : 0.68) *
            size,
        0,
      );
    const width = Math.max(
      21,
      textWidth(description.name, 1.35) + 5,
      textWidth(`AUS gesamt · ${description.rate}`, 1.3) + 2,
      textWidth(description.transport, 1.15) + 2,
      ...destinations.map((d) => textWidth(d.text, 1.2) + 2),
    );
    return {
      ...description,
      destinations,
      x: 0,
      y: 0,
      width,
      height: Math.max(
        8.5 + destinations.length * 2,
        flow.lines * deliveryPitch + 2,
      ),
    };
  };
  const outputLabel = makeLabel(floor.output, [
    ...outgoing.map((t) => ({
      text: `→ Etage ${t.toFloor + 1} · ${formatRate(t.rate)} ${catalog.items.find((i) => i.id === t.fromItemId)?.transport === 'pipe' ? 'm³/min' : 'Stk./min'}`,
      transfer: t,
    })),
    ...(floor.targetOutput
      ? [
          {
            text: `→ Ziel · ${flowDescription(catalog, technology, floor.targetOutput).rate}`,
          },
        ]
      : []),
  ]);
  const labels = floor.inputs.map((feed) => {
    const transfer = incoming.find((t) => t.fromItemId === feed.itemId);
    return makeLabel(feed, [
      {
        text: transfer
          ? `von Etage ${transfer.fromFloor + 1}`
          : 'Externe Zufuhr',
        transfer,
      },
    ]);
  });
  const inputAnchors = labels.map((label, i) => {
    const side = floor.inputSide;
    const offset = labels
      .slice(0, i)
      .reduce((sum, previous) => sum + previous.height + 3, 0);
    const y = firstY - offset;
    const x = feeders[i]!;
    const anchor =
      side === 'west'
        ? { x: Math.min(...inputSpines) - 4, y }
        : side === 'east'
          ? { x: Math.max(...inputSpines) + 4, y }
          : side === 'north'
            ? { x, y: shift - 6 - offset }
            : { x, y: Math.max(maxY + 10, shift + floor.depth) + 6 + offset };
    label.x =
      side === 'west'
        ? anchor.x - label.width
        : side === 'east'
          ? anchor.x
          : anchor.x + 2;
    label.y =
      side === 'west' || side === 'east'
        ? anchor.y - label.height / 2
        : side === 'south'
          ? shift + floor.depth + 4 + offset
          : anchor.y - label.height + 1;
    if (!compact && i === 0 && (side === 'west' || side === 'east')) {
      anchor.y =
        firstY - 1 + ((floor.inputs[i]!.lines - 1) * deliveryPitch) / 2;
      label.y = anchor.y - label.height / 2;
    }
    if (compact) {
      label.x = shift - 1;
      label.y =
        side === 'south'
          ? shift + floor.depth + 4 + offset
          : shift - offset - label.height - 3;
      anchor.x = side === 'east' ? label.x + label.width : label.x;
      anchor.y = label.y + label.height / 2;
    }
    if (!compact && (side === 'north' || side === 'south')) {
      anchor.x = label.x;
      anchor.y = label.y + label.height / 2;
    }
    return anchor;
  });
  if (floor.outputSide === 'north' && floor.inputSide === 'west')
    outputRail = Math.min(outputRail, ...labels.map((l) => l.x - 3));
  if (floor.outputSide === 'south' && floor.inputSide === 'south')
    outputRail = Math.max(outputRail, ...labels.map((l) => l.x + l.width + 3));
  const deliveryWidth =
    floor.transport.collectors * 2 +
    14 +
    Math.max(
      0,
      ...floor.transport.nodes
        .filter(
          (node) => node.stage === 'delivery' && node.placement === 'rail',
        )
        .map((node) => node.order * deliveryPitch),
    );
  const side = floor.outputSide;
  const output =
    side === 'west' || side === 'east'
      ? {
          x: outputRail + (side === 'west' ? -deliveryWidth : deliveryWidth),
          y:
            maxY +
            10 +
            floor.transport.collectors * 3.2 +
            (floor.output.lines - 1) * (deliveryPitch / 2),
        }
      : {
          x: outputRail,
          y:
            side === 'north'
              ? Math.min(shift - 6, firstY - feeds * 12 - 6)
              : Math.max(maxY + 10, shift + floor.depth) +
                6 +
                (floor.inputSide === 'south' ? feeds * 12 : 0),
        };
  outputLabel.x =
    side === 'west'
      ? output.x - outputLabel.width
      : side === 'east'
        ? output.x
        : output.x + 2;
  outputLabel.y =
    side === 'west' || side === 'east'
      ? output.y - outputLabel.height / 2
      : side === 'north'
        ? output.y - outputLabel.height + 1
        : output.y - 1;
  if (!compact && (side === 'north' || side === 'south')) {
    outputLabel.y =
      side === 'north'
        ? Math.min(shift, ...labels.map((label) => label.y)) -
          outputLabel.height -
          4
        : Math.max(
            shift + floor.depth,
            ...labels.map((label) => label.y + label.height),
          ) + 4;
    outputLabel.x =
      outputRail +
      (side === 'north' ? -deliveryWidth - outputLabel.width : deliveryWidth);
    output.x =
      side === 'north' ? outputLabel.x + outputLabel.width : outputLabel.x;
    output.y = outputLabel.y + outputLabel.height / 2;
  }
  if (compact) {
    outputLabel.x = shift - 1;
    outputLabel.y =
      side === 'north'
        ? Math.min(shift, ...labels.map((l) => l.y)) - outputLabel.height - 4
        : Math.max(shift + floor.depth, ...labels.map((l) => l.y + l.height)) +
          4;
    output.x =
      outputRail < shift ? outputLabel.x : outputLabel.x + outputLabel.width;
    output.y = outputLabel.y + outputLabel.height / 2;
  }
  if (floor.inputSide === side && (side === 'west' || side === 'east')) {
    const inputBottom = Math.max(...labels.map((l) => l.y + l.height));
    if (outputLabel.y < inputBottom + 3) {
      output.y += inputBottom + 3 - outputLabel.y;
      outputLabel.y = inputBottom + 3;
    }
  }
  const allLabels = [...labels, outputLabel];
  const routeContext = {
    shift,
    inputSpines,
    outputRail,
    inputAnchors,
    output,
    labels,
    outputLabel,
  };
  const machineBoxes = floor.machines.map((machine) => ({
    x: machine.x + shift,
    y: machine.y + shift,
    width: machine.width,
    height: machine.depth,
  }));
  const evaluate = (value: ReturnType<typeof placeBeltNetwork>) => ({
    value,
    routes: value.belts.map((belt) => ({ ...belt, resourceId: belt.itemId })),
    obstacles: [
      ...allLabels,
      ...machineBoxes,
      ...value.nodes
        .filter((node) =>
          ['splitter', 'merger', 'pipe-junction'].includes(node.kind),
        )
        .map((node) => ({
          x: node.x - transportBodyHalf,
          y: node.y - transportBodyHalf,
          width: transportBodyHalf * 2,
          height: transportBodyHalf * 2,
        })),
    ],
    invalid: value.corridorViolations,
  });
  const baseline = placeBeltNetwork(floor, routeContext);
  const bundles: CorridorBundle[] = [
    ...floor.inputs.map((feed) => ({
      id: `input:${feed.itemId}`,
      lanes: feed.lines,
      preferredSide:
        floor.inputSide === 'east' ? ('east' as const) : ('west' as const),
      terminals: baseline.nodes.filter(
        (node) =>
          node.itemId === feed.itemId &&
          node.flow === 'input' &&
          node.placement === 'rail',
      ),
    })),
    {
      id: `output:${floor.itemId}`,
      lanes: floor.transport.collectors,
      preferredSide:
        floor.outputSide === 'west' || floor.outputSide === 'north'
          ? 'west'
          : 'east',
      terminals: baseline.nodes.filter(
        (node) => node.flow === 'output' && node.stage === 'collection',
      ),
    },
  ];
  const optimized = optimizeCorridors({
    machines: machineBoxes,
    bundles,
    baseline: evaluate(baseline),
    evaluate: (corridors) =>
      evaluate(placeBeltNetwork(floor, { ...routeContext, corridors })),
    // One-row floors have no row-to-row buses to reorganize.
    maxCandidates: floor.rowCounts.length > 1 ? 6 : 1,
    clearance: 0.6,
  });
  const transportScene = optimized.value;
  const corridorOptimization = {
    assignments: optimized.assignments,
    quality: optimized.quality,
    baselineQuality: optimized.baselineQuality,
    candidatesEvaluated: optimized.candidatesEvaluated,
  };
  const loadLabels = placeBeltLoadLabels(transportScene.belts, [
    ...allLabels,
    ...floor.machines.map((machine) => ({
      x: machine.x + shift,
      y: machine.y + shift,
      width: machine.width,
      height: machine.depth,
    })),
    ...transportScene.nodes
      .filter((node) =>
        ['splitter', 'merger', 'pipe-junction'].includes(node.kind),
      )
      .map((node) => ({
        x: node.x - transportPortRadius - 0.1,
        y: node.y - transportPortRadius - 0.1,
        width: (transportPortRadius + 0.1) * 2,
        height: (transportPortRadius + 0.1) * 2,
      })),
  ]);
  const points = [
    ...transportScene.nodes,
    ...transportScene.belts.flatMap((belt) => belt.points),
  ];
  const sceneLeft = Math.min(
    shift - 5,
    ...loadLabels.map((label) => label.x - 1),
    ...points.map((point) => point.x - 2),
    outputRail - 3,
    ...feeders.map((x) => x - 3),
    ...allLabels.map((l) => l.x - 2),
  );
  const sceneTop = Math.min(
    shift - 5,
    ...loadLabels.map((label) => label.y - 1),
    ...points.map((point) => point.y - 2),
    firstY - feeds * 1.2 - 4,
    ...allLabels.map((l) => l.y - 2),
  );
  const sceneRight = Math.max(
    shift + floor.width + 3,
    ...loadLabels.map((label) => label.x + label.width + 1),
    ...points.map((point) => point.x + 2),
    outputRail + 3,
    ...feeders.map((x) => x + 3),
    ...allLabels.map((l) => l.x + l.width + 2),
  );
  const sceneBottom = Math.max(
    maxY + 8,
    ...loadLabels.map((label) => label.y + label.height + 1),
    ...points.map((point) => point.y + 2),
    shift + floor.depth + 3,
    ...allLabels.map((l) => l.y + l.height + 2),
  );
  return {
    ...transportScene,
    corridorOptimization,
    loadLabels,
    shift,
    feeds,
    maxX,
    maxY,
    firstY,
    lastY,
    inputRail,
    outputRail,
    feeders,
    labels,
    inputAnchors,
    output,
    outputLabel,
    sceneLeft,
    sceneTop,
    sceneWidth: sceneRight - sceneLeft,
    sceneHeight: sceneBottom - sceneTop,
  };
}
