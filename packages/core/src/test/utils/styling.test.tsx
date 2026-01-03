import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { cn, renderParameterizedText } from '../../utils/styling';

describe('styling', () => {
  describe('cn', () => {
    it('should merge simple class names', () => {
      const result = cn('class1', 'class2', 'class3');

      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).toContain('class3');
    });

    it('should handle conditional classes', () => {
      const isActive = true;
      const result = cn('base', isActive && 'active', !isActive && 'inactive');

      expect(result).toContain('base');
      expect(result).toContain('active');
      expect(result).not.toContain('inactive');
    });

    it('should merge Tailwind classes correctly', () => {
      // twMerge should handle conflicting Tailwind classes
      const result = cn('px-2 py-1', 'px-4');

      // px-4 should override px-2
      expect(result).toContain('px-4');
      expect(result).not.toContain('px-2');
      expect(result).toContain('py-1');
    });

    it('should handle empty and null values', () => {
      const result = cn('valid', '', null, undefined, false, 'another');

      expect(result).toContain('valid');
      expect(result).toContain('another');
    });

    it('should handle arrays', () => {
      const result = cn(['class1', 'class2'], 'class3');

      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).toContain('class3');
    });

    it('should handle objects', () => {
      const result = cn({
        'class1': true,
        'class2': false,
        'class3': true,
      });

      expect(result).toContain('class1');
      expect(result).not.toContain('class2');
      expect(result).toContain('class3');
    });

    it('should merge complex Tailwind utilities', () => {
      const result = cn(
        'bg-red-500 text-white',
        'bg-blue-500', // Should override bg-red-500
        'hover:bg-green-500'
      );

      expect(result).toContain('bg-blue-500');
      expect(result).not.toContain('bg-red-500');
      expect(result).toContain('text-white');
      expect(result).toContain('hover:bg-green-500');
    });
  });

  describe('renderParameterizedText', () => {
    it('should render plain text without parameters', () => {
      const existingParams = new Set<string>();
      const { container } = render(renderParameterizedText('Hello, World!', existingParams));

      expect(container.textContent).toBe('Hello, World!');
    });

    it('should render text with existing parameters in green', () => {
      const existingParams = new Set(['USER_ID', 'TOKEN']);
      const { container } = render(
        renderParameterizedText('User: {{USER_ID}}, Token: {{TOKEN}}', existingParams)
      );

      expect(container.textContent).toBe('User: {{USER_ID}}, Token: {{TOKEN}}');

      const paramElements = container.querySelectorAll('.parameterized-text');
      expect(paramElements.length).toBe(2);

      paramElements.forEach((el) => {
        expect(el.classList.contains('param-exists')).toBe(true);
        expect(el.classList.contains('param-missing')).toBe(false);
      });
    });

    it('should render text with missing parameters in red', () => {
      const existingParams = new Set<string>();
      const { container } = render(
        renderParameterizedText('API: {{API_URL}}', existingParams)
      );

      const paramElement = container.querySelector('.parameterized-text');
      expect(paramElement).not.toBeNull();
      expect(paramElement?.classList.contains('param-missing')).toBe(true);
      expect(paramElement?.classList.contains('param-exists')).toBe(false);
    });

    it('should render mixed existing and missing parameters', () => {
      const existingParams = new Set(['TOKEN']);
      const { container } = render(
        renderParameterizedText('{{TOKEN}} and {{MISSING}}', existingParams)
      );

      const paramElements = container.querySelectorAll('.parameterized-text');
      expect(paramElements.length).toBe(2);

      const tokenParam = Array.from(paramElements).find(
        (el) => el.textContent === '{{TOKEN}}'
      );
      const missingParam = Array.from(paramElements).find(
        (el) => el.textContent === '{{MISSING}}'
      );

      expect(tokenParam?.classList.contains('param-exists')).toBe(true);
      expect(missingParam?.classList.contains('param-missing')).toBe(true);
    });

    it('should handle case-insensitive parameter matching', () => {
      const existingParams = new Set(['user_id']);
      const { container } = render(
        renderParameterizedText('{{USER_ID}}', existingParams)
      );

      const paramElement = container.querySelector('.parameterized-text');
      expect(paramElement?.classList.contains('param-exists')).toBe(true);
    });

    it('should handle multiple occurrences of same parameter', () => {
      const existingParams = new Set(['NAME']);
      const { container } = render(
        renderParameterizedText('Hello {{NAME}}, welcome {{NAME}}!', existingParams)
      );

      const paramElements = container.querySelectorAll('.parameterized-text');
      expect(paramElements.length).toBe(2);

      paramElements.forEach((el) => {
        expect(el.classList.contains('param-exists')).toBe(true);
        expect(el.textContent).toBe('{{NAME}}');
      });
    });

    it('should preserve text between parameters', () => {
      const existingParams = new Set(['A', 'B']);
      const { container } = render(
        renderParameterizedText('Start {{A}} middle {{B}} end', existingParams)
      );

      expect(container.textContent).toBe('Start {{A}} middle {{B}} end');
    });

    it('should handle empty string', () => {
      const existingParams = new Set<string>();
      const { container } = render(renderParameterizedText('', existingParams));

      expect(container.textContent).toBe('');
    });

    it('should include data attribute with parameter name', () => {
      const existingParams = new Set(['API_KEY']);
      const { container } = render(
        renderParameterizedText('{{API_KEY}}', existingParams)
      );

      const paramElement = container.querySelector('.parameterized-text');
      expect(paramElement?.getAttribute('data-param-name')).toBe('API_KEY');
    });

    it('should handle parameters with underscores and hyphens', () => {
      const existingParams = new Set(['API_KEY', 'user-id']);
      const { container } = render(
        renderParameterizedText('{{API_KEY}} {{user-id}}', existingParams)
      );

      const paramElements = container.querySelectorAll('.parameterized-text');
      expect(paramElements.length).toBe(2);

      paramElements.forEach((el) => {
        expect(el.classList.contains('param-exists')).toBe(true);
      });
    });

    it('should handle adjacent parameters', () => {
      const existingParams = new Set(['A', 'B']);
      const { container } = render(
        renderParameterizedText('{{A}}{{B}}', existingParams)
      );

      const paramElements = container.querySelectorAll('.parameterized-text');
      expect(paramElements.length).toBe(2);
      expect(container.textContent).toBe('{{A}}{{B}}');
    });

    it('should not treat incomplete braces as parameters', () => {
      const existingParams = new Set(['VALID']);
      const { container } = render(
        renderParameterizedText('{{VALID}} {incomplete} {{another', existingParams)
      );

      const paramElements = container.querySelectorAll('.parameterized-text');
      // Only {{VALID}} should be recognized
      expect(paramElements.length).toBe(1);
      expect(paramElements[0].textContent).toBe('{{VALID}}');
    });
  });
});
