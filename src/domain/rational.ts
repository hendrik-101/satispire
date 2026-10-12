const MAX_INPUT_DIGITS = 60;
const MAX_RESULT_BITS = 4096;

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Immutable exact fraction. Bigints never cross a JSON boundary. */
export class Rational {
  /** Reads normalized exact values under the arithmetic bound, never the raw-input digit bound. */
  static parseCanonical(value: string): Rational {
    if (typeof value !== 'string')
      throw new Error('Canonical rational input must be a string');
    if (value.length > 2470)
      throw new Error(
        `Canonical rational exceeds the ${MAX_RESULT_BITS}-bit result bound`,
      );
    if (!/^(?:0|-?[1-9]\d*)(?:\/[1-9]\d*)?$/.test(value))
      throw new Error('Invalid canonical rational number');
    const [numerator, denominator = '1'] = value.split('/');
    const result = Rational.fromBigInts(
      BigInt(numerator!),
      BigInt(denominator),
    );
    if (result.toString() !== value)
      throw new Error('Invalid canonical rational: value must be normalized');
    return result;
  }

  /** Constructs a bounded rational from computed bigint components. */
  static fromBigInts(numerator: bigint, denominator = 1n): Rational {
    if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint')
      throw new Error('Rational components must be bigints');
    const magnitude = (value: bigint): bigint => (value < 0n ? -value : value);
    if (
      magnitude(numerator).toString(2).length > MAX_RESULT_BITS ||
      magnitude(denominator).toString(2).length > MAX_RESULT_BITS
    )
      throw new Error(
        `Rational components exceed the ${MAX_RESULT_BITS}-bit result bound`,
      );
    return new Rational(numerator, denominator);
  }
  private readonly numerator: bigint;
  private readonly denominator: bigint;

  private constructor(numerator: bigint, denominator: bigint) {
    if (denominator === 0n) throw new Error('Rational division by zero');
    const divisor = gcd(numerator, denominator);
    const sign = denominator < 0n ? -1n : 1n;
    this.numerator = (numerator / divisor) * sign;
    this.denominator = (denominator / divisor) * sign;
    if (
      this.numerator.toString(2).length > MAX_RESULT_BITS ||
      this.denominator.toString(2).length > MAX_RESULT_BITS
    )
      throw new Error(
        `Rational arithmetic exceeds the ${MAX_RESULT_BITS}-bit result bound`,
      );
  }

  static parse(value: string): Rational {
    if (typeof value !== 'string')
      throw new Error('Rational input must be a string');
    if (
      value.length > 123 ||
      value.replace(/[^0-9]/g, '').length > MAX_INPUT_DIGITS
    )
      throw new Error(
        `Rational input exceeds the ${MAX_INPUT_DIGITS}-digit bound`,
      );
    if (!/^-?\d+(?:\.\d+|\/\d+)?$/.test(value))
      throw new Error(`Invalid rational number: ${JSON.stringify(value)}`);
    if (value.includes('/')) {
      const [numerator, denominator] = value.split('/') as [string, string];
      return new Rational(BigInt(numerator), BigInt(denominator));
    }
    if (value.includes('.')) {
      const [whole, fraction] = value.split('.') as [string, string];
      return new Rational(
        BigInt(whole + fraction),
        10n ** BigInt(fraction.length),
      );
    }
    return new Rational(BigInt(value), 1n);
  }

  add(other: Rational): Rational {
    return new Rational(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }
  subtract(other: Rational): Rational {
    return new Rational(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }
  multiply(other: Rational): Rational {
    return new Rational(
      this.numerator * other.numerator,
      this.denominator * other.denominator,
    );
  }
  divide(other: Rational): Rational {
    return new Rational(
      this.numerator * other.denominator,
      this.denominator * other.numerator,
    );
  }
  compare(other: Rational): number {
    const difference =
      this.numerator * other.denominator - other.numerator * this.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }
  ceil(): bigint {
    const quotient = this.numerator / this.denominator;
    return this.numerator > 0n && this.numerator % this.denominator !== 0n
      ? quotient + 1n
      : quotient;
  }
  toString(): string {
    return this.denominator === 1n
      ? this.numerator.toString()
      : `${this.numerator}/${this.denominator}`;
  }
}
