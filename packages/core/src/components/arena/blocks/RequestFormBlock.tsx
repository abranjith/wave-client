/**
 * RequestFormBlock
 *
 * Interactive form for configuring and sending an HTTP request.
 * Shows method, URL, optional environment picker, header/param overrides,
 * and a "Send" button.
 */

import React, { useCallback, useState } from 'react';
import { Play, ChevronDown, ChevronRight } from 'lucide-react';
import type { RequestFormData, EnvOption } from '../../../types/arenaChatBlocks';

interface RequestFormBlockProps {
  request: RequestFormData;
  environments?: EnvOption[];
  formId?: string;
  onSubmit?: (formId: string, data: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    environmentId?: string;
  }) => void;
}

/** Colour for HTTP method badges */
function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return 'text-emerald-400';
    case 'POST': return 'text-amber-400';
    case 'PUT': return 'text-blue-400';
    case 'PATCH': return 'text-violet-400';
    case 'DELETE': return 'text-red-400';
    case 'HEAD': return 'text-[var(--vscode-descriptionForeground)]';
    case 'OPTIONS': return 'text-cyan-400';
    default: return 'text-[var(--vscode-foreground)]';
  }
}

export const RequestFormBlock: React.FC<RequestFormBlockProps> = ({
  request,
  environments,
  formId,
  onSubmit,
}) => {
  const [selectedEnv, setSelectedEnv] = useState<string | undefined>(undefined);
  const [showHeaders, setShowHeaders] = useState(false);
  const [showBody, setShowBody] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!onSubmit || !formId) return;

    const headers: Record<string, string> = {};
    request.headers?.forEach((h) => {
      if (!h.disabled && h.key) headers[h.key] = h.value;
    });

    onSubmit(formId, {
      method: request.method,
      url: request.url,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: request.body ?? undefined,
      environmentId: selectedEnv,
    });
  }, [onSubmit, formId, request, selectedEnv]);

  const hasHeaders = request.headers && request.headers.length > 0;
  const hasBody = !!request.body;

  return (
    <div className="rounded-md border border-[var(--vscode-widget-border)] overflow-hidden my-2 bg-[var(--vscode-editor-background)]">
      {/* Method + URL */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--vscode-widget-border)]">
        <span className={`font-mono text-xs font-bold ${methodColor(request.method)}`}>
          {request.method.toUpperCase()}
        </span>
        <span className="font-mono text-xs text-[var(--vscode-foreground)] truncate flex-1">
          {request.url}
        </span>
      </div>

      {/* Environment selector */}
      {environments && environments.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--vscode-widget-border)]">
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">Environment:</span>
          <select
            className="text-xs bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border)] rounded px-1.5 py-0.5"
            value={selectedEnv ?? ''}
            onChange={(e) => setSelectedEnv(e.target.value || undefined)}
          >
            <option value="">None</option>
            {environments.map((env) => (
              <option key={env.id} value={env.id}>{env.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Collapsible headers */}
      {hasHeaders && (
        <div className="border-b border-[var(--vscode-widget-border)]">
          <button
            onClick={() => setShowHeaders(!showHeaders)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] w-full text-left"
          >
            {showHeaders ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Headers ({request.headers!.length})
          </button>
          {showHeaders && (
            <div className="px-3 pb-2">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {request.headers!.map((h, i) => (
                    <tr key={i} className={h.disabled ? 'opacity-40' : ''}>
                      <td className="pr-2 py-0.5 text-[var(--vscode-symbolIcon-propertyForeground)]">{h.key}</td>
                      <td className="py-0.5 text-[var(--vscode-foreground)]">{h.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Collapsible body */}
      {hasBody && (
        <div className="border-b border-[var(--vscode-widget-border)]">
          <button
            onClick={() => setShowBody(!showBody)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] w-full text-left"
          >
            {showBody ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Body {request.bodyContentType ? `(${request.bodyContentType})` : ''}
          </button>
          {showBody && (
            <pre className="px-3 pb-2 text-xs font-mono text-[var(--vscode-foreground)] max-h-40 overflow-auto whitespace-pre-wrap">
              {request.body}
            </pre>
          )}
        </div>
      )}

      {/* Send button */}
      <div className="flex justify-end px-3 py-2">
        <button
          onClick={handleSubmit}
          disabled={!onSubmit || !formId}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="w-3 h-3" />
          Send Request
        </button>
      </div>
    </div>
  );
};
