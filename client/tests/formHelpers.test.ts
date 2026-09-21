/**
 * The state transitions and pure logic pulled out of the components. These were
 * previously closures inside AddRecipeModal, RecipeTabs and
 * ClassifyIngredientsModal, and could only be reached by rendering.
 */
import { describe, it, expect } from 'vitest';
import {
  emptyForm,
  unknownIngredientNames,
  validate,
  withField,
  withIngredientAdded,
  withIngredientField,
  withIngredientRemoved,
  withTagToggled,
} from '../src/features/Recipes/components/recipeForm.js';
import {
  toClassifyResults,
  undecidedNames,
} from '../src/features/Recipes/components/classifyForm.js';
import { nextIndexForArrowKey } from '../src/features/Recipes/utils/keyboard.js';

describe('form state transitions', () => {
  it('withField_replacesOneField_withoutMutating', () => {
    const before = emptyForm(false);

    const after = withField(before, 'name', 'Negroni');

    expect(after.name).toBe('Negroni');
    expect(before.name).toBe('');
  });

  it('withIngredientField_updatesOnlyTheTargetRow', () => {
    const form = withIngredientAdded(emptyForm(false));

    const after = withIngredientField(form, 1, 'name', 'gin');

    expect(after.ingredients[0]?.name).toBe('');
    expect(after.ingredients[1]?.name).toBe('gin');
  });

  it('withIngredientAdded_appendsARowWithAFreshKey', () => {
    const after = withIngredientAdded(emptyForm(false));

    expect(after.ingredients).toHaveLength(2);
    expect(after.ingredients[0]?.key).not.toBe(after.ingredients[1]?.key);
  });

  it('withIngredientRemoved_dropsOnlyThatRow', () => {
    let form = withIngredientAdded(emptyForm(false));
    form = withIngredientField(form, 0, 'name', 'keep');
    form = withIngredientField(form, 1, 'name', 'drop');

    const after = withIngredientRemoved(form, 1);

    expect(after.ingredients.map((r) => r.name)).toEqual(['keep']);
  });

  it('withTagToggled_addsThenRemoves', () => {
    const on = withTagToggled(emptyForm(false), 'classic');
    const off = withTagToggled(on, 'classic');

    expect(on.tags).toEqual(['classic']);
    expect(off.tags).toEqual([]);
  });
});

describe('validate', () => {
  it('rejects_anEmptyName', () => {
    const form = withIngredientField(emptyForm(false), 0, 'name', 'gin');

    expect(validate(form)).toMatch(/required/);
  });

  it('rejects_whenNoIngredientIsFilledIn', () => {
    expect(validate(withField(emptyForm(false), 'name', 'Negroni'))).toMatch(/required/);
  });

  it('acceptsAName_andOneIngredient', () => {
    let form = withField(emptyForm(false), 'name', 'Negroni');
    form = withIngredientField(form, 0, 'name', 'gin');

    expect(validate(form)).toBeNull();
  });

  it('treats_whitespaceOnlyName_asEmpty', () => {
    let form = withField(emptyForm(false), 'name', '   ');
    form = withIngredientField(form, 0, 'name', 'gin');

    expect(validate(form)).toMatch(/required/);
  });
});

describe('unknownIngredientNames', () => {
  const known = [{ name: 'gin' }, { name: 'Campari' }];

  it('returns_onlyNamesTheCatalogueHasNotSeen', () => {
    const rows = [{ key: 'a', name: 'gin', amount: '', unit: 'ml' as const }];
    const extra = [...rows, { key: 'b', name: 'orange bitters', amount: '', unit: 'ml' as const }];

    expect(unknownIngredientNames(extra, known)).toEqual(['orange bitters']);
  });

  it('matchesKnownNames_caseInsensitively', () => {
    const rows = [{ key: 'a', name: 'CAMPARI', amount: '', unit: 'ml' as const }];

    expect(unknownIngredientNames(rows, known)).toEqual([]);
  });

  it('deduplicates_repeatedNewNames', () => {
    const rows = [
      { key: 'a', name: 'mezcal', amount: '', unit: 'ml' as const },
      { key: 'b', name: 'mezcal', amount: '', unit: 'ml' as const },
    ];

    expect(unknownIngredientNames(rows, known)).toEqual(['mezcal']);
  });
});

describe('classification form', () => {
  it('undecidedNames_listsWhatIsStillUnanswered', () => {
    expect(undecidedNames(['a', 'b'], { a: true })).toEqual(['b']);
  });

  it('toClassifyResults_keepsThePresentedOrder', () => {
    expect(toClassifyResults(['a', 'b'], { a: false, b: true })).toEqual([
      { name: 'a', isAlcoholic: false },
      { name: 'b', isAlcoholic: true },
    ]);
  });

  it('toClassifyResults_treatsAnUnansweredNameAsNonAlcoholic', () => {
    expect(toClassifyResults(['a'], {})).toEqual([{ name: 'a', isAlcoholic: false }]);
  });
});

describe('nextIndexForArrowKey', () => {
  it('movesForward_onArrowRight', () => {
    expect(nextIndexForArrowKey('ArrowRight', 0, 2)).toBe(1);
  });

  it('wrapsToTheStart_pastTheEnd', () => {
    expect(nextIndexForArrowKey('ArrowRight', 1, 2)).toBe(0);
  });

  it('wrapsToTheEnd_beforeTheStart', () => {
    expect(nextIndexForArrowKey('ArrowLeft', 0, 2)).toBe(1);
  });

  it('returnsNull_forUnrelatedKeys', () => {
    expect(nextIndexForArrowKey('Enter', 0, 2)).toBeNull();
  });

  it('returnsNull_whenThereAreNoItems', () => {
    expect(nextIndexForArrowKey('ArrowRight', 0, 0)).toBeNull();
  });
});
