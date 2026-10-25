import { transportSymbolScale } from './transport-symbol.js';

/** Original schematic logistics hubs; proportions are symbolic, not game geometry. */
export function TransportJunction({
  x,
  y,
  kind,
  color,
  ports,
}: {
  x: number;
  y: number;
  kind: 'splitter' | 'merger' | 'pipe-junction';
  color: string;
  /** Cardinal unit vectors relative to the hub center; out describes material flow. */
  ports: { x: number; y: number; out: boolean }[];
}) {
  const pipe = kind === 'pipe-junction';
  return (
    <g
      transform={`translate(${x} ${y}) scale(${transportSymbolScale})`}
      aria-hidden="true"
    >
      {pipe ? (
        <circle r="0.64" fill="#283038" stroke="#73838e" strokeWidth="0.1" />
      ) : (
        <path
          d="M -.48 -.65 H .48 L .65 -.48 V .48 L .48 .65 H -.48 L -.65 .48 V -.48 Z"
          fill="#283038"
          stroke="#73838e"
          strokeWidth="0.1"
          strokeLinejoin="round"
        />
      )}
      {ports.map((port, index) => (
        <g
          key={index}
          transform={`rotate(${(Math.atan2(port.y, port.x) * 180) / Math.PI})`}
          data-port-flow={port.out ? 'out' : 'in'}
        >
          <path
            d="M .27 -.19 H .8 V .19 H .27"
            fill={pipe ? '#3f5361' : '#20282e'}
            stroke="#73838e"
            strokeWidth="0.07"
            strokeLinejoin="round"
          />
          <path
            d={
              port.out
                ? 'M .43 -.12 L .59 0 L .43 .12'
                : 'M .59 -.12 L .43 0 L .59 .12'
            }
            fill="none"
            stroke="#f1f4f6"
            strokeWidth="0.085"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
      {pipe ? (
        <circle r="0.25" fill="#283038" stroke={color} strokeWidth="0.11" />
      ) : (
        <path
          d="M 0 -.23 L .23 0 L 0 .23 L -.23 0 Z"
          fill="#3f5361"
          stroke={color}
          strokeWidth="0.09"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}
