

/**
 * Result type that represents either a successful value or an error.
 * This implements the Result/Either pattern commonly used in functional programming.
 * 
 * @template T - The type of the value when the Result is Ok
 * @template E - The type of the error when the Result is Err
 * 
 * @remarks
 * The Result type is a discriminated union that forces explicit error handling.
 * Instead of throwing exceptions or returning null, functions can return a Result
 * that clearly indicates success or failure.
 * 
 * @example
 * ```typescript
 * // Function that returns a Result
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return err("Division by zero");
 *   }
 *   return ok(a / b);
 * }
 * 
 * // Using the Result
 * const result = divide(10, 2);
 * if (result.isOk) {
 *   console.log("Result:", result.value); // Result: 5
 * } else {
 *   console.log("Error:", result.error);
 * }
 * ```
 * 
 * @example
 * ```typescript
 * // Type-safe pattern matching
 * function processResult(result: Result<number, string>): void {
 *   switch (true) {
 *     case result.isOk:
 *       console.log("Success with value:", result.value);
 *       break;
 *     case result.isErr:
 *       console.log("Failed with error:", result.error);
 *       break;
 *   }
 * }
 * ```
 */
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