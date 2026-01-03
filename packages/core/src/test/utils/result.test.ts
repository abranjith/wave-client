import { describe, it, expect } from 'vitest';
import { ok, err, Ok, Err, type Result } from '../../utils/result';

describe('result', () => {
  describe('ok / Ok', () => {
    it('should create a successful Ok result', () => {
      const result = ok(42);

      expect(result.isOk).toBe(true);
      expect(result.isErr).toBe(false);
      expect(result.value).toBe(42);
      expect(result.error).toBeUndefined();
    });

    it('should work with capitalized Ok alias', () => {
      const result = Ok('success');

      expect(result.isOk).toBe(true);
      expect(result.value).toBe('success');
    });

    it('should handle null and undefined values', () => {
      const nullResult = ok(null);
      const undefinedResult = ok(undefined);

      expect(nullResult.isOk).toBe(true);
      expect(nullResult.value).toBeNull();
      expect(undefinedResult.isOk).toBe(true);
      expect(undefinedResult.value).toBeUndefined();
    });

    it('should handle complex object values', () => {
      const obj = { name: 'test', count: 5, nested: { value: true } };
      const result = ok(obj);

      expect(result.isOk).toBe(true);
      expect(result.value).toEqual(obj);
      expect(result.value.nested.value).toBe(true);
    });

    it('should handle array values', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = ok(arr);

      expect(result.isOk).toBe(true);
      expect(result.value).toEqual(arr);
      expect(result.value.length).toBe(5);
    });
  });

  describe('err / Err', () => {
    it('should create an error Err result', () => {
      const result = err('Something went wrong');

      expect(result.isOk).toBe(false);
      expect(result.isErr).toBe(true);
      expect(result.error).toBe('Something went wrong');
      expect(result.value).toBeUndefined();
    });

    it('should work with capitalized Err alias', () => {
      const result = Err('failure');

      expect(result.isErr).toBe(true);
      expect(result.error).toBe('failure');
    });

    it('should handle error objects', () => {
      const error = new Error('Test error');
      const result = err(error);

      expect(result.isErr).toBe(true);
      expect(result.error).toBe(error);
      expect(result.error.message).toBe('Test error');
    });

    it('should handle complex error types', () => {
      const customError = { code: 404, message: 'Not found', details: { path: '/api/users' } };
      const result = err(customError);

      expect(result.isErr).toBe(true);
      expect(result.error).toEqual(customError);
      expect(result.error.code).toBe(404);
    });
  });

  describe('Result type discrimination', () => {
    it('should allow type-safe pattern matching on Ok', () => {
      const result: Result<number, string> = ok(100);

      if (result.isOk) {
        // TypeScript should know result.value is number
        expect(typeof result.value).toBe('number');
        expect(result.value).toBe(100);
      } else {
        // This branch should not be reached
        expect.fail('Should be Ok result');
      }
    });

    it('should allow type-safe pattern matching on Err', () => {
      const result: Result<number, string> = err('error message');

      if (result.isErr) {
        // TypeScript should know result.error is string
        expect(typeof result.error).toBe('string');
        expect(result.error).toBe('error message');
      } else {
        // This branch should not be reached
        expect.fail('Should be Err result');
      }
    });

    it('should work with if-else pattern matching', () => {
      const okResult: Result<string, number> = ok('success');
      const errResult: Result<string, number> = err(404);

      let okProcessed = false;
      let errProcessed = false;

      if (okResult.isOk) {
        okProcessed = true;
        expect(okResult.value).toBe('success');
      } else {
        expect.fail('Should not be error');
      }

      if (errResult.isErr) {
        errProcessed = true;
        expect(errResult.error).toBe(404);
      } else {
        expect.fail('Should not be ok');
      }

      expect(okProcessed).toBe(true);
      expect(errProcessed).toBe(true);
    });
  });

  describe('real-world usage patterns', () => {
    it('should handle division operation with error handling', () => {
      function divide(a: number, b: number): Result<number, string> {
        if (b === 0) {
          return err('Division by zero');
        }
        return ok(a / b);
      }

      const success = divide(10, 2);
      expect(success.isOk).toBe(true);
      if (success.isOk) {
        expect(success.value).toBe(5);
      }

      const failure = divide(10, 0);
      expect(failure.isErr).toBe(true);
      if (failure.isErr) {
        expect(failure.error).toBe('Division by zero');
      }
    });

    it('should handle async operations', async () => {
      async function fetchUser(id: number): Promise<Result<{ id: number; name: string }, string>> {
        if (id <= 0) {
          return err('Invalid user ID');
        }
        return ok({ id, name: `User ${id}` });
      }

      const validUser = await fetchUser(5);
      expect(validUser.isOk).toBe(true);
      if (validUser.isOk) {
        expect(validUser.value.name).toBe('User 5');
      }

      const invalidUser = await fetchUser(-1);
      expect(invalidUser.isErr).toBe(true);
      if (invalidUser.isErr) {
        expect(invalidUser.error).toBe('Invalid user ID');
      }
    });

    it('should handle chaining with early returns', () => {
      function processData(input: string): Result<number, string> {
        if (!input) {
          return err('Input is empty');
        }

        const num = parseInt(input);
        if (isNaN(num)) {
          return err('Input is not a number');
        }

        if (num < 0) {
          return err('Number must be positive');
        }

        return ok(num * 2);
      }

      expect(processData('10').isOk).toBe(true);
      expect(processData('').isErr).toBe(true);
      expect(processData('abc').isErr).toBe(true);
      expect(processData('-5').isErr).toBe(true);

      const result = processData('10');
      if (result.isOk) {
        expect(result.value).toBe(20);
      }
    });
  });
});
