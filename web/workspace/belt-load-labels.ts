import { Rational } from '../../src/domain/rational.js';
import { formatRate } from './format-rate.js';

type Point = { x: number; y: number };
export type LabelObstacle = Point & { width: number; height: number };
export type LoadLabelBelt = {
  id: string;
  points: readonly Point[];
  rate: string;
  capacity: string;
  itemId: string;
  transport: 'belt' | 'pipe';
  tier: number;
};
export type BeltLoadLabel = LabelObstacle & {
  beltId: string;
  text: string;
  overloaded: boolean;
};

const overlaps = (a: LabelObstacle, b: LabelObstacle) =>
  a.x <= b.x + b.width &&
  a.x + a.width >= b.x &&
  a.y <= b.y + b.height &&
  a.y + a.height >= b.y;

/** Segment/rectangle clipping also handles non-orthogonal adapter paths. */
function intersects(a: Point, b: Point, box: LabelObstacle) {
  let lo = 0,
    hi = 1;
  for (const axis of ['x', 'y'] as const) {
    const delta = b[axis] - a[axis];
    const min = box[axis];
    const max = min + (axis === 'x' ? box.width : box.height);
    if (!delta) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      const first = (min - a[axis]) / delta;
      const last = (max - a[axis]) / delta;
      lo = Math.max(lo, Math.min(first, last));
      hi = Math.min(hi, Math.max(first, last));
      if (lo > hi) return false;
    }
  }
  return true;
}

/** At most one load per edge; labels never conceal another route or symbol. */
export function placeBeltLoadLabels(
  belts: readonly LoadLabelBelt[],
  obstacles: readonly LabelObstacle[],
): BeltLoadLabel[] {
  const segments = belts.flatMap((belt) =>
    belt.points.slice(1).map((end, i) => ({ start: belt.points[i]!, end })),
  );
  const placed: BeltLoadLabel[] = [];
  for (const belt of belts) {
    const canonicalRate = Rational.parseCanonical(belt.rate).toString();
    const text = `${formatRate(canonicalRate)}${belt.transport === 'pipe' ? ' m³/min' : '/min'}`;
    const width = text.length * 0.96 + 1;
    const height = 2.4;
    const candidates: Point[] = [];
    const edges = belt.points
      .slice(1)
      .map((end, i) => ({ start: belt.points[i]!, end }));
    edges.sort(
      (a, b) =>
        Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y) -
        Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y),
    );
    for (const { start, end } of edges) {
      for (const gap of [0.65, 1.2, 2, 3, 4, 5]) {
        for (const fraction of [0.5, 0.25, 0.75, 0.125, 0.875, 0, 1]) {
          const x = start.x + (end.x - start.x) * fraction;
          const y = start.y + (end.y - start.y) * fraction;
          if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
            candidates.push(
              { x: x - width / 2, y: y - height - gap },
              { x: x - width / 2, y: y + gap },
            );
          } else {
            candidates.push(
              { x: x + gap, y: y - height / 2 },
              { x: x - width - gap, y: y - height / 2 },
            );
          }
        }
      }
    }
    const position = candidates.find((point) => {
      const box = {
        x: point.x - 0.2,
        y: point.y - 0.2,
        width: width + 0.4,
        height: height + 0.4,
      };
      return (
        !obstacles.some((obstacle) => overlaps(box, obstacle)) &&
        !placed.some((label) => overlaps(box, label)) &&
        !segments.some(({ start, end }) => intersects(start, end, box))
      );
    });
    if (position)
      placed.push({
        ...position,
        width,
        height,
        beltId: belt.id,
        text,
        overloaded:
          Rational.parseCanonical(belt.rate).compare(
            Rational.parseCanonical(belt.capacity),
          ) > 0,
      });
  }
  return placed;
}
