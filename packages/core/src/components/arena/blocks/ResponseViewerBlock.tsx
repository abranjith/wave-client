/**
 * ResponseViewerBlock
 *
 * Displays an HTTP response: status code badge, headers table,
 * body viewer with auto-detected content type, and timing info.
 */

import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import type { ResponseData } from '../../../types/collection';

interface ResponseViewerBlockProps {
  response: ResponseData;
  title?: string;
}

/** Colour for status code badges */
function statusColor(status: number): string {
  if (status < 200) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (status < 300) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (status < 400) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (status < 500) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-red-600/20 text-red-300 border-red-600/30';
}

/** Format bytes to human-readable */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ResponseViewerBlock: React.FC<ResponseViewerBlockProps> = ({
  response,
  title,
}) => {
  const [showHeaders, setShowHeaders] = useState(false);
  const [showBody, setShowBody] = useState(true);
  const [copied, setCopied] = useState(false);

  const headerEntries = Object.entries(response.headers);

  const handleCopyBody = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(response.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }, [response.body]);

  /** Try to pretty-print JSON bodies */
  const formattedBody = React.useMemo(() => {
    try {
      const parsed = JSON.parse(response.body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return response.body;
    }
  }, [response.body]);

  const isJson = React.useMemo(() => {
    const ct = response.headers['content-type'] || response.headers['Content-Type'] || '';
    return ct.includes('json') || (() => { try { JSON.parse(response.body); return true; } catch { return false; } })();
  }, [response.body, response.headers]);

  return (
    <div className="rounded-md border border-[var(--vscode-widget-border)] overflow-hidden my-2 bg-[var(--vscode-editor-background)]">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-widget-border)]">
        <div className="flex items-center gap-2">
          {title && (
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">{title}</span>
          )}
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-bold border ${statusColor(response.status)}`}>
            {response.status} {response.statusText}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--vscode-descriptionForeground)]">
          <span>{response.elapsedTime}ms</span>
          <span>{formatSize(response.size)}</span>
        </div>
      </div>

      {/* Headers section */}
      {headerEntries.length > 0 && (
        <div className="border-b border-[var(--vscode-widget-border)]">
          <button
            onClick={() => setShowHeaders(!showHeaders)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] w-full text-left"
          >
            {showHeaders ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Headers ({headerEntries.length})
          </button>
          {showHeaders && (
            <div className="px-3 pb-2">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {headerEntries.map(([key, value]) => (
                    <tr key={key}>
                      <td className="pr-2 py-0.5 text-[var(--vscode-symbolIcon-propertyForeground)] whitespace-nowrap align-top">{key}</td>
                      <td className="py-0.5 text-[var(--vscode-foreground)] break-all">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Body section */}
      {response.body && (
        <div>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--vscode-widget-border)]">
            <button
              onClick={() => setShowBody(!showBody)}
              className="flex items-center gap-1 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
            >
              {showBody ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Body {isJson ? '(JSON)' : ''}
            </button>
            <button
              onClick={handleCopyBody}
              className="flex items-center gap-1 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          {showBody && (
            <pre className="p-3 text-xs font-mono text-[var(--vscode-foreground)] max-h-60 overflow-auto whitespace-pre-wrap">
              {formattedBody}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
