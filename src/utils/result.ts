/**
 * The base interface for all Result variants.
 * T is the type of the successful value.
 * E is the type of the error value.
 */
export type Result<T, E> = Ok<T, E> | Err<T, E>;

/**
 * Represents a successful result, holding the success value.
 */
export interface Ok<T, E> {
  readonly isOk: true;
  readonly isErr: false;
  readonly value: T;
  readonly error: undefined;
}

/**
 * Represents an error result, holding the error value.
 */
export interface Err<T, E> {
  readonly isOk: false;
  readonly isErr: true;
  readonly value: undefined;
  readonly error: E;
}

// --- Helper Functions to Construct Results ---

/**
 * Creates a successful Ok result.
 */
export function ok<T, E = unknown>(value: T): Ok<T, E> {
  return {
    isOk: true,
    isErr: false,
    value: value,
    error: undefined
  };
}

/**
 * Creates an erroneous Err result.
 */
export function err<E, T = unknown>(error: E): Err<T, E> {
  return {
    isOk: false,
    isErr: true,
    value: undefined,
    error: error
  };
}