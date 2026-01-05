import { vi } from 'vitest';
import type { AxiosInstance, AxiosResponse } from 'axios';

/**
 * Mock Axios instance for testing
 */
export class MockAxiosInstance {
  private responses = new Map<string, any>();
  private errors = new Map<string, any>();

  get = vi.fn(async (url: string): Promise<AxiosResponse> => {
    if (this.errors.has(url)) {
      throw this.errors.get(url);
    }
    return {
      data: this.responses.get(url) || { isOk: true, value: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    };
  });

  post = vi.fn(async (url: string, data?: any): Promise<AxiosResponse> => {
    const key = `POST:${url}`;
    if (this.errors.has(key)) {
      throw this.errors.get(key);
    }
    return {
      data: this.responses.get(key) || { isOk: true, value: data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    };
  });

  put = vi.fn(async (url: string, data?: any): Promise<AxiosResponse> => {
    const key = `PUT:${url}`;
    if (this.errors.has(key)) {
      throw this.errors.get(key);
    }
    return {
      data: this.responses.get(key) || { isOk: true, value: data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    };
  });

  delete = vi.fn(async (url: string): Promise<AxiosResponse> => {
    const key = `DELETE:${url}`;
    if (this.errors.has(key)) {
      throw this.errors.get(key);
    }
    return {
      data: this.responses.get(key) || { isOk: true, value: undefined },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    };
  });

  /**
   * Set a mock response for a specific URL
   */
  setResponse(url: string, response: any, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET'): void {
    const key = method === 'GET' ? url : `${method}:${url}`;
    this.responses.set(key, response);
  }

  /**
   * Set a mock error for a specific URL
   */
  setError(url: string, error: any, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET'): void {
    const key = method === 'GET' ? url : `${method}:${url}`;
    this.errors.set(key, error);
  }

  /**
   * Clear all mock responses and errors
   */
  reset(): void {
    this.responses.clear();
    this.errors.clear();
    this.get.mockClear();
    this.post.mockClear();
    this.put.mockClear();
    this.delete.mockClear();
  }
}

/**
 * Create a mock axios instance
 */
export function createMockAxios(): MockAxiosInstance {
  return new MockAxiosInstance();
}

/**
 * Create mock axios.create function
 */
export function createMockAxiosCreate(mockInstance: MockAxiosInstance) {
  return vi.fn(() => mockInstance as unknown as AxiosInstance);
}
