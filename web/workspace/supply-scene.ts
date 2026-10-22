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
  const input = floor.connections.input;
  const labels = floor.inputs.map((f, i) => {
    const text = `${f.lines}× ${itemName(f.itemId)}`;
    // Labels use monospace; reserve a full em for Unicode fallback glyphs.
    const width =
      4 +
      Array.from(text).reduce(
        (sum, character) =>
          sum + (character.codePointAt(0)! > 0xff ? 1.7 : 1.05),
        0,
      );
    return {
      text,
      width,
      x:
        input.x +
        shift +
        (floor.inputSide === 'west' || floor.inputSide === 'north'
          ? -width - 4
          : 4),
      y:
        input.y +
        shift +
        (floor.inputSide === 'south' ? 6 + i * 3.5 : -3.5 * (feeds - i)),
    };
  });
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
  const outputIcon = {
    x: floor.outputSide === 'west' ? labelLeft - 4 : labelRight + 1,
    y:
      out.y +
      shift +
      (floor.outputSide === 'north'
        ? -2
        : floor.outputSide === 'south'
          ? 3
          : 0.5),
  };
  const sceneLeft = Math.min(
    8,
    labelLeft - 1,
    outputIcon.x - 1,
    ...labels.map((l) => l.x - 1),
    ...feeders.map((x) => x - 3),
    ...transfers.map((t) => t.x + 1),
  );
  const sceneTop = Math.min(
    11,
    firstY - Math.max(0, feeds - 1) * 1.2 - 4,
    outputIcon.y - 3,
    ...labels.map((l) => l.y - 3),
    ...transfers.map((t) => t.y + 1),
  );
  const sceneRight = Math.max(
    17 + floor.width + 9,
    labelRight + 1,
    outputIcon.x + 4,
    outputRail + 4,
    ...feeders.map((x) => x + 4),
    ...labels.map((l) => l.x + l.width + 1),
    ...transfers.map((t) => t.x + 9),
  );
  const sceneBottom = Math.max(
    17 + floor.depth + 6,
    outputIcon.y + 2,
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
    outputIcon,
    sceneLeft,
    sceneTop,
    sceneWidth: sceneRight - sceneLeft,
    sceneHeight: sceneBottom - sceneTop,
  };
}
