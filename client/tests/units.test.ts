import { describe, it, expect } from 'vitest';
import { formatAmount } from '../src/features/Recipes/utils/units.js';

describe('formatAmount', () => {
  it('returns_undefined_whenInputUndefined', () => {
    expect(formatAmount(undefined, 'ml')).toBeUndefined();
  });

  it('returns_sameValue_whenAlreadyInTargetUnit_ml', () => {
    expect(formatAmount('60ml', 'ml')).toBe('60ml');
  });

  it('returns_sameValue_whenAlreadyInTargetUnit_oz', () => {
    expect(formatAmount('2oz', 'oz')).toBe('2oz');
  });

  it('converts_mlToOz', () => {
    // 60 * 0.0338 = 2.028 → rounds to 2
    expect(formatAmount('60ml', 'oz')).toBe('2 oz');
  });

  it('converts_ozToMl', () => {
    // 2 * 29.5735 = 59.147 → rounds to 59.1
    expect(formatAmount('2oz', 'ml')).toBe('59.1 ml');
  });

  it('handles_spaceInAmount', () => {
    expect(formatAmount('60 ml', 'oz')).toBe('2 oz');
  });

  it('returns_unchanged_forNonConvertible', () => {
    expect(formatAmount('2 dashes', 'oz')).toBe('2 dashes');
    expect(formatAmount('top up', 'oz')).toBe('top up');
    expect(formatAmount('10 leaves', 'ml')).toBe('10 leaves');
  });

  it('handles_decimalAmounts', () => {
    // 1.5oz→ml: 1.5 * 29.5735 = 44.36 → 44.4
    expect(formatAmount('1.5oz', 'ml')).toBe('44.4 ml');
  });
});
