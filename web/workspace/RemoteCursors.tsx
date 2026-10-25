import type { CSSProperties } from 'react';
import type { SessionPresence } from '../../src/session-plan.js';

/** Render SVG cursors in diagram coordinates, or HTML cursors in normalized panel coordinates. */
export function RemoteCursors({
  peers,
  svg = false,
}: {
  peers: SessionPresence[];
  svg?: boolean;
}) {
  const visible = peers.filter(
    (p) =>
      p.cursor && Number.isFinite(p.cursor.x) && Number.isFinite(p.cursor.y),
  );
  if (svg)
    return (
      <g className="remote-cursors-svg" aria-hidden="true" pointerEvents="none">
        {visible.map((peer) => (
          <g
            key={`${peer.participantId}:${peer.clientId}`}
            transform={`translate(${peer.cursor!.x} ${peer.cursor!.y})`}
          >
            <path
              d="M0 0L0.6 3.2L1.4 2.1L2.7 1.7Z"
              fill={peer.color}
              stroke="#171B1F"
              strokeWidth="0.15"
            />
            <rect
              x="1.7"
              y="2.5"
              width={Math.min(peer.name.length, 24) * 0.95 + 2}
              height="2.8"
              rx="0.4"
              fill="#171B1F"
              stroke={peer.color}
              strokeWidth="0.12"
            />
            <text x="2.7" y="4.4" fill={peer.color} fontSize="1.6">
              {peer.name.slice(0, 24)}
            </text>
          </g>
        ))}
      </g>
    );
  return (
    <div className="remote-cursors" aria-hidden="true">
      {visible.map((peer) => (
        <div
          key={`${peer.participantId}:${peer.clientId}`}
          className="remote-cursor"
          style={
            {
              left: `${peer.cursor!.x * 100}%`,
              top: `${peer.cursor!.y * 100}%`,
              '--cursor-color': peer.color,
            } as CSSProperties
          }
        >
          <svg viewBox="0 0 18 22" width="18" height="22">
            <path
              d="M1 1L4 19L9 12L17 10Z"
              fill="currentColor"
              stroke="#171B1F"
              strokeWidth="1.5"
            />
          </svg>
          <span>{peer.name}</span>
        </div>
      ))}
    </div>
  );
}
