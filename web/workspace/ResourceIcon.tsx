import { localizedName as itemName } from './labels.js';
import { resourceColor } from './resource-colors.js';

/** Original resource pictograms authored for this project; no game assets. */
export function ResourceIcon({
  itemId,
  x = 0,
  y = 0,
  size = 3,
}: {
  itemId: string;
  x?: number;
  y?: number;
  size?: number;
}) {
  const name = itemName(itemId);
  const id = itemId.toLowerCase();
  let path: string | undefined;
  if (/platereinforced/.test(id))
    path = 'M6 10 23 6 27 22 10 26ZM11 13h1m8-2h1m-7 10h1m7-2h1M10 17l14-3';
  else if (/plate/.test(id)) path = 'M5 12 22 6 28 18 11 25ZM5 17l6 12 17-7';
  else if (/screw/.test(id))
    path =
      'M9 5h14l3 5-3 5H9l-3-5ZM12 15v12h8V15M11 19l10-2m-10 6 10-2m-9 6 9-2M12 10h8';
  else if (/rod/.test(id)) path = 'm6 23 17-17 5 5-17 17ZM6 23l5 5m9-19 5 5';
  else if (/modularframe/.test(id))
    path =
      'M6 9 17 4 27 10v15l-11 4-10-6ZM6 9l10 6 11-5M16 15v14M6 23l11-6 10 8M17 4v13';
  else if (/ore|coal|stone|crystal|sulfur/.test(id))
    path = 'm4 22 4-12 9-6 10 8 2 12-10 5ZM8 10l10 4 9-2M18 14l1 15M4 22l14-8';
  else if (/ingot/.test(id))
    path = 'm5 23 5-13 14-4 4 14-15 6ZM10 10l12 3 2-7M22 13l-9 13';
  else if (/wire|cable/.test(id))
    path =
      'M23 8C7-1 1 22 14 26c12 4 17-15 8-18C9 3 6 20 15 22c7 2 10-10 5-11-6-2-9 7-4 8m7 5 5 4';
  else if (/concrete|cement/.test(id))
    path = 'M10 5h12l-1 5 6 15-4 4H9l-4-4 6-15ZM11 10h10M10 21h12m-9-4h6';
  else if (/circuit|computer/.test(id))
    path = 'M5 5h22v22H5ZM12 11h9v10h-9ZM8 8v8h4m9 0h3m-8 5v3M8 24v-4';
  else if (/rotor|motor|stator/.test(id))
    path =
      'M16 5a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm0 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-7v7m0 8v7M5 16h7m8 0h7';
  else if (/pipe|tube/.test(id))
    path =
      'M7 9c0-5 18-5 18 0v14c0 5-18 5-18 0ZM7 9c0 5 18 5 18 0M7 23c0 5 18 5 18 0';
  const initials = name
    .replace(/^Desc_|_C$/g, '')
    .split(/[\s_-]+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className="resource-icon"
      data-resource-icon={itemId}
      role="img"
      aria-label={name}
    >
      <title>{name}</title>
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="5"
        fill="#1b2228"
        stroke={resourceColor(itemId)}
        strokeWidth="1.5"
      />
      {path ? (
        <path
          d={path}
          fill="none"
          stroke={resourceColor(itemId)}
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : (
        <text
          x="16"
          y="21"
          textAnchor="middle"
          fontFamily="system-ui, sans-serif"
          fontSize="11"
          fontWeight="700"
          fill={resourceColor(itemId)}
        >
          {initials}
        </text>
      )}
    </svg>
  );
}
