import type { Unit } from '../types/index.js';

/** One fluid ounce (US) in millilitres — the single source of truth. */
const ML_PER_OZ = 29.5735;

// Matches "60ml", "60 ml", "30ML", "1.5oz", "1.5 oz" etc.
const AMOUNT_REGEX = /^([\d.]+)\s*(ml|oz)$/i;

interface ParsedAmount {
  value: number;
  unit: Unit;
}

function parse(amount: string): ParsedAmount | null {
  const match = AMOUNT_REGEX.exec(amount.trim());
  if (!match) return null;

  const value = parseFloat(match[1] as string);
  if (Number.isNaN(value)) return null;

  return { value, unit: (match[2] as string).toLowerCase() as Unit };
}

function format(value: number): string {
  // Up to 1 decimal place, trimming trailing zeros.
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

/**
 * Converts and formats an amount string to the target unit.
 * Non-convertible amounts (e.g. "2 dashes", "top up", "10 leaves") are returned unchanged.
 * Returns undefined when input is undefined.
 */
export function formatAmount(amount: string | undefined, targetUnit: Unit): string | undefined {
  if (!amount) return amount;

  const parsed = parse(amount);
  if (!parsed) return amount; // not a convertible volume — leave unchanged
  if (parsed.unit === targetUnit) return amount; // already in target unit

  const converted = parsed.unit === 'ml' ? parsed.value / ML_PER_OZ : parsed.value * ML_PER_OZ;

  return `${format(converted)} ${targetUnit}`;
}
