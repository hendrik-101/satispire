import {
  defaultBuildVariant,
  type BuildVariant,
  type BuildSide,
} from '../../src/domain/build-variants.js';
const sides: { value: BuildSide; label: string }[] = [
  { value: 'west', label: 'Links' },
  { value: 'east', label: 'Rechts' },
  { value: 'north', label: 'Oben' },
  { value: 'south', label: 'Unten' },
];
const presets = [
  {
    id: 'alternating',
    label: 'Links → rechts · nach Materialfluss',
    inputSide: 'west',
    outputSide: 'east',
    pattern: 'alternating',
  },
  {
    id: 'west-west',
    label: 'Ein-/Ausgang links',
    inputSide: 'west',
    outputSide: 'west',
    pattern: 'fixed',
  },
  {
    id: 'east-east',
    label: 'Ein-/Ausgang rechts',
    inputSide: 'east',
    outputSide: 'east',
    pattern: 'fixed',
  },
  {
    id: 'north-south',
    label: 'Oben → unten · nach Materialfluss',
    inputSide: 'north',
    outputSide: 'south',
    pattern: 'alternating',
  },
  {
    id: 'east-west',
    label: 'Rechts → links · nach Materialfluss',
    inputSide: 'east',
    outputSide: 'west',
    pattern: 'alternating',
  },
] as const;
export function VariantControl({
  variant,
  itemId,
  inputSide,
  outputSide,
  onChange,
}: {
  variant: BuildVariant;
  itemId: string;
  inputSide: BuildSide;
  outputSide: BuildSide;
  onChange: (variant: BuildVariant) => void;
}) {
  const override = variant.overrides.find((o) => o.itemId === itemId);
  const update = (key: 'inputSide' | 'outputSide', value: BuildSide) => {
    if (override)
      onChange({
        ...variant,
        overrides: variant.overrides.map((o) =>
          o.itemId === itemId ? { ...o, [key]: value } : o,
        ),
      });
    else onChange({ ...variant, [key]: value });
  };
  const preset =
    presets.find(
      (p) =>
        p.inputSide === variant.inputSide &&
        p.outputSide === variant.outputSide &&
        p.pattern === variant.pattern,
    )?.id ?? 'custom';
  return (
    <details className="variant-control">
      <summary>
        Bauvariante{' '}
        <span aria-hidden="true">
          {sides.find((s) => s.value === inputSide)!.label} →{' '}
          {sides.find((s) => s.value === outputSide)!.label}
        </span>
      </summary>
      <div className="variant-popover">
        <label>
          Bauvariante
          <select
            aria-label="Bauvariante"
            value={preset}
            onChange={(e) => {
              const p = presets.find((p) => p.id === e.target.value);
              if (p)
                onChange({
                  ...defaultBuildVariant,
                  inputSide: p.inputSide,
                  outputSide: p.outputSide,
                  pattern: p.pattern,
                  overrides: variant.overrides,
                });
            }}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom" disabled>
              Eigene Seiten
            </option>
          </select>
        </label>
        <label className="variant-checkbox">
          <input
            type="checkbox"
            aria-label="Nur diese Etage"
            checked={!!override}
            onChange={(e) =>
              onChange({
                ...variant,
                overrides: e.target.checked
                  ? [...variant.overrides, { itemId, inputSide, outputSide }]
                  : variant.overrides.filter((o) => o.itemId !== itemId),
              })
            }
          />
          Nur diese Etage
        </label>
        {(['inputSide', 'outputSide'] as const).map((key) => (
          <label key={key}>
            {`${override ? '' : 'Standard-'}${key === 'inputSide' ? 'Eingangsseite' : 'Ausgangsseite'}`}
            <select
              aria-label={`${override ? '' : 'Standard-'}${key === 'inputSide' ? 'Eingangsseite' : 'Ausgangsseite'}`}
              value={
                override
                  ? key === 'inputSide'
                    ? inputSide
                    : outputSide
                  : variant[key]
              }
              onChange={(e) => update(key, e.target.value as BuildSide)}
            >
              {sides.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Etagenrichtung
          <select
            aria-label="Etagenrichtung"
            value={variant.pattern}
            onChange={(e) =>
              onChange({
                ...variant,
                pattern: e.target.value as BuildVariant['pattern'],
              })
            }
          >
            <option value="alternating">Nach Materialfluss</option>
            <option value="fixed">Gleichbleibend</option>
          </select>
        </label>
      </div>
    </details>
  );
}
