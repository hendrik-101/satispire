import { Rational } from '../../src/domain/rational.js';

/** Format computed rates without converting exact values to floating point. */
function decimal(value: string) {
  const canonical = Rational.parseCanonical(value).toString();
  const [numerator, denominator = '1'] = canonical.split('/');
  const signed = BigInt(numerator!);
  const negative = signed < 0n;
  const n = negative ? -signed : signed;
  const d = BigInt(denominator);
  const whole = n / d;
  let remainder = n % d;
  let fraction = '';
  for (let i = 0; remainder && i < 6; i++) {
    remainder *= 10n;
    fraction += (remainder / d).toString();
    remainder %= d;
  }
  return {
    n,
    d,
    negative,
    exact: remainder === 0n,
    text: `${negative ? '-' : ''}${whole}${fraction ? ',' + fraction : ''}`,
  };
}

export function formatRate(value: string): string {
  const result = decimal(value);
  if (result.exact) return result.text;
  const rounded = (result.n * 2000n + result.d) / (result.d * 2n);
  if (!rounded) return result.negative ? '> -0,001' : '< 0,001';
  const fraction = (rounded % 1000n)
    .toString()
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `≈ ${result.negative ? '-' : ''}${rounded / 1000n}${fraction ? ',' + fraction : ''}`;
}

/** Editable rates must never replace an exact fraction with a rounded decimal. */
export function formatRateInput(value: string): string {
  try {
    const result = decimal(value);
    return result.exact ? result.text : value;
  } catch {
    return value;
  }
}

export function formatPercent(value: string): string {
  return `${formatRate(Rational.parseCanonical(value).multiply(Rational.parse('100')).toString())} %`;
}
