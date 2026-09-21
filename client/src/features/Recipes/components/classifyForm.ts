export interface ClassifyResult {
  name: string;
  isAlcoholic: boolean;
}

/** Names still awaiting an answer. The form cannot be submitted until empty. */
export function undecidedNames(
  names: string[],
  choices: Record<string, boolean | undefined>,
): string[] {
  return names.filter((name) => choices[name] === undefined);
}

/**
 * Flattens the choice map into the payload the API expects, in the order the
 * names were presented.
 */
export function toClassifyResults(
  names: string[],
  choices: Record<string, boolean | undefined>,
): ClassifyResult[] {
  return names.map((name) => ({ name, isAlcoholic: choices[name] === true }));
}
