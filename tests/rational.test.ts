import { describe, expect, it } from 'vitest';
import { Rational } from '../src/domain/rational';

describe('exact rational arithmetic', () => {
  it('normalizes integers, decimals and fractions without floating point artifacts', () => {
    expect(Rational.parse('0.1').add(Rational.parse('0.2')).toString()).toBe(
      '3/10',
    );
    expect(Rational.parse('12/18').toString()).toBe('2/3');
    expect(Rational.parse('-0.125').toString()).toBe('-1/8');
    expect(Rational.parse('0002.00').toString()).toBe('2');
  });
  it('supports exact arithmetic, comparison and ceiling', () => {
    const a = Rational.parse('5/3');
    expect(a.subtract(Rational.parse('2/3')).toString()).toBe('1');
    expect(a.multiply(Rational.parse('3/2')).toString()).toBe('5/2');
    expect(a.divide(Rational.parse('10')).toString()).toBe('1/6');
    expect(a.compare(Rational.parse('2'))).toBe(-1);
    expect(a.ceil()).toBe(2n);
    expect(Rational.parse('-5/3').ceil()).toBe(-1n);
  });
  it.each(['', ' 1 ', '1e3', 'NaN', '1//2', '1/0', '1/-2', '.2', '1.', '+1'])(
    'rejects malformed number %j',
    (value) => {
      expect(() => Rational.parse(value)).toThrow(/rational|zero/i);
    },
  );
  it('rejects division by zero and excessive numeric inputs', () => {
    expect(() => Rational.parse('1').divide(Rational.parse('0'))).toThrow(
      /zero/i,
    );
    expect(() => Rational.parse('9'.repeat(61))).toThrow(/limit|bound/i);
    expect(() => Rational.parse('0.' + '0'.repeat(60) + '1')).toThrow(
      /limit|bound/i,
    );
    expect(() => Rational.parse(4 as unknown as string)).toThrow(/string/i);
  });
});
