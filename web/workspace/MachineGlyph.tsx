import { useId } from 'react';
import { resourceColor } from './resource-colors.js';

/** Original industrial symbols. Ports and proportions are schematic. */
export function MachineGlyph({
  machineId,
  selected = false,
  number,
  feeds = 1,
  inputItems = [],
  outputItem,
}: {
  machineId: string;
  selected?: boolean;
  number?: number;
  feeds?: number;
  inputItems?: readonly string[];
  outputItem?: string;
}) {
  const surface = useId().replace(/:/g, '');
  const family = machineId.toLowerCase();
  const furnace = /smelter|foundry/.test(family);
  const assembly = /assembler|manufacturer/.test(family);
  const constructor = /constructor/.test(family);
  return (
    <svg
      viewBox="0 0 100 80"
      width="100%"
      height="100%"
      className={`machine-glyph${selected ? ' selected' : ''}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={surface} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#637e91" />
          <stop offset="0.45" stopColor="#3f5361" />
          <stop offset="1" stopColor="#273842" />
        </linearGradient>
      </defs>
      <rect
        className="machine-base"
        x="8"
        y="7"
        width="84"
        height="66"
        rx="5"
        fill="#20282e"
        stroke={selected ? '#f39a45' : '#73838e'}
        strokeWidth={selected ? 3 : 1.5}
      />
      <path
        className="machine-body"
        d="M20 10H80L87 20V61L79 70H21L13 61V20Z"
        fill={`url(#${surface})`}
        stroke="#82919b"
        strokeWidth="1"
      />
      <path
        className="machine-rail"
        d="M17 23V58M83 23V58"
        stroke="#b1bcc4"
        strokeWidth="3"
      />
      {furnace ? (
        <>
          <rect
            className="machine-panel"
            x="29"
            y="15"
            width="42"
            height="50"
            rx="5"
            fill="#293239"
            stroke="#8a99a2"
          />
          <circle
            className="machine-detail"
            cx="50"
            cy="38"
            r="17"
            fill="#63717a"
            stroke="#b8c1c8"
            strokeWidth="2"
          />
          <circle
            className="machine-vent"
            cx="50"
            cy="38"
            r="11"
            fill="#293239"
          />
          <path
            className="machine-detail"
            d="M42 30L58 46M42 46L58 30M50 27V49M39 38H61"
            stroke="#84939e"
            strokeWidth="2"
          />
          <path
            className="machine-vent"
            d="M22 23V31M22 37V45M22 51V59M77 23V31M77 37V45M77 51V59"
            stroke="#1b2329"
            strokeWidth="4"
          />
          <rect
            className="machine-panel"
            x="36"
            y="55"
            width="28"
            height="9"
            rx="1"
            fill="#74838d"
          />
        </>
      ) : assembly ? (
        <>
          <rect
            className="machine-panel"
            x="25"
            y="18"
            width="50"
            height="45"
            rx="2"
            fill="#273038"
            stroke="#9aa8b1"
          />
          <path
            className="machine-detail"
            d="M31 24V57M40 24V57M49 24V57M58 24V57M67 24V57"
            stroke="#53616c"
            strokeWidth="4"
          />
          <path
            className="machine-rail"
            d="M20 28H80M20 49H80"
            stroke="#adbac3"
            strokeWidth="3"
          />
          <rect
            className="machine-body"
            x="39"
            y="26"
            width="22"
            height="26"
            rx="2"
            fill="#7692a5"
            stroke="#d1d7dc"
          />
          <rect
            className="machine-vent"
            x="45"
            y="31"
            width="10"
            height="15"
            fill="#303c44"
          />
          <path
            className="machine-detail"
            d="M32 12V18M68 12V18"
            stroke="#adbcc5"
            strokeWidth="4"
          />
        </>
      ) : constructor ? (
        <>
          <rect
            className="machine-panel"
            x="28"
            y="17"
            width="45"
            height="46"
            rx="2"
            fill="#283139"
            stroke="#a1aeb7"
          />
          <path
            className="machine-detail"
            d="M33 25H68M33 34H68M33 43H68M33 52H68"
            stroke="#697883"
            strokeWidth="4"
          />
          <path
            className="machine-rail"
            d="M22 20H78V32H60"
            fill="none"
            stroke="#abb8c1"
            strokeWidth="4"
          />
          <rect
            className="machine-body"
            x="44"
            y="25"
            width="20"
            height="22"
            rx="2"
            fill="#7699ae"
            stroke="#d0d8dd"
          />
          <circle
            className="machine-vent"
            cx="54"
            cy="37"
            r="5"
            fill="#303b43"
          />
          <rect
            className="machine-panel"
            x="18"
            y="48"
            width="8"
            height="13"
            fill="#647580"
          />
        </>
      ) : (
        <>
          <rect
            className="machine-panel"
            x="28"
            y="16"
            width="44"
            height="48"
            rx="4"
            fill="#2a343b"
            stroke="#9aabb6"
          />
          <circle
            className="machine-detail"
            cx="50"
            cy="39"
            r="14"
            fill="#6f818c"
            stroke="#aab7c0"
            strokeWidth="2"
          />
          <circle
            className="machine-vent"
            cx="50"
            cy="39"
            r="7"
            fill="#2a343b"
          />
          <path
            className="machine-detail"
            d="M34 57H66M22 22V56M78 22V56"
            stroke="#8e9fa9"
            strokeWidth="3"
          />
        </>
      )}
      {Array.from({ length: Math.max(0, Math.min(4, feeds)) }, (_, feed) => {
        const count = Math.max(0, Math.min(4, feeds));
        const center = 20 + ((feed + 1) * 60) / (count + 1);
        const width = count === 1 ? 16 : 10;
        return (
          <rect
            key={feed}
            className="machine-port"
            x={center - width / 2}
            y="0"
            width={width}
            height="12"
            rx="1"
            data-resource-id={inputItems[feed]}
            fill={
              inputItems[feed] ? resourceColor(inputItems[feed]) : '#b4bec7'
            }
            stroke="#26353e"
            strokeWidth="2"
          />
        );
      })}
      <rect
        className="machine-port"
        x="42"
        y="68"
        width="16"
        height="12"
        rx="1"
        data-resource-id={outputItem}
        fill={outputItem ? resourceColor(outputItem) : '#b4bec7'}
        stroke="#26353e"
        strokeWidth="2"
      />
      {[
        [17, 16],
        [83, 16],
        [17, 64],
        [83, 64],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          className="machine-bolt"
          cx={cx}
          cy={cy}
          r="2"
          fill="#bac5cb"
        />
      ))}
      {number !== undefined && (
        <g>
          <rect
            x="62"
            y="54"
            width="24"
            height="16"
            rx="3"
            fill={selected ? '#f39a45' : '#1d272e'}
          />
          <text
            className="machine-number"
            x="74"
            y="66"
            textAnchor="middle"
            fill={selected ? '#171b1f' : '#e6edf1'}
            fontSize="12"
            fontWeight="700"
          >
            {number}
          </text>
        </g>
      )}
    </svg>
  );
}
