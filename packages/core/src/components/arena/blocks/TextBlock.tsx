/**
 * TextBlock
 *
 * Renders a markdown text block with enhanced formatting:
 * headings, bold, italic, inline code, links, bullet lists, numbered lists.
 *
 * Does NOT use a heavy markdown library — a lightweight regex-based renderer
 * covers the subset of markdown that Arena agents produce.
 */

import React, { useMemo } from 'react';

interface TextBlockProps {
  content: string;
}

/**
 * Convert a subset of markdown to React elements.
 *
 * Handles: headings (##), bold (**), italic (*), inline code (`),
 * code fences (```), links [text](url), bullet & numbered lists.
 */
function parseMarkdown(markdown: string): React.ReactNode[] {
  const lines = markdown.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeFence = false;
  let codeContent = '';
  let codeLanguage = '';
  let listItems: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listType && listItems.length > 0) {
      const Tag = listType;
      const className = listType === 'ul'
        ? 'list-disc list-inside space-y-0.5 mb-2'
        : 'list-decimal list-inside space-y-0.5 mb-2';
      elements.push(
        <Tag key={`list-${elements.length}`} className={className}>
          {listItems}
        </Tag>,
      );
      listItems = [];
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fence open/close
    if (line.trimStart().startsWith('```')) {
      if (!inCodeFence) {
        flushList();
        inCodeFence = true;
        codeLanguage = line.trimStart().slice(3).trim();
        codeContent = '';
      } else {
        elements.push(
          <pre
            key={`code-${i}`}
            className="rounded-md bg-[var(--vscode-editor-background)] p-3 text-xs overflow-x-auto my-2 border border-[var(--vscode-widget-border)]"
          >
            <code data-language={codeLanguage || undefined}>{codeContent}</code>
          </pre>,
        );
        inCodeFence = false;
        codeContent = '';
        codeLanguage = '';
      }
      continue;
    }

    if (inCodeFence) {
      codeContent += (codeContent ? '\n' : '') + line;
      continue;
    }

    // Empty line flushes list
    if (line.trim() === '') {
      flushList();
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const sizes: Record<number, string> = {
        1: 'text-lg font-bold mt-3 mb-1',
        2: 'text-base font-bold mt-2.5 mb-1',
        3: 'text-sm font-semibold mt-2 mb-0.5',
        4: 'text-sm font-semibold mt-1.5 mb-0.5',
        5: 'text-xs font-semibold mt-1 mb-0.5',
        6: 'text-xs font-semibold mt-1 mb-0.5',
      };
      elements.push(
        <div key={`h-${i}`} className={sizes[level]}>
          {renderInline(text)}
        </div>,
      );
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(
        <li key={`li-${i}`} className="text-[var(--vscode-foreground)]">
          {renderInline(ulMatch[2])}
        </li>,
      );
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (olMatch) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(
        <li key={`li-${i}`} className="text-[var(--vscode-foreground)]">
          {renderInline(olMatch[2])}
        </li>,
      );
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^>\s?(.*)$/);
    if (bqMatch) {
      flushList();
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-2 border-[var(--vscode-textLink-foreground)] pl-3 italic opacity-80 my-1"
        >
          {renderInline(bqMatch[1])}
        </blockquote>,
      );
      continue;
    }

    // Horizontal rule  
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      flushList();
      elements.push(
        <hr
          key={`hr-${i}`}
          className="border-[var(--vscode-widget-border)] my-2"
        />,
      );
      continue;
    }

    // Regular paragraph line
    flushList();
    elements.push(
      <p key={`p-${i}`} className="leading-relaxed mb-1">
        {renderInline(line)}
      </p>,
    );
  }

  // Flush remaining list
  flushList();

  // If still inside a code fence, render what we have
  if (inCodeFence && codeContent) {
    elements.push(
      <pre
        key="code-unclosed"
        className="rounded-md bg-[var(--vscode-editor-background)] p-3 text-xs overflow-x-auto my-2 border border-[var(--vscode-widget-border)]"
      >
        <code>{codeContent}</code>
      </pre>,
    );
  }

  return elements;
}

/**
 * Render inline markdown: bold, italic, inline code, links, strikethrough.
 */
function renderInline(text: string): React.ReactNode {
  // Order matters — process in a single pass via regex alternation
  const pattern = /(`[^`]+`)|\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Push text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Inline code
      parts.push(
        <code
          key={key++}
          className="bg-[var(--vscode-textCodeBlock-background)] px-1 py-0.5 rounded text-[0.85em] font-mono"
        >
          {match[1].slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      // Bold
      parts.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3]) {
      // Italic
      parts.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4]) {
      // Strikethrough
      parts.push(<del key={key++}>{match[4]}</del>);
    } else if (match[5] && match[6]) {
      // Link
      parts.push(
        <a
          key={key++}
          href={match[6]}
          className="text-[var(--vscode-textLink-foreground)] hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {match[5]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export const TextBlock: React.FC<TextBlockProps> = ({ content }) => {
  const elements = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className="text-sm text-[var(--vscode-foreground)] leading-relaxed">
      {elements}
    </div>
  );
};
