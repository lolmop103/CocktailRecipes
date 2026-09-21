---
name: react-components
description: Component conventions for this project's frontend. Use when adding a component, splitting a large one, or reviewing client/ code structure.
---

trig: component·tsx·split·helper·extract·frontend
in: client/**/\*.tsx · client/**/*.ts

# React Components

Stack: React 18 · TypeScript · Vite · React Router · TanStack Query.
No form library — form state is plain `useState` plus pure helpers.

## Declaration

Arrow const, never a `function` declaration:

```tsx
interface Props {
  recipe: Recipe;
  onRate: (id: string, rating: number) => void;
}

export const RecipeCard = ({ recipe, onRate }: Props) => ( … );
```

- Props are always a named `interface Props`, never inlined in the signature.
- Class components only where React requires one. `ErrorBoundary` is the sole
  case in this codebase — there is still no hook equivalent.

## One component per file

A helper used by exactly one parent still gets its own file. `StarRating.tsx`,
not a `const StarRating` sitting above `RecipeCard`.

A nested helper cannot be tested or reused without exporting its parent's
internals, and it hides how large the file really is. `StarRating`,
`StarRatingFilter` and `AlcoholicToggle` were extracted for exactly this reason.

## Logic belongs outside the component

A component body wires props to markup. Everything else moves out:

| Kind                                                            | Goes to                               |
| --------------------------------------------------------------- | ------------------------------------- |
| Pure state transition `(state, arg) => state`                   | sibling `*Form.ts`                    |
| Validation                                                      | sibling `*Form.ts`                    |
| Derivation — index maths, mapping, parsing                      | `utils/*.ts`                          |
| Server state                                                    | a hook in `hooks/useRecipeQueries.ts` |
| Cross-component behaviour — focus trap, keyboard nav, dismissal | `hooks/use*.ts`                       |

**The test is whether the function is pure.** If it is, it belongs outside and
gets a unit test. Event handlers that close over local state and call props stay
in the component — extracting those only threads every dependency through an
argument list, which is worse than leaving them.

Examples in this codebase:

- `recipeForm.ts` — `withField`, `withIngredientAdded`, `validate`,
  `unknownIngredientNames`. `AddRecipeModal` has no function declarations left.
- `utils/keyboard.ts` — `nextIndexForArrowKey`, the tablist's arrow arithmetic.
- `classifyForm.ts` — `undecidedNames`, `toClassifyResults`.

∅ `function` declarations inside a component body. Use
`const handleX = () => …` so handlers match the component's own style.

## Checks

- `npm run verify` — format, lint, typecheck, knip, tests with coverage
- A new pure helper without a unit test is incomplete
- `knip` fails the build on an unused export, so delete rather than park
