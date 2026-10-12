import type { generateSupplyLayout } from '../../src/domain/supply-layout.js';
import { itemName } from '../../src/domain/vanilla.js';
type Layout = ReturnType<typeof generateSupplyLayout>;
type Floor = Layout['floors'][number];
/** Shared renderer metrics. Bounds cover symbolic rails/labels, not game geometry. */
export function supplySceneMetrics(layout: Layout, floor: Floor) {
  const shift = 17,
    feeds = floor.inputs.length;
  const maxX = Math.max(...floor.machines.map((m) => m.x + m.width)) + shift;
  const maxY = Math.max(...floor.machines.map((m) => m.y + m.depth)) + shift;
  const firstY = floor.machines[0]!.y + shift - 3;
  const left = shift + 2,
    right = maxX + 6 + feeds * 1.2;
  const inputRail = floor.inputSide === 'east' ? right : left;
  const outputRail = floor.outputSide === 'west' ? left - 2 : right + 2;
  const feeders = Array.from(
    { length: feeds },
    (_, i) => inputRail + (floor.inputSide === 'east' ? i * 1.2 : -i * 1.2),
  );
  const labels = floor.inputs.map((f, i) => ({
    text: `${f.lines}× ${itemName(f.itemId)}`,
    x: shift + 2,
    y: maxY + 11 + i * 2.2,
  }));
  const transfers = layout.transfers.filter((t) =>
    t.span.includes(floor.index),
  );
  const out = floor.connections.output;
  const outLabelWidth = `${floor.output.lines}× OUT`.length * 1.7;
  const labelLeft =
    floor.outputSide === 'west'
      ? out.x + shift - 1.5 - outLabelWidth
      : out.x + shift - outLabelWidth / 2;
  const labelRight =
    floor.outputSide === 'east'
      ? out.x + shift + 1.5 + outLabelWidth
      : out.x + shift + outLabelWidth / 2;
  const sceneLeft = Math.min(
    8,
    labelLeft - 1,
    ...feeders.map((x) => x - 3),
    ...transfers.map((t) => t.x + 1),
  );
  const sceneTop = Math.min(
    11,
    firstY - Math.max(0, feeds - 1) * 1.2 - 4,
    ...transfers.map((t) => t.y + 1),
  );
  const sceneRight = Math.max(
    17 + floor.width + 9,
    labelRight + 1,
    outputRail + 4,
    ...feeders.map((x) => x + 4),
    ...labels.map((l) => l.x + l.text.length * 1.7 + 1),
    ...transfers.map((t) => t.x + 9),
  );
  const sceneBottom = Math.max(
    17 + floor.depth + 6,
    ...labels.map((l) => l.y + 3),
    ...transfers.map((t) => t.y + 9),
  );
  return {
    shift,
    feeds,
    maxX,
    maxY,
    firstY,
    inputRail,
    outputRail,
    feeders,
    labels,
    sceneLeft,
    sceneTop,
    sceneWidth: sceneRight - sceneLeft,
    sceneHeight: sceneBottom - sceneTop,
  };
}
