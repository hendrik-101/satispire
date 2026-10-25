/** Reference raster only; machine symbols do not claim physical scale. */
export function FoundationGrid({
  id,
  x,
  y,
  width,
  height,
  pixelsPerUnit,
}: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelsPerUnit: number;
}) {
  const subdivisionVisible = pixelsPerUnit * 0.5 >= 6;
  const meterVisible = pixelsPerUnit >= 6;
  const steps = [
    ...(subdivisionVisible
      ? [{ step: 0.5, stroke: '#30383e', opacity: 0.55 }]
      : []),
    ...(meterVisible ? [{ step: 1, stroke: '#39434c', opacity: 0.65 }] : []),
    { step: 8, stroke: '#52606b', opacity: 0.8 },
  ];
  return (
    <g data-foundation-grid="true" pointerEvents="none" aria-hidden="true">
      <defs>
        {steps.map(({ step, stroke, opacity }) => (
          <pattern
            key={step}
            id={`${id}-grid-${step}`}
            data-grid-step={step}
            patternUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={step}
            height={step}
          >
            <path
              d={`M ${step} 0 H 0 V ${step}`}
              fill="none"
              stroke={stroke}
              strokeOpacity={opacity}
              strokeWidth={step === 8 ? 1 : 0.65}
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
        ))}
      </defs>
      <rect x={x} y={y} width={width} height={height} fill="#1b2126" />
      {steps.map(({ step }) => (
        <rect
          key={step}
          x={x}
          y={y}
          width={width}
          height={height}
          fill={`url(#${id}-grid-${step})`}
        />
      ))}
    </g>
  );
}
