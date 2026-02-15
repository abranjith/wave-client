/**
 * CodeBlock
 *
 * Syntax-highlighted code block with a copy button and optional title.
 * Uses highlight.js (already in project deps) for syntax colouring.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  content: string;
  title?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, content, title }) => {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  // Attempt to highlight with highlight.js if available globally
  useEffect(() => {
    if (codeRef.current) {
      try {
        // highlight.js may be loaded globally by the webview host
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hljs = (window as any).hljs;
        if (hljs?.highlightElement) {
          // Reset any prior highlighting so hljs re-processes
          codeRef.current.removeAttribute('data-highlighted');
          hljs.highlightElement(codeRef.current);
        }
      } catch {
        // Graceful fallback — no highlighting
      }
    }
  }, [content, language]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available in some webview contexts
    }
  }, [content]);

  const displayLanguage = useMemo(() => {
    const map: Record<string, string> = {
      js: 'JavaScript',
      ts: 'TypeScript',
      tsx: 'TypeScript (JSX)',
      jsx: 'JavaScript (JSX)',
      json: 'JSON',
      http: 'HTTP',
      html: 'HTML',
      css: 'CSS',
      xml: 'XML',
      yaml: 'YAML',
      yml: 'YAML',
      sh: 'Shell',
      bash: 'Bash',
      python: 'Python',
      py: 'Python',
      sql: 'SQL',
      graphql: 'GraphQL',
      proto: 'Protocol Buffers',
    };
    return map[language.toLowerCase()] ?? language;
  }, [language]);

  return (
    <div className="rounded-md border border-[var(--vscode-widget-border)] overflow-hidden my-2">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--vscode-editor-background)] border-b border-[var(--vscode-widget-border)]">
        <span className="text-xs text-[var(--vscode-descriptionForeground)] font-mono">
          {title ?? displayLanguage}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code area */}
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed bg-[var(--vscode-editor-background)]">
        <code ref={codeRef} className={`language-${language}`}>
          {content}
        </code>
      </pre>
    </div>
  );
};
