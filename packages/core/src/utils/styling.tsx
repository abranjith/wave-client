import { JSX } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility for merging Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Renders parameterized text with {{variable}} syntax
 * Variables are colored green if they exist in the params set, red otherwise
 */
export function renderParameterizedText(text: string, existingParams: Set<string>) : JSX.Element {
  if (!text) return <></>;
  const parts = text
    .split(/(\{\{[^}]+\}\})/g)
    .filter(Boolean)
    .map((segment, index) => {
      const match = segment.match(/^\{\{([^}]+)\}\}$/);
      if (!match) return <span key={index}>{segment}</span>;

      const name = match[1];
      const exists = existingParams && Array.from(existingParams).some(param => param.toLowerCase() === name.toLowerCase());

      return (
        <span
          key={index}
          className={`parameterized-text ${exists ? 'param-exists' : 'param-missing'}`}
          data-param-name={name}
        >
          {`{{${name}}}`}
        </span>
      );
    });
  return <>{parts}</>;
};