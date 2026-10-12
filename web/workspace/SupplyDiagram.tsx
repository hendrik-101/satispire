import { supplySceneMetrics } from './supply-scene.js';
import type { generateSupplyLayout } from '../../src/domain/supply-layout.js';
import { itemName } from '../../src/domain/vanilla.js';
type Layout = ReturnType<typeof generateSupplyLayout>;
type Floor = Layout['floors'][number];
type Point = { x: number; y: number };
/** Logical aggregate/row topology; the paths are schematic, not individual belts. */
export function SupplyDiagram({
  layout,
  floor,
  marker,
}: {
  layout: Layout;
  floor: Floor;
  marker: string;
}) {
  const { shift, feeds, maxY, firstY, outputRail, feeders, labels } =
    supplySceneMetrics(layout, floor);
  const port = (p: Point) => ({ x: p.x + shift, y: p.y + shift });
  const input = port(floor.connections.input),
    output = port(floor.connections.output);
  const path = (points: Point[], out = false, key?: string) => (
    <g
      key={key}
      className={`supply-belt supply-belt-${out ? 'output' : 'input'}`}
    >
      <path
        d={points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')}
        fill="none"
        stroke="#17232b"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      <path
        className="supply-belt-edge"
        d={points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')}
        fill="none"
        stroke={out ? '#eea15d' : '#65b9e5'}
        strokeWidth="0.3"
        strokeLinejoin="round"
        markerEnd={`url(#${marker}-${out ? 'out' : 'in'})`}
      />
    </g>
  );
  const feeder = (feed: number) => feeders[feed]!;
  const inputAt = (m: Floor['machines'][number], feed: number) =>
    m.x + shift + 1 + ((feed + 1) * 6) / (feeds + 1);
  const transfers = layout.transfers.filter((t) =>
    t.span.includes(floor.index),
  );
  return (
    <>
      <rect
        className="block-boundary"
        x={shift}
        y={shift}
        width={floor.width}
        height={floor.depth}
        rx="1"
        fill="#28303822"
        stroke="#48545e"
        strokeWidth="0.15"
      />
      {floor.inputs.map((feed, i) => (
        <g
          key={feed.itemId}
          data-feed={i + 1}
          data-source-floor={feed.sourceFloor ?? 'external'}
          data-side={floor.inputSide}
          aria-label={itemName(feed.itemId)}
        >
          {path([
            input,
            { x: feeder(i), y: input.y },
            { x: feeder(i), y: firstY - i * 1.2 },
          ])}
          <text x={labels[i]!.x} y={labels[i]!.y} fontSize="1.7" fill="#65b9e5">
            {labels[i]!.text}
          </text>
          {floor.rowCounts.length > 1 &&
            path([
              { x: feeder(i), y: firstY - i * 1.2 },
              {
                x: feeder(i),
                y: firstY + (floor.rowCounts.length - 1) * 16 - i * 1.2,
              },
            ])}
        </g>
      ))}
      {path(
        [
          { x: outputRail, y: firstY + 12 },
          { x: outputRail, y: maxY + 5 },
        ],
        true,
      )}
      <g data-output-attachment>
        {path(
          floor.outputSide === 'north'
            ? [
                { x: outputRail, y: firstY + 12 },
                { x: outputRail, y: shift - 3 },
                { x: output.x, y: shift - 3 },
                output,
              ]
            : [
                { x: outputRail, y: maxY + 5 },
                { x: output.x, y: maxY + 5 },
                output,
              ],
          true,
        )}
      </g>
      {floor.rowCounts.map((_, row) => {
        const machines = floor.machines.filter((m) => m.y === 8 + row * 16);
        const first = machines[0]!;
        const iy = first.y + shift - 3,
          oy = first.y + shift + 9;
        return (
          <g key={row} data-row={row}>
            {floor.inputs.map((f, i) => (
              <g key={f.itemId} data-input-row={row}>
                {path([
                  { x: feeder(i), y: iy - i * 1.2 },
                  {
                    x: inputAt(
                      floor.inputSide === 'east'
                        ? first
                        : machines[machines.length - 1]!,
                      i,
                    ),
                    y: iy - i * 1.2,
                  },
                ])}
              </g>
            ))}
            {path(
              [
                {
                  x:
                    (floor.outputSide === 'west'
                      ? machines[machines.length - 1]!
                      : first
                    ).x +
                    shift +
                    4,
                  y: oy,
                },
                { x: outputRail, y: oy },
              ],
              true,
            )}
            {machines.map((m) => (
              <g key={m.id}>
                {floor.inputs.map((f, i) => (
                  <g key={f.itemId}>
                    {path([
                      { x: inputAt(m, i), y: iy - i * 1.2 },
                      { x: inputAt(m, i), y: m.y + shift - 1 },
                    ])}
                    <rect
                      className="supply-junction"
                      x={inputAt(m, i) - 0.5}
                      y={iy - i * 1.2 - 0.5}
                      width="1"
                      height="1"
                      rx="0.2"
                      fill="#4a819e"
                      stroke="#26343c"
                      strokeWidth="0.15"
                    />
                  </g>
                ))}
                {path(
                  [
                    { x: m.x + shift + 4, y: m.y + shift + 7 },
                    { x: m.x + shift + 4, y: oy },
                  ],
                  true,
                )}
                <rect
                  className="supply-junction"
                  x={m.x + shift + 3.4}
                  y={oy - 0.6}
                  width="1.2"
                  height="1.2"
                  rx="0.2"
                  fill="#b47b49"
                  stroke="#26343c"
                  strokeWidth="0.15"
                />
              </g>
            ))}
          </g>
        );
      })}
      {[
        { p: input, out: false, side: floor.inputSide, show: feeds > 0 },
        { p: output, out: true, side: floor.outputSide, show: true },
      ]
        .filter((a) => a.show)
        .map(({ p, out, side }) => (
          <g
            key={out ? 'out' : 'in'}
            data-aggregate={out ? 'output' : 'input'}
            data-side={side}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r="0.8"
              fill={out ? '#eea15d' : '#65b9e5'}
            />
            <text
              x={p.x + (side === 'west' ? -1.5 : side === 'east' ? 1.5 : 0)}
              y={p.y + (side === 'north' ? -2 : side === 'south' ? 3 : 0.5)}
              textAnchor={
                side === 'west' ? 'end' : side === 'east' ? 'start' : 'middle'
              }
              fontSize="1.7"
              fill={out ? '#eea15d' : '#65b9e5'}
            >
              {out ? `${floor.output.lines}× OUT` : 'IN'}
            </text>
          </g>
        ))}
      {floor.targetOutput &&
        floor.connections.targetOutput &&
        (() => {
          const target = port(floor.connections.targetOutput);
          return (
            <g
              data-target-delivery
              aria-label={`Zielausgang ${itemName(floor.itemId)}`}
            >
              {path([output, target], true)}
              <circle cx={target.x} cy={target.y} r="0.7" fill="#eea15d" />
              <text
                x={
                  target.x +
                  (floor.outputSide === 'west'
                    ? -1.5
                    : floor.outputSide === 'east'
                      ? 1.5
                      : 0)
                }
                y={
                  target.y +
                  (floor.outputSide === 'north'
                    ? -2
                    : floor.outputSide === 'south'
                      ? 3
                      : 0.5)
                }
                textAnchor={
                  floor.outputSide === 'west'
                    ? 'end'
                    : floor.outputSide === 'east'
                      ? 'start'
                      : 'middle'
                }
                fontSize="1.6"
                fill="#eea15d"
              >
                ZIEL
              </text>
              <title>{`${floor.targetOutput.rate}/min · ${floor.targetOutput.lines} Transportlinien · symbolisch`}</title>
            </g>
          );
        })()}
      {transfers.map((t) => {
        const p = { x: t.x + 5, y: t.y + 5 };
        const source = t.fromFloor === floor.index;
        const destination = t.toFloor === floor.index;
        const aggregate = source ? output : input;
        // The same perimeter slot is shown on every floor of the transfer span.
        const mid =
          t.side === 'west' || t.side === 'east'
            ? { x: p.x, y: aggregate.y }
            : { x: aggregate.x, y: p.y };
        const points = source ? [aggregate, mid, p] : [p, mid, aggregate];
        return (
          <g
            key={t.id}
            className="transfer-module"
            data-transfer-id={t.id}
            data-side={t.side}
            data-side-changes={t.sideChanges}
            aria-label="Symbolischer Etagenübergang"
          >
            {(source || destination) && path(points, source)}
            <rect
              x={p.x - 2}
              y={p.y - 3}
              width="4"
              height="6"
              rx="0.6"
              fill="#3b4852"
              stroke="#8a9ca7"
              strokeWidth="0.25"
            />
            <path
              d={`M ${p.x - 1} ${p.y - 2} H ${p.x + 1} V ${p.y + 2} H ${p.x - 1} Z M ${p.x} ${p.y - 1} V ${p.y + 1}`}
              fill="none"
              stroke="#b3c2cb"
              strokeWidth="0.3"
            />
            <title>{`Etage ${t.fromFloor + 1} → ${t.toFloor + 1} · ${t.sideChanges ? `${t.sideChanges} Seitenwechsel` : 'ausgerichtet'} · symbolisch`}</title>
          </g>
        );
      })}
    </>
  );
}
