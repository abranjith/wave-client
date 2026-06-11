import { useCallback } from 'react';
import type React from 'react';

interface UseSaveShortcutOptions {
  /** When false the handler is a no-op. Defaults to true. */
  enabled?: boolean;
}

/**
 * Returns an `onKeyDown` handler that calls `onSave` when Ctrl+S (Windows/Linux)
 * or Cmd+S (macOS) is pressed. Spread the returned object onto a container element
 * so the shortcut is scoped to that subtree's focus rather than the whole document.
 *
 * Match criteria: `e.key.toLowerCase() === 's'` with `ctrlKey || metaKey`, and
 * neither `altKey` nor `shiftKey` set. Matching events are `preventDefault`-ed and
 * `stopPropagation`-ed before `onSave` is called.
 *
 * @example
 * const { onKeyDown } = useSaveShortcut(handleSave, { enabled: !isSaveWizardOpen });
 * return <div onKeyDown={onKeyDown}>...</div>;
 */
export function useSaveShortcut(
  onSave: () => void,
  options?: UseSaveShortcutOptions
): { onKeyDown: React.KeyboardEventHandler } {
  const enabled = options?.enabled ?? true;

  const onKeyDown = useCallback<React.KeyboardEventHandler>(
    (e) => {
      if (!enabled) return;
      if (
        e.key.toLowerCase() === 's' &&
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        onSave();
      }
    },
    [onSave, enabled]
  );

  return { onKeyDown };
}
