/**
 * Every size limit of the API contract, in one place.
 *
 * Deliberately free of zod: the client imports these as values (through the
 * `@cocktail/shared/limits` subpath), and the browser bundle must not pull in
 * the schema library.
 */

// --- Recipe list query -------------------------------------------------------
// Each ingredient term adds a correlated subquery, so the term counts bound the
// cost of the most expensive filter a visitor can send.
export const MAX_FILTER_TERMS = 20;
export const MAX_TERM_LENGTH = 60;
export const MAX_SEARCH_LENGTH = 100;
export const MAX_COLLECTION_ID_LENGTH = 12;

// --- Pagination ----------------------------------------------------------------
export const PAGE_SIZE_DEFAULT = 24;
export const PAGE_SIZE_MAX = 48;
export const MAX_OFFSET = 100_000;

// --- Write payloads --------------------------------------------------------------
export const RECIPE_NAME_MAX = 120;
export const INSTRUCTIONS_MAX = 5_000;
export const GLASS_TYPE_MAX = 40;
export const TAGS_MAX = 20;
export const TAG_LENGTH_MAX = 30;
export const INGREDIENTS_MAX = 40;
export const INGREDIENT_NAME_MAX = 60;
export const AMOUNT_MAX = 30;
export const COLLECTION_NAME_MAX = 60;
