/**
 * MarkdownRenderer
 *
 * Full-featured markdown renderer for Arena chat responses.
 * Uses react-markdown with remark-gfm (GitHub Flavored Markdown)
 * and rehype-highlight (syntax highlighting via highlight.js).
 *
 * All styling uses VS Code CSS custom properties so the component
 * looks native in both the VS Code webview and the standalone web app.
 */

import React, { Component, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';

// ============================================================================
// Error Boundary — catches react-markdown runtime failures
// ============================================================================

interface MarkdownErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface MarkdownErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches errors thrown during react-markdown rendering and falls back
 * to displaying the raw content as plain text.
 */
class MarkdownErrorBoundary extends Component<MarkdownErrorBoundaryProps, MarkdownErrorBoundaryState> {
  state: MarkdownErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MarkdownErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[MarkdownRenderer] react-markdown error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// ============================================================================
// Props
// ============================================================================

interface MarkdownRendererProps {
  /** Raw markdown string to render */
  content: string;
  /** When true, skips rehype-highlight to avoid errors on incomplete code fences */
  streaming?: boolean;
}

// ============================================================================
// Custom component overrides — VS Code theme integration
// ============================================================================

const markdownComponents: Components = {
  // Headings ----------------------------------------------------------------
  h1: ({ children }) => (
    <h1 className="text-lg font-bold mt-4 mb-2 pb-1 border-b border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)]">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mt-3 mb-1.5 pb-0.5 border-b border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mt-2.5 mb-1 text-[var(--vscode-foreground)]">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold mt-2 mb-0.5 text-[var(--vscode-foreground)]">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-xs font-semibold mt-1.5 mb-0.5 text-[var(--vscode-foreground)]">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-xs font-semibold mt-1 mb-0.5 text-[var(--vscode-foreground)]">
      {children}
    </h6>
  ),

  // Paragraphs & text -------------------------------------------------------
  p: ({ children }) => (
    <p className="leading-relaxed mb-1 text-[var(--vscode-foreground)]">
      {children}
    </p>
  ),
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  del: ({ children }) => <del>{children}</del>,

  // Links -------------------------------------------------------------------
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-[var(--vscode-textLink-foreground)] hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),

  // Lists -------------------------------------------------------------------
  ul: ({ children }) => (
    <ul className="list-disc pl-5 space-y-1 mb-3 text-[var(--vscode-foreground)]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 space-y-1 mb-3 text-[var(--vscode-foreground)]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,

  // Code --------------------------------------------------------------------
  pre: ({ children }) => (
    <pre className="rounded-md bg-[var(--vscode-editor-background)] p-3 text-xs overflow-x-auto my-2 border border-[var(--vscode-widget-border)]">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    // Fenced code blocks get a className like "language-js" from react-markdown
    // and are wrapped in <pre>. Inline code has no className.
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-[var(--vscode-textCodeBlock-background)] px-1 py-0.5 rounded text-[0.85em] font-mono">
          {children}
        </code>
      );
    }
    // Fenced code block — className carries "hljs language-*" from rehype-highlight
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },

  // Blockquotes -------------------------------------------------------------
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[var(--vscode-textBlockQuote-border)] bg-[var(--vscode-textBlockQuote-background)] pl-3 py-0.5 text-sm opacity-90 my-2 rounded-r">
      {children}
    </blockquote>
  ),

  // Tables (GFM) ------------------------------------------------------------
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-sm border-collapse border border-[var(--vscode-widget-border)]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[var(--vscode-editor-background)]">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-[var(--vscode-widget-border)] even:bg-[var(--vscode-editor-background)]">
      {children}
    </tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left font-semibold border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-1.5 border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)]">
      {children}
    </td>
  ),

  // Horizontal rule ---------------------------------------------------------
  hr: () => <hr className="border-[var(--vscode-widget-border)] my-4" />,
};

// ============================================================================
// Component
// ============================================================================

/**
 * Renders markdown content with full GFM support and syntax highlighting.
 * Uses VS Code theme CSS variables for native look-and-feel.
 *
 * Wrapped in an error boundary: if react-markdown throws at runtime
 * (e.g. ESM resolution / bundler edge case), the raw content is shown
 * as plain text and the error is logged to `console.error`.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, streaming = false }) => {
  const rehypePlugins = streaming ? [] : [rehypeHighlight];

  const element = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    ),
    [content, streaming],
  );

  // Plain-text fallback: preserve whitespace so the raw markdown stays legible
  const fallback = (
    <div className="text-sm text-[var(--vscode-foreground)] leading-relaxed whitespace-pre-wrap">
      {content}
    </div>
  );

  return (
    <div className="text-sm text-[var(--vscode-foreground)] leading-relaxed">
      <MarkdownErrorBoundary fallback={fallback}>
        {element}
      </MarkdownErrorBoundary>
    </div>
  );
};
