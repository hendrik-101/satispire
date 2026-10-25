import { expect, test } from 'vitest';
import {
  formatPercent,
  formatRate,
  formatRateInput,
} from '../web/workspace/format-rate.js';

test.each([
  ['33/2', '16,5'],
  ['105/2', '52,5'],
  ['5/16', '0,3125'],
  ['20', '20'],
  ['-33/2', '-16,5'],
  ['1/1000000', '0,000001'],
])('displays the exact terminating decimal for %s', (value, expected) => {
  expect(formatRate(value)).toBe(expected);
  expect(formatRateInput(value)).toBe(expected);
});

test.each([
  ['1/3', '≈ 0,333'],
  ['2/3', '≈ 0,667'],
  ['5999/6000', '≈ 1'],
  ['1/3000000', '< 0,001'],
  ['-1/3000000', '> -0,001'],
])(
  'marks a rounded display of %s and keeps its editable value exact',
  (value, expected) => {
    expect(formatRate(value)).toBe(expected);
    expect(formatRateInput(value)).toBe(value);
  },
);

test.each(['7,', '7,5', '', '1/', 'invalid', '0.3125'])(
  'does not rewrite a draft while the user types %s',
  (value) => {
    expect(formatRateInput(value)).toBe(value);
  },
);

test('formats large exact numbers without Number overflow or precision loss', () => {
  expect(formatRate('9007199254740993')).toBe('9007199254740993');
  expect(formatRate('18014398509481987/2')).toBe('9007199254740993,5');
});

test('shows the uniform machine clock as a percentage', () => {
  expect(formatPercent('7/8')).toBe('87,5 %');
  expect(formatPercent('1')).toBe('100 %');
});
