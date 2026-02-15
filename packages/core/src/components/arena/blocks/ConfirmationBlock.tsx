/**
 * ConfirmationBlock
 *
 * Asks the user to confirm or reject an action.
 * Displays a message with Accept / Reject buttons.
 */

import React, { useCallback, useState } from 'react';
import { Check, X } from 'lucide-react';

interface ConfirmationBlockProps {
  message: string;
  actionId: string;
  acceptLabel?: string;
  rejectLabel?: string;
  onConfirm?: (actionId: string, accepted: boolean) => void;
}

export const ConfirmationBlock: React.FC<ConfirmationBlockProps> = ({
  message,
  actionId,
  acceptLabel = 'Confirm',
  rejectLabel = 'Cancel',
  onConfirm,
}) => {
  const [decision, setDecision] = useState<'accepted' | 'rejected' | null>(null);

  const handleAccept = useCallback(() => {
    setDecision('accepted');
    onConfirm?.(actionId, true);
  }, [actionId, onConfirm]);

  const handleReject = useCallback(() => {
    setDecision('rejected');
    onConfirm?.(actionId, false);
  }, [actionId, onConfirm]);

  const isResolved = decision !== null;

  return (
    <div className="rounded-md border border-[var(--vscode-widget-border)] overflow-hidden my-2 bg-[var(--vscode-editor-background)]">
      <div className="px-3 py-2">
        <p className="text-sm text-[var(--vscode-foreground)] mb-2">{message}</p>

        {isResolved ? (
          <div className="flex items-center gap-1.5 text-xs">
            {decision === 'accepted' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">{acceptLabel}ed</span>
              </>
            ) : (
              <>
                <X className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-400">{rejectLabel}led</span>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleAccept}
              className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
            >
              <Check className="w-3 h-3" />
              {acceptLabel}
            </button>
            <button
              onClick={handleReject}
              className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
            >
              <X className="w-3 h-3" />
              {rejectLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
