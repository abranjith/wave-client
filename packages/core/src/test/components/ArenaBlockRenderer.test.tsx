/**
 * Tests for ArenaBlockRenderer component
 *
 * Verifies that each block variant renders the correct sub-component
 * and that callbacks are wired properly for interactive blocks.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArenaBlockRenderer } from '../../components/arena/blocks/ArenaBlockRenderer';
import type { ArenaChatBlock } from '../../types/arenaChatBlocks';

describe('ArenaBlockRenderer', () => {
  // --------------------------------------------------------------------------
  // TextBlock
  // --------------------------------------------------------------------------
  it('should render a text block with markdown content', () => {
    const block: ArenaChatBlock = { type: 'text', content: 'Hello **world**!' };
    render(<ArenaBlockRenderer block={block} />);
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // CodeBlock
  // --------------------------------------------------------------------------
  it('should render a code block with syntax content', () => {
    const block: ArenaChatBlock = {
      type: 'code',
      language: 'json',
      content: '{"key": "value"}',
    };
    render(<ArenaBlockRenderer block={block} />);
    // Code content should appear
    expect(screen.getByText(/"key"/)).toBeInTheDocument();
  });

  it('should render a code block title when provided', () => {
    const block: ArenaChatBlock = {
      type: 'code',
      language: 'javascript',
      content: 'console.log(1)',
      title: 'snippet.js',
    };
    render(<ArenaBlockRenderer block={block} />);
    expect(screen.getByText('snippet.js')).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // TableBlock
  // --------------------------------------------------------------------------
  it('should render a table with headers and rows', () => {
    const block: ArenaChatBlock = {
      type: 'table',
      headers: ['Name', 'Value'],
      rows: [
        ['host', 'example.com'],
        ['port', '443'],
      ],
    };
    render(<ArenaBlockRenderer block={block} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('host')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('should render a table caption when provided', () => {
    const block: ArenaChatBlock = {
      type: 'table',
      headers: ['A'],
      rows: [['1']],
      caption: 'Test table',
    };
    render(<ArenaBlockRenderer block={block} />);
    expect(screen.getByText('Test table')).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // ProgressBlock
  // --------------------------------------------------------------------------
  it('should render a running progress block', () => {
    const block: ArenaChatBlock = {
      type: 'progress',
      label: 'Fetching data…',
      status: 'running',
    };
    render(<ArenaBlockRenderer block={block} />);
    expect(screen.getByText('Fetching data…')).toBeInTheDocument();
  });

  it('should render a done progress block with detail', () => {
    const block: ArenaChatBlock = {
      type: 'progress',
      label: 'Done',
      status: 'done',
      detail: '5 items processed',
    };
    render(<ArenaBlockRenderer block={block} />);
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('5 items processed')).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // ConfirmationBlock
  // --------------------------------------------------------------------------
  it('should render a confirmation block with default button labels', () => {
    const block: ArenaChatBlock = {
      type: 'confirmation',
      message: 'Are you sure?',
      actionId: 'delete-session',
    };
    render(<ArenaBlockRenderer block={block} />);
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should render custom button labels', () => {
    const block: ArenaChatBlock = {
      type: 'confirmation',
      message: 'Run flow?',
      actionId: 'run',
      acceptLabel: 'Yes, run',
      rejectLabel: 'No, skip',
    };
    render(<ArenaBlockRenderer block={block} />);
    expect(screen.getByText('Yes, run')).toBeInTheDocument();
    expect(screen.getByText('No, skip')).toBeInTheDocument();
  });

  it('should fire onConfirm callback with accepted=true on accept click', () => {
    const onConfirm = vi.fn();
    const block: ArenaChatBlock = {
      type: 'confirmation',
      message: 'Continue?',
      actionId: 'action-1',
    };
    render(
      <ArenaBlockRenderer
        block={block}
        callbacks={{ onConfirm }}
      />,
    );
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledWith('action-1', true);
  });

  it('should fire onConfirm callback with accepted=false on reject click', () => {
    const onConfirm = vi.fn();
    const block: ArenaChatBlock = {
      type: 'confirmation',
      message: 'Continue?',
      actionId: 'action-2',
    };
    render(
      <ArenaBlockRenderer
        block={block}
        callbacks={{ onConfirm }}
      />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onConfirm).toHaveBeenCalledWith('action-2', false);
  });

  // --------------------------------------------------------------------------
  // EnvSelectorBlock
  // --------------------------------------------------------------------------
  it('should render environment options in envelope selector', () => {
    const block: ArenaChatBlock = {
      type: 'env_selector',
      environments: [
        { id: 'dev', name: 'Development' },
        { id: 'prod', name: 'Production' },
      ],
    };
    render(<ArenaBlockRenderer block={block} />);
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Production')).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // JsonViewerBlock
  // --------------------------------------------------------------------------
  it('should render JSON viewer with data', () => {
    const block: ArenaChatBlock = {
      type: 'json_viewer',
      data: { status: 'ok', count: 42 },
      title: 'API Response',
    };
    render(<ArenaBlockRenderer block={block} />);
    expect(screen.getByText('API Response')).toBeInTheDocument();
  });
});
