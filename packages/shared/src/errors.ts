/**
 * The error shape every endpoint returns on failure. Declared here so the
 * client can rely on it without duplicating the contract.
 */
export interface FieldError {
  /** Dot-path to the offending field, e.g. `ingredients.0.name`. */
  path: string;
  message: string;
}

export interface ApiErrorBody {
  status: number;
  message: string;
  errors?: FieldError[];
}
