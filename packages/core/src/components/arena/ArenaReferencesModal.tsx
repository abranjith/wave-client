/**
 * ArenaReferencesModal Component
 *
 * A modal overlay that lists all active references (default + user-added)
 * for the current Arena agent. Users can:
 *   - See each reference's name, URL, category and type
 *   - Toggle references on/off
 *   - Add new references (name + URL)
 *   - Remove non-default (user-added) references
 *
 * Default references (from `DEFAULT_REFERENCE_WEBSITES`) are marked with a
 * badge and cannot be deleted.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Globe,
  FileText,
  Wrench,
  ExternalLink,
  Shield,
} from 'lucide-react';
import { cn } from '../../utils/styling';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { ArenaReference, ArenaSourceType } from '../../config/arenaConfig';

// ============================================================================
// Types
// ============================================================================

export interface ArenaReferencesModalProps {
  /** All references (default + user-added, already merged) */
  references: ArenaReference[];
  /** Called when the reference list changes (toggle, add, remove) */
  onReferencesChange: (references: ArenaReference[]) => void;
  /** Close the modal */
  onClose: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const TYPE_ICONS: Record<ArenaSourceType, React.ReactNode> = {
  web: <Globe size={14} />,
  document: <FileText size={14} />,
  mcp: <Wrench size={14} />,
};

const TYPE_LABELS: Record<ArenaSourceType, string> = {
  web: 'Web',
  document: 'Document',
  mcp: 'MCP Tool',
};

// ============================================================================
// Component
// ============================================================================

export function ArenaReferencesModal({
  references,
  onReferencesChange,
  onClose,
}: ArenaReferencesModalProps): React.ReactElement {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState<ArenaSourceType>('web');
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus name input when the add form appears
  useEffect(() => {
    if (showAddForm && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [showAddForm]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  /** Close when clicking the backdrop (not the modal itself) */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  /** Toggle a reference's enabled state */
  const handleToggle = useCallback(
    (id: string) => {
      const updated = references.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r,
      );
      onReferencesChange(updated);
    },
    [references, onReferencesChange],
  );

  /** Remove a user-added reference */
  const handleRemove = useCallback(
    (id: string) => {
      const updated = references.filter((r) => r.id !== id);
      onReferencesChange(updated);
    },
    [references, onReferencesChange],
  );

  /** Add a new user reference */
  const handleAdd = useCallback(() => {
    const trimmedName = newName.trim();
    const trimmedUrl = newUrl.trim();
    if (!trimmedName || !trimmedUrl) return;

    const newRef: ArenaReference = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: trimmedName,
      url: trimmedUrl,
      type: newType,
      isDefault: false,
      enabled: true,
    };

    onReferencesChange([...references, newRef]);
    setNewName('');
    setNewUrl('');
    setShowAddForm(false);
  }, [newName, newUrl, newType, references, onReferencesChange]);

  /** Handle Enter key in the add form */
  const handleAddKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  const enabledCount = references.filter((r) => r.enabled).length;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Manage References"
    >
      <div
        className={cn(
          'w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl shadow-2xl',
          'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700',
        )}
      >
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              References
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {enabledCount} of {references.length} active
            </p>
          </div>
          <SecondaryButton
            onClick={onClose}
            size="icon"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300"
            aria-label="Close"
          >
            <X size={18} />
          </SecondaryButton>
        </div>

        {/* ---- List ---- */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {references.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">
              No references configured.
            </p>
          ) : (
            references.map((ref) => (
              <ReferenceRow
                key={ref.id}
                reference={ref}
                onToggle={handleToggle}
                onRemove={handleRemove}
              />
            ))
          )}
        </div>

        {/* ---- Add Form ---- */}
        {showAddForm && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-2">
              <input
                ref={nameInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleAddKeyDown}
                placeholder="Name"
                className="flex-1 px-2.5 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as ArenaSourceType)}
                className="px-2 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="web">Web</option>
                <option value="document">Document</option>
                <option value="mcp">MCP</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={handleAddKeyDown}
                placeholder="https://..."
                className="flex-1 px-2.5 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <PrimaryButton
                onClick={handleAdd}
                disabled={!newName.trim() || !newUrl.trim()}
                size="sm"
              >
                Add
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  setShowAddForm(false);
                  setNewName('');
                  setNewUrl('');
                }}
                size="sm"
                variant="ghost"
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Cancel
              </SecondaryButton>
            </div>
          </div>
        )}

        {/* ---- Footer ---- */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700">
          {!showAddForm ? (
            <SecondaryButton
              onClick={() => setShowAddForm(true)}
              size="sm"
              variant="ghost"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <Plus size={14} />
              Add Reference
            </SecondaryButton>
          ) : (
            <div />
          )}
          <SecondaryButton onClick={onClose} size="sm">
            Done
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Reference Row
// ============================================================================

interface ReferenceRowProps {
  reference: ArenaReference;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

function ReferenceRow({ reference, onToggle, onRemove }: ReferenceRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
        reference.enabled
          ? 'bg-slate-50 dark:bg-slate-700/40'
          : 'bg-slate-50/50 dark:bg-slate-800/40 opacity-60',
      )}
    >
      {/* Toggle checkbox */}
      <input
        type="checkbox"
        checked={reference.enabled}
        onChange={() => onToggle(reference.id)}
        className="accent-blue-600 flex-shrink-0"
        aria-label={`Toggle ${reference.name}`}
      />

      {/* Icon */}
      <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">
        {TYPE_ICONS[reference.type]}
      </span>

      {/* Name + URL */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
            {reference.name}
          </span>
          {reference.isDefault && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
              title="Built-in reference"
            >
              <Shield size={9} />
              Default
            </span>
          )}
          {reference.category && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {reference.category}
            </span>
          )}
        </div>
        {reference.url && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-slate-400 dark:text-slate-500 truncate">
              {reference.url}
            </span>
            <a
              href={reference.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-slate-300 hover:text-blue-500 dark:text-slate-600 dark:hover:text-blue-400 transition-colors"
              title="Open in browser"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={11} />
            </a>
          </div>
        )}
        {reference.description && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">
            {reference.description}
          </p>
        )}
      </div>

      {/* Type badge */}
      <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0 uppercase tracking-wider">
        {TYPE_LABELS[reference.type]}
      </span>

      {/* Remove button (user-added only) */}
      {!reference.isDefault ? (
        <SecondaryButton
          onClick={() => onRemove(reference.id)}
          size="icon"
          variant="ghost"
          colorTheme="error"
          className="h-6 w-6 p-0 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 flex-shrink-0"
          title="Remove reference"
          aria-label={`Remove ${reference.name}`}
        >
          <Trash2 size={14} />
        </SecondaryButton>
      ) : (
        /* Spacer to keep alignment consistent */
        <div className="w-[22px] flex-shrink-0" />
      )}
    </div>
  );
}

export default ArenaReferencesModal;
