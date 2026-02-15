/**
 * JsonViewerBlock
 *
 * Collapsible, interactive JSON tree viewer.
 * Recursively renders objects/arrays with expand/collapse toggles.
 * Supports copy-path and raw copy actions.
 */

import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';

interface JsonViewerBlockProps {
  data: Record<string, unknown> | unknown[];
  title?: string;
  defaultCollapsed?: boolean;
}

// ============================================================================
// Internal tree node component
// ============================================================================

interface JsonNodeProps {
  name: string | number;
  value: unknown;
  depth: number;
  defaultCollapsed: boolean;
  path: string;
}

const JsonNode: React.FC<JsonNodeProps> = ({ name, value, depth, defaultCollapsed, path }) => {
  const isExpandable = value !== null && typeof value === 'object';
  const [expanded, setExpanded] = useState(!defaultCollapsed && depth < 2);

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  const renderValue = (): React.ReactNode => {
    if (value === null) return <span className="text-[var(--vscode-debugTokenExpression-name)]">null</span>;
    if (value === undefined) return <span className="text-[var(--vscode-descriptionForeground)]">undefined</span>;

    switch (typeof value) {
      case 'string':
        return (
          <span className="text-[var(--vscode-debugTokenExpression-string)]">
            &quot;{value.length > 120 ? `${value.slice(0, 120)}…` : value}&quot;
          </span>
        );
      case 'number':
        return <span className="text-[var(--vscode-debugTokenExpression-number)]">{value}</span>;
      case 'boolean':
        return <span className="text-[var(--vscode-debugTokenExpression-boolean)]">{String(value)}</span>;
      default:
        return <span>{String(value)}</span>;
    }
  };

  const childEntries: [string | number, unknown][] = isExpandable
    ? Array.isArray(value)
      ? value.map((v, i) => [i, v])
      : Object.entries(value as Record<string, unknown>)
    : [];

  const summary = isExpandable
    ? Array.isArray(value)
      ? `Array(${value.length})`
      : `{${Object.keys(value as Record<string, unknown>).length}}`
    : null;

  return (
    <div className="font-mono text-xs" style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      <div className="flex items-center gap-1 py-0.5 group hover:bg-[var(--vscode-list-hoverBackground)] rounded px-1 -mx-1">
        {isExpandable ? (
          <button onClick={toggle} className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            {expanded ? (
              <ChevronDown className="w-3 h-3 text-[var(--vscode-descriptionForeground)]" />
            ) : (
              <ChevronRight className="w-3 h-3 text-[var(--vscode-descriptionForeground)]" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <span className="text-[var(--vscode-symbolIcon-propertyForeground)] flex-shrink-0">
          {typeof name === 'number' ? name : `"${name}"`}
        </span>
        <span className="text-[var(--vscode-descriptionForeground)]">:</span>

        {isExpandable && !expanded ? (
          <button onClick={toggle} className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]">
            {summary}
          </button>
        ) : !isExpandable ? (
          renderValue()
        ) : null}
      </div>

      {isExpandable && expanded && (
        <div>
          {childEntries.map(([key, val]) => (
            <JsonNode
              key={String(key)}
              name={key}
              value={val}
              depth={depth + 1}
              defaultCollapsed={defaultCollapsed}
              path={`${path}.${key}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main component
// ============================================================================

export const JsonViewerBlock: React.FC<JsonViewerBlockProps> = ({
  data,
  title,
  defaultCollapsed = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }, [data]);

  const entries: [string | number, unknown][] = Array.isArray(data)
    ? data.map((v, i) => [i, v])
    : Object.entries(data);

  return (
    <div className="rounded-md border border-[var(--vscode-widget-border)] overflow-hidden my-2">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--vscode-editor-background)] border-b border-[var(--vscode-widget-border)]">
        <span className="text-xs text-[var(--vscode-descriptionForeground)] font-mono">
          {title ?? 'JSON'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] transition-colors"
          title="Copy JSON"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Tree */}
      <div className="p-2 max-h-80 overflow-auto bg-[var(--vscode-editor-background)]">
        {entries.map(([key, val]) => (
          <JsonNode
            key={String(key)}
            name={key}
            value={val}
            depth={0}
            defaultCollapsed={defaultCollapsed}
            path={`$${Array.isArray(data) ? `[${key}]` : `.${key}`}`}
          />
        ))}
      </div>
    </div>
  );
};
