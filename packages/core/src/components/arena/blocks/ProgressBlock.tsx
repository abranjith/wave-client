/**
 * ProgressBlock
 *
 * Inline progress / status indicator with a spinner, checkmark, or error icon.
 */

import React from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

interface ProgressBlockProps {
  label: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
}

const statusConfig = {
  running: {
    icon: Loader2,
    iconClass: 'w-4 h-4 text-[var(--vscode-progressBar-background)] animate-spin',
    labelClass: 'text-[var(--vscode-foreground)]',
  },
  done: {
    icon: CheckCircle2,
    iconClass: 'w-4 h-4 text-emerald-400',
    labelClass: 'text-[var(--vscode-foreground)]',
  },
  error: {
    icon: XCircle,
    iconClass: 'w-4 h-4 text-red-400',
    labelClass: 'text-red-400',
  },
};

export const ProgressBlock: React.FC<ProgressBlockProps> = ({ label, status, detail }) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-2 my-2 px-3 py-2 rounded-md border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)]">
      <Icon className={config.iconClass} />
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium ${config.labelClass}`}>{label}</span>
        {detail && (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">{detail}</p>
        )}
      </div>
    </div>
  );
};
