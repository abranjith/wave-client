/**
 * ArenaReadinessOverlay Component
 *
 * Renders a full-height overlay replacing the chat area content for
 * non-ready Arena states:
 *
 * - `'loading'`      — Centered spinner with "Initializing Arena…" text.
 * - `'needs-config'` — Friendly prompt to configure an AI provider.
 * - `'idle'` / `'ready'` — Returns null (not rendered).
 */

import React from 'react';
import { Settings } from 'lucide-react';
import type { ArenaReadinessState } from '../../types/arena';
import { PrimaryButton } from '../ui/PrimaryButton';

// ============================================================================
// Types
// ============================================================================

export interface ArenaReadinessOverlayProps {
  /** Current Arena readiness state. */
  readiness: ArenaReadinessState;
  /** Called when the user clicks "Open Settings". */
  onOpenSettings: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Full-height overlay displayed during `'loading'` and `'needs-config'` states.
 * Returns `null` for `'idle'` and `'ready'`.
 */
export function ArenaReadinessOverlay({
  readiness,
  onOpenSettings,
}: ArenaReadinessOverlayProps): React.ReactElement | null {
  if (readiness === 'idle' || readiness === 'ready') {
    return null;
  }

  if (readiness === 'loading') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 h-full p-8 bg-white dark:bg-slate-900">
        {/* Spinner */}
        <div
          className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500 dark:border-slate-700 dark:border-t-blue-400"
          role="status"
          aria-label="Loading"
        />
        <p className="text-sm text-slate-500 dark:text-slate-400">Initializing Arena…</p>
        {/* Skeleton placeholders for the chat area */}
        <div className="w-full max-w-lg space-y-3 mt-4" aria-hidden="true">
          <div className="h-4 rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 rounded bg-slate-100 dark:bg-slate-800 w-4/5" />
          <div className="h-4 rounded bg-slate-100 dark:bg-slate-800 w-3/5" />
        </div>
      </div>
    );
  }

  // readiness === 'needs-config'
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 h-full p-8 bg-white dark:bg-slate-900">
      {/* Illustration placeholder */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30">
        <Settings size={32} className="text-blue-400 dark:text-blue-300" />
      </div>

      <div className="text-center space-y-2 max-w-xs">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Configure a Provider
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Set up at least one AI provider to start chatting.
        </p>
      </div>

      <PrimaryButton
        text="Open Settings"
        onClick={onOpenSettings}
        colorTheme="main"
      />
    </div>
  );
}

export default ArenaReadinessOverlay;
