import type { Ingredient, Recipe, RecipeUpdatePayload, Unit } from '../types/index.js';

export interface IngredientRow {
  /** Stable across re-orders and removals, so React keys stay correct. */
  key: string;
  name: string;
  amount: string; // raw number, e.g. "30"
  unit: Unit;
}

export interface FormState {
  name: string;
  ingredients: IngredientRow[];
  instructions: string;
  glassType: string;
  tags: string[];
  isMocktail: boolean;
}

export const GLASS_TYPES = [
  'champagne flute',
  'collins',
  'copper mug',
  'coupe',
  'highball',
  'hurricane',
  'martini',
  'rocks',
  'shot',
  'wine',
] as const;

export const KNOWN_TAGS = [
  'after dinner',
  'bitter',
  'classic',
  'coffee',
  'easy',
  'gin',
  'IBA',
  'light',
  'refreshing',
  'rum',
  'sour',
  'spritz',
  'summery',
  'sweet',
  'tequila',
  'vodka',
  'whiskey',
] as const;

const AMOUNT_WITH_UNIT = /^([\d.]+)\s*(ml|oz)$/i;

let rowCounter = 0;
export function newRow(): IngredientRow {
  rowCounter += 1;
  return { key: `row-${rowCounter}`, name: '', amount: '', unit: 'ml' };
}

function rowFromIngredient(ingredient: Ingredient): IngredientRow {
  const match = AMOUNT_WITH_UNIT.exec(ingredient.amount ?? '');
  const base = newRow();

  if (match) {
    return {
      ...base,
      name: ingredient.name,
      amount: match[1] ?? '',
      unit: (match[2] ?? 'ml').toLowerCase() as Unit,
    };
  }

  return { ...base, name: ingredient.name, amount: ingredient.amount ?? '' };
}

export function emptyForm(isMocktail: boolean): FormState {
  return {
    name: '',
    ingredients: [newRow()],
    instructions: '',
    glassType: '',
    tags: [],
    isMocktail,
  };
}

export function formFromRecipe(recipe: Recipe): FormState {
  return {
    name: recipe.name,
    ingredients: recipe.ingredients.map(rowFromIngredient),
    instructions: recipe.instructions ?? '',
    glassType: recipe.glassType ?? '',
    tags: recipe.tags ?? [],
    isMocktail: recipe.isMocktail,
  };
}

export function filledRows(form: FormState): IngredientRow[] {
  return form.ingredients.filter((row) => row.name.trim());
}

function toIngredients(rows: IngredientRow[]): Ingredient[] {
  return rows.map((row) => {
    const amount = row.amount.trim();
    return {
      name: row.name.trim(),
      ...(amount ? { amount: `${amount}${row.unit}` } : {}),
    };
  });
}

/** Create payloads omit empty optional fields — there is nothing to clear yet. */
export function toCreatePayload(form: FormState) {
  const instructions = form.instructions.trim();
  const glassType = form.glassType.trim();

  return {
    name: form.name.trim(),
    ingredients: toIngredients(filledRows(form)),
    ...(instructions ? { instructions } : {}),
    ...(glassType ? { glassType } : {}),
    ...(form.tags.length > 0 ? { tags: form.tags } : {}),
    isMocktail: form.isMocktail,
  };
}

/**
 * Update payloads send `null` for emptied fields rather than omitting them.
 * Omitting is how "leave unchanged" is expressed, so an omitted empty field
 * would silently keep the old value and the user's deletion would be lost.
 */
export function toUpdatePayload(form: FormState): RecipeUpdatePayload {
  const instructions = form.instructions.trim();
  const glassType = form.glassType.trim();

  return {
    name: form.name.trim(),
    ingredients: toIngredients(filledRows(form)),
    instructions: instructions ? instructions : null,
    glassType: glassType ? glassType : null,
    tags: form.tags.length > 0 ? form.tags : null,
    isMocktail: form.isMocktail,
  };
}
