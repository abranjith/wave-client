/**
 * ArenaBlockRenderer
 *
 * Top-level switch component that maps an `ArenaChatBlock` to its
 * specialised renderer.  Consumed by the chat message list to render
 * rich content blocks inside assistant (or user) messages.
 */

import React from 'react';
import type { ArenaChatBlock } from '../../../types/arenaChatBlocks';
import { TextBlock } from './TextBlock';
import { CodeBlock } from './CodeBlock';
import { JsonViewerBlock } from './JsonViewerBlock';
import { RequestFormBlock } from './RequestFormBlock';
import { ResponseViewerBlock } from './ResponseViewerBlock';
import { EnvSelectorBlock } from './EnvSelectorBlock';
import { TableBlock } from './TableBlock';
import { ConfirmationBlock } from './ConfirmationBlock';
import { ProgressBlock } from './ProgressBlock';

// ============================================================================
// Callback types for interactive blocks
// ============================================================================

export interface BlockCallbacks {
  /** Called when the user submits a request form */
  onRequestSubmit?: (formId: string, data: { method: string; url: string; headers?: Record<string, string>; body?: string; environmentId?: string }) => void;
  /** Called when the user selects an environment */
  onEnvSelect?: (actionId: string, environmentId: string) => void;
  /** Called when the user confirms or rejects an action */
  onConfirm?: (actionId: string, accepted: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

interface ArenaBlockRendererProps {
  /** The block to render */
  block: ArenaChatBlock;
  /** Callbacks for interactive blocks */
  callbacks?: BlockCallbacks;
}

/**
 * Renders a single `ArenaChatBlock` by dispatching to the correct
 * specialised component based on `block.type`.
 */
export const ArenaBlockRenderer: React.FC<ArenaBlockRendererProps> = ({
  block,
  callbacks,
}) => {
  switch (block.type) {
    case 'text':
      return <TextBlock content={block.content} />;

    case 'code':
      return (
        <CodeBlock
          language={block.language}
          content={block.content}
          title={block.title}
        />
      );

    case 'json_viewer':
      return (
        <JsonViewerBlock
          data={block.data}
          title={block.title}
          defaultCollapsed={block.defaultCollapsed}
        />
      );

    case 'request_form':
      return (
        <RequestFormBlock
          request={block.request}
          environments={block.environments}
          formId={block.formId}
          onSubmit={callbacks?.onRequestSubmit}
        />
      );

    case 'response_viewer':
      return (
        <ResponseViewerBlock
          response={block.response}
          title={block.title}
        />
      );

    case 'env_selector':
      return (
        <EnvSelectorBlock
          environments={block.environments}
          selectedId={block.selectedId}
          actionId={block.actionId}
          onSelect={callbacks?.onEnvSelect}
        />
      );

    case 'table':
      return (
        <TableBlock
          headers={block.headers}
          rows={block.rows}
          caption={block.caption}
        />
      );

    case 'confirmation':
      return (
        <ConfirmationBlock
          message={block.message}
          actionId={block.actionId}
          acceptLabel={block.acceptLabel}
          rejectLabel={block.rejectLabel}
          onConfirm={callbacks?.onConfirm}
        />
      );

    case 'progress':
      return (
        <ProgressBlock
          label={block.label}
          status={block.status}
          detail={block.detail}
        />
      );

    default: {
      // Exhaustive check — TS will error here if a block type is unhandled
      const _exhaustive: never = block;
      console.warn('Unknown block type:', (_exhaustive as ArenaChatBlock).type);
      return null;
    }
  }
};
