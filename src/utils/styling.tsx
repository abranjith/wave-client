/**
 * Renders parameterized text with {{variable}} syntax
 * Variables are colored green if they exist in the params set, red otherwise
 */
export function renderParameterizedText(text: string, existingParams: Set<string>){
  const parts = text
    .split(/(\{\{[^}]+\}\})/g)
    .filter(Boolean)
    .map((segment, index) => {
      const match = segment.match(/^\{\{([^}]+)\}\}$/);
      if (!match) return <span key={index}>{segment}</span>;

      const name = match[1];
      const exists = existingParams?.has(name);

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