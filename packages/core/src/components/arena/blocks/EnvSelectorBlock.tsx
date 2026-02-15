/**
 * EnvSelectorBlock
 *
 * Dropdown to pick an environment. Emits the selected environment ID
 * via the `onSelect` callback (keyed by `actionId`).
 */

import React, { useCallback } from 'react';
import type { EnvOption } from '../../../types/arenaChatBlocks';

interface EnvSelectorBlockProps {
  environments: EnvOption[];
  selectedId?: string;
  actionId?: string;
  onSelect?: (actionId: string, environmentId: string) => void;
}

export const EnvSelectorBlock: React.FC<EnvSelectorBlockProps> = ({
  environments,
  selectedId,
  actionId,
  onSelect,
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (onSelect && actionId) {
        onSelect(actionId, e.target.value);
      }
    },
    [onSelect, actionId],
  );

  return (
    <div className="flex items-center gap-2 my-2 px-3 py-2 rounded-md border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)]">
      <label className="text-xs text-[var(--vscode-descriptionForeground)] whitespace-nowrap">
        Select Environment:
      </label>
      <select
        className="flex-1 text-xs bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border)] rounded px-2 py-1"
        value={selectedId ?? ''}
        onChange={handleChange}
      >
        <option value="">— Choose —</option>
        {environments.map((env) => (
          <option key={env.id} value={env.id}>
            {env.name}
          </option>
        ))}
      </select>
    </div>
  );
};
