/**
 * TableBlock
 *
 * Simple responsive data table with striped rows and optional caption.
 */

import React from 'react';

interface TableBlockProps {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export const TableBlock: React.FC<TableBlockProps> = ({ headers, rows, caption }) => {
  return (
    <div className="rounded-md border border-[var(--vscode-widget-border)] overflow-hidden my-2">
      {caption && (
        <div className="px-3 py-1.5 bg-[var(--vscode-editor-background)] border-b border-[var(--vscode-widget-border)]">
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">{caption}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--vscode-editor-background)]">
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="px-3 py-1.5 text-left font-semibold text-[var(--vscode-foreground)] border-b border-[var(--vscode-widget-border)] whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={rowIndex % 2 === 0 ? '' : 'bg-[var(--vscode-editor-background)]'}
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-3 py-1.5 text-[var(--vscode-foreground)] border-b border-[var(--vscode-widget-border)]"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-3 text-center text-[var(--vscode-descriptionForeground)] italic"
                >
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
