import { db } from './connection.js';
import { resyncSequences } from './ids.js';

// ---------------------------------------------------------------------------
// Seed data — the classics the app ships with.
// ---------------------------------------------------------------------------

interface SeedRecipe {
  id: string;
  name: string;
  ingredients: { name: string; amount?: string }[];
  instructions?: string;
  glassType?: string;
  tags?: string[];
  rating?: number;
  isMocktail: boolean;
}

interface SeedIngredient {
  name: string;
  isAlcoholic: boolean;
}

const SEED_RECIPES: SeedRecipe[] = [
  {
    id: '1',
    name: 'Mojito',
    ingredients: [
      { name: 'white rum', amount: '60ml' },
      { name: 'fresh lime juice', amount: '30ml' },
      { name: 'sugar syrup', amount: '15ml' },
      { name: 'fresh mint', amount: '10 leaves' },
      { name: 'soda water', amount: 'top up' },
    ],
    instructions:
      'Muddle mint with lime juice and sugar syrup. Add rum, fill with ice, top with soda.',
    glassType: 'highball',
    tags: ['refreshing', 'rum', 'summery'],
    isMocktail: false,
    rating: 4,
  },
  {
    id: '2',
    name: 'Negroni',
    ingredients: [
      { name: 'gin', amount: '30ml' },
      { name: 'sweet vermouth', amount: '30ml' },
      { name: 'Campari', amount: '30ml' },
    ],
    instructions: 'Stir over ice. Strain into a rocks glass. Garnish with orange peel.',
    glassType: 'rocks',
    tags: ['bitter', 'classic', 'gin'],
    isMocktail: false,
    rating: 5,
  },
  {
    id: '3',
    name: 'Daiquiri',
    ingredients: [
      { name: 'white rum', amount: '60ml' },
      { name: 'fresh lime juice', amount: '30ml' },
      { name: 'sugar syrup', amount: '15ml' },
    ],
    instructions: 'Shake all ingredients with ice. Strain into a chilled coupe.',
    glassType: 'coupe',
    tags: ['sour', 'rum', 'classic'],
    isMocktail: false,
    rating: 5,
  },
  {
    id: '4',
    name: 'Whiskey Sour',
    ingredients: [
      { name: 'bourbon', amount: '60ml' },
      { name: 'fresh lemon juice', amount: '30ml' },
      { name: 'sugar syrup', amount: '15ml' },
      { name: 'egg white', amount: '1' },
    ],
    instructions:
      'Dry shake, then shake with ice. Strain into a rocks glass over a large ice cube.',
    glassType: 'rocks',
    tags: ['sour', 'whiskey', 'classic'],
    isMocktail: false,
    rating: 4,
  },
  {
    id: '5',
    name: 'Espresso Martini',
    ingredients: [
      { name: 'vodka', amount: '50ml' },
      { name: 'espresso', amount: '30ml' },
      { name: 'coffee liqueur', amount: '20ml' },
      { name: 'sugar syrup', amount: '5ml' },
    ],
    instructions:
      'Shake all ingredients hard with ice. Double-strain into a chilled martini glass.',
    glassType: 'martini',
    tags: ['coffee', 'vodka', 'after dinner'],
    isMocktail: false,
  },
  {
    id: '6',
    name: 'Aperol Spritz',
    ingredients: [
      { name: 'Aperol', amount: '60ml' },
      { name: 'prosecco', amount: '90ml' },
      { name: 'soda water', amount: '30ml' },
    ],
    instructions: 'Build in a wine glass over ice. Garnish with an orange slice.',
    glassType: 'wine',
    tags: ['spritz', 'light', 'summery'],
    isMocktail: false,
    rating: 3,
  },
  {
    id: '7',
    name: 'Margarita',
    ingredients: [
      { name: 'tequila', amount: '60ml' },
      { name: 'fresh lime juice', amount: '30ml' },
      { name: 'triple sec', amount: '20ml' },
    ],
    instructions: 'Shake with ice. Strain into a salt-rimmed glass.',
    glassType: 'coupe',
    tags: ['sour', 'tequila', 'classic'],
    isMocktail: false,
    rating: 4,
  },
  {
    id: '8',
    name: 'Dark & Stormy',
    ingredients: [
      { name: 'dark rum', amount: '60ml' },
      { name: 'ginger beer', amount: 'top up' },
      { name: 'fresh lime juice', amount: '15ml' },
    ],
    glassType: 'highball',
    tags: ['rum', 'refreshing', 'easy'],
    isMocktail: false,
  },
];

const SEED_INGREDIENTS: SeedIngredient[] = [
  { name: 'white rum', isAlcoholic: true },
  { name: 'gin', isAlcoholic: true },
  { name: 'sweet vermouth', isAlcoholic: true },
  { name: 'Campari', isAlcoholic: true },
  { name: 'bourbon', isAlcoholic: true },
  { name: 'vodka', isAlcoholic: true },
  { name: 'coffee liqueur', isAlcoholic: true },
  { name: 'Aperol', isAlcoholic: true },
  { name: 'prosecco', isAlcoholic: true },
  { name: 'tequila', isAlcoholic: true },
  { name: 'triple sec', isAlcoholic: true },
  { name: 'dark rum', isAlcoholic: true },
  { name: 'fresh lime juice', isAlcoholic: false },
  { name: 'sugar syrup', isAlcoholic: false },
  { name: 'fresh mint', isAlcoholic: false },
  { name: 'soda water', isAlcoholic: false },
  { name: 'fresh lemon juice', isAlcoholic: false },
  { name: 'egg white', isAlcoholic: false },
  { name: 'espresso', isAlcoholic: false },
  { name: 'ginger beer', isAlcoholic: false },
];

// ---------------------------------------------------------------------------

function runSeed(): void {
  const insertRecipe = db.prepare<
    [string, string, string | null, string | null, string | null, number | null, number]
  >(`
    INSERT INTO recipes (id, name, instructions, glass_type, tags, rating, is_mocktail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertIngredient = db.prepare<[string, number, string, string | null]>(`
    INSERT INTO recipe_ingredients (recipe_id, position, name, amount)
    VALUES (?, ?, ?, ?)
  `);
  const insertMeta = db.prepare<[string, string, number]>(`
    INSERT INTO ingredient_meta (key, name, is_alcoholic)
    VALUES (?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    for (const r of SEED_RECIPES) {
      insertRecipe.run(
        r.id,
        r.name,
        r.instructions ?? null,
        r.glassType ?? null,
        r.tags ? JSON.stringify(r.tags) : null,
        r.rating ?? null,
        r.isMocktail ? 1 : 0,
      );
      r.ingredients.forEach((ing, idx) => {
        insertIngredient.run(r.id, idx, ing.name, ing.amount ?? null);
      });
    }
    for (const m of SEED_INGREDIENTS) {
      insertMeta.run(m.name.toLowerCase(), m.name, m.isAlcoholic ? 1 : 0);
    }
  });

  seedAll();
  resyncSequences();
}

/** Seed only when the recipes table is empty (fresh database). */
export function seedIfEmpty(): void {
  const { cnt } = db.prepare('SELECT COUNT(*) as cnt FROM recipes').get() as { cnt: number };
  if (cnt === 0) {
    runSeed();
  } else {
    resyncSequences();
  }
}

/** Truncate everything and re-seed. Used by tests via `store.reset()`. */
export function resetDb(): void {
  db.exec(`
    DELETE FROM collection_recipes;
    DELETE FROM collections;
    DELETE FROM recipe_ingredients;
    DELETE FROM recipes;
    DELETE FROM ingredient_meta;
    DELETE FROM id_sequence;
  `);
  runSeed();
}
