import { useState } from 'react';
import { supplySceneMetrics, type FlowLabel } from './supply-scene.js';
import type { generateSupplyLayout } from '../../src/domain/supply-layout.js';
import type { Catalog } from '../../src/domain/catalog.js';
import type { TechnologyProfile } from '../../src/domain/technology.js';
import { itemName } from '../../src/domain/vanilla.js';
import { resourceColor } from './resource-colors.js';
import { ResourceIcon } from './ResourceIcon.js';
import { formatRate } from './format-rate.js';
import { TransportJunction } from './TransportJunction.js';
type Layout = ReturnType<typeof generateSupplyLayout>;
type Floor = Layout['floors'][number];

function beltPath(points: readonly { x: number; y: number }[]) {
  const first = points[0]!;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1]!,
      point = points[i]!,
      next = points[i + 1]!;
    const before = Math.hypot(point.x - previous.x, point.y - previous.y);
    const after = Math.hypot(next.x - point.x, next.y - point.y);
    const radius = Math.min(0.32, before / 2, after / 2);
    const start = {
      x: point.x - ((point.x - previous.x) / before) * radius,
      y: point.y - ((point.y - previous.y) / before) * radius,
    };
    const end = {
      x: point.x + ((next.x - point.x) / after) * radius,
      y: point.y + ((next.y - point.y) / after) * radius,
    };
    d += ` L ${start.x} ${start.y} Q ${point.x} ${point.y} ${end.x} ${end.y}`;
  }
  const last = points.at(-1)!;
  return `${d} L ${last.x} ${last.y}`;
}

/** Each edge is one capacity-checked belt/pipe between actual topology ports. */
export function SupplyDiagram({
  layout,
  floor,
  marker,
  catalog,
  technology,
  compact = false,
  showBeltRates = false,
  scene,
}: {
  layout: Layout;
  floor: Floor;
  marker: string;
  catalog: Catalog;
  technology: TechnologyProfile;
  compact?: boolean;
  showBeltRates?: boolean;
  scene?: ReturnType<typeof supplySceneMetrics>;
}) {
  const [hoveredBelt, setHoveredBelt] = useState<string | null>(null);
  const [focusedBelt, setFocusedBelt] = useState<string | null>(null);
  const [selectedBelt, setSelectedBelt] = useState<string | null>(null);
  const { shift, labels, outputLabel, nodes, belts, portSides, loadLabels } =
    scene ?? supplySceneMetrics(layout, floor, catalog, technology, compact);
  const drawBelt = (belt: (typeof belts)[number]) => {
    const d = beltPath(belt.points);
    const unit = belt.transport === 'pipe' ? 'm³/min' : 'Stk./min';
    return (
      <g
        key={belt.id}
        className={`supply-belt supply-belt-${belt.flow}`}
        role="button"
        tabIndex={0}
        aria-label={`${itemName(belt.itemId)} · ${formatRate(belt.rate)} ${unit}`}
        aria-pressed={selectedBelt === belt.id}
        onPointerEnter={() => setHoveredBelt(belt.id)}
        onPointerLeave={() => setHoveredBelt(null)}
        onFocus={() => setFocusedBelt(belt.id)}
        onBlur={() => setFocusedBelt(null)}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedBelt((current) => (current === belt.id ? null : belt.id));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedBelt((current) =>
              current === belt.id ? null : belt.id,
            );
          } else if (event.key === 'Escape') {
            setSelectedBelt(null);
            event.currentTarget.blur();
          }
        }}
        data-belt-id={belt.id}
        data-resource-id={belt.itemId}
        data-edge-from={belt.from}
        data-edge-to={belt.to}
        data-lane={belt.lane}
        data-rate={belt.rate}
        data-capacity={belt.capacity}
        data-machine-input={
          nodes.find(
            (node) => node.id === belt.to && node.kind === 'machine-input',
          )?.machineId
        }
        data-machine-output={
          nodes.find(
            (node) => node.id === belt.from && node.kind === 'machine-output',
          )?.machineId
        }
      >
        <title>{`${itemName(belt.itemId)} · ${formatRate(belt.rate)} ${unit} · ${belt.transport === 'pipe' ? 'Rohr' : 'Band'} Mk.${belt.tier} · Kapazität ${belt.capacity} ${unit}`}</title>
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth="1.8"
          pointerEvents="stroke"
        />
        <path
          d={d}
          fill="none"
          stroke="#1b2126"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />
        <path
          className="supply-belt-edge"
          d={d}
          fill="none"
          stroke={resourceColor(belt.itemId)}
          strokeWidth={selectedBelt === belt.id ? '0.45' : '0.25'}
          strokeLinejoin="round"
          markerEnd={`url(#${marker}-${resourceColor(belt.itemId).slice(1)})`}
        />
      </g>
    );
  };
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
          {belts
            .filter(
              (belt) => belt.flow === 'input' && belt.itemId === feed.itemId,
            )
            .map(drawBelt)}
        </g>
      ))}
      <g data-output-attachment>
        {belts.filter((belt) => belt.flow === 'output').map(drawBelt)}
      </g>
      {nodes
        .filter((node) => node.kind === 'inlet' || node.kind === 'outlet')
        .map((node) => (
          <circle
            key={node.id}
            cx={node.x}
            cy={node.y}
            r="0.45"
            fill={resourceColor(node.itemId)}
            data-transport-node={node.id}
            data-kind={node.kind}
            data-intake-resource={
              node.kind === 'inlet' ? node.itemId : undefined
            }
            data-terminal-id={node.terminalId}
            data-lane={node.lane}
          />
        ))}
      {nodes
        .filter((node) =>
          ['splitter', 'merger', 'pipe-junction'].includes(node.kind),
        )
        .map((node) => {
          const incident = belts.filter(
            (belt) => belt.from === node.id || belt.to === node.id,
          );
          const name =
            node.kind === 'splitter'
              ? 'Splitter'
              : node.kind === 'merger'
                ? 'Merger'
                : 'Rohrkreuzung';
          return (
            <g
              key={node.id}
              className="transport-junction"
              data-transport-node={node.id}
              data-kind={node.kind}
              data-resource-id={node.itemId}
              data-lane={node.lane}
              aria-label={name}
            >
              <title>{`${name} · ${itemName(node.itemId)} · ${incident
                .filter((belt) => belt.to === node.id)
                .map((belt) => formatRate(belt.rate))
                .join(' + ')} → ${incident
                .filter((belt) => belt.from === node.id)
                .map((belt) => formatRate(belt.rate))
                .join(' + ')} / min`}</title>
              <TransportJunction
                x={node.x}
                y={node.y}
                kind={node.kind as 'splitter' | 'merger' | 'pipe-junction'}
                color={resourceColor(node.itemId)}
                ports={incident.map((belt) => ({
                  ...portSides.get(`${belt.id}:${node.id}`)!,
                  out: belt.from === node.id,
                }))}
              />
            </g>
          );
        })}
      <g className="belt-load-labels" aria-label="Bandlasten pro Minute">
        {loadLabels.map((label) => (
          <g
            key={label.beltId}
            data-load-belt={label.beltId}
            data-overloaded={label.overloaded ? 'true' : 'false'}
            style={{
              display:
                showBeltRates ||
                hoveredBelt === label.beltId ||
                focusedBelt === label.beltId ||
                selectedBelt === label.beltId
                  ? undefined
                  : 'none',
              pointerEvents: 'none',
            }}
          >
            <rect
              x={label.x}
              y={label.y}
              width={label.width}
              height={label.height}
              rx=".25"
              fill="#1b2126"
            />
            <text
              x={label.x + label.width / 2}
              y={label.y + 1.75}
              textAnchor="middle"
              fontFamily="monospace"
              fontSize="1.6"
              fill={label.overloaded ? '#ff9b85' : '#d8e1e7'}
            >
              {label.text}
            </text>
          </g>
        ))}
      </g>
      <g data-flow-labels>
        {labels.map((label, i) => (
          <g key={floor.inputs[i]!.itemId} data-feed-label={i + 1}>
            <FlowCard
              label={label}
              itemId={floor.inputs[i]!.itemId}
              direction="EIN"
            />
          </g>
        ))}
        <g data-aggregate="output" data-side={floor.outputSide}>
          <FlowCard label={outputLabel} itemId={floor.itemId} direction="AUS" />
        </g>
      </g>
    </>
  );
}

function FlowCard({
  label,
  itemId,
  direction,
}: {
  label: FlowLabel;
  itemId: string;
  direction: string;
}) {
  return (
    <g className="flow-label">
      <rect
        x={label.x}
        y={label.y}
        width={label.width}
        height={label.height}
        rx="0.6"
        fill="#21272c"
        stroke="#48545e"
        strokeWidth="0.12"
      />
      <ResourceIcon
        itemId={itemId}
        x={label.x + 0.8}
        y={label.y + 0.8}
        size={2.7}
      />
      <text x={label.x + 4.2} y={label.y + 2.3} fontSize="1.35" fill="#f1f4f6">
        {label.name}
      </text>
      <text
        x={label.x + 0.9}
        y={label.y + 4.6}
        fontSize="1.3"
        fill={resourceColor(itemId)}
      >
        {direction} gesamt · {label.rate}
      </text>
      <text x={label.x + 0.9} y={label.y + 6.7} fontSize="1.15" fill="#b4bec7">
        {label.transport}
      </text>
      {label.destinations.map((destination, i) => (
        <g
          key={i}
          className={destination.transfer ? 'transfer-module' : undefined}
          aria-label={
            destination.transfer ? 'Symbolischer Etagenübergang' : undefined
          }
          data-transfer-id={destination.transfer?.id}
          data-side={destination.transfer?.side}
        >
          <text
            x={label.x + 0.9}
            y={label.y + 8.8 + i * 2}
            fontSize="1.2"
            fill="#b4bec7"
            data-target-delivery={
              destination.transfer
                ? undefined
                : direction === 'AUS'
                  ? true
                  : undefined
            }
          >
            {destination.text}
          </text>
        </g>
      ))}
    </g>
  );
}
