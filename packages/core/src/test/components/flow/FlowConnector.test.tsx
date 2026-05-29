import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlowConnector } from '../../../components/flow/FlowConnector';
import type {
  FlowConnector as FlowConnectorType,
  ConnectorCondition,
} from '../../../types/flow';

type RenderOptions = Partial<
  Omit<React.ComponentProps<typeof FlowConnector>, 'connector' | 'startPos' | 'endPos'>
> & {
  condition?: ConnectorCondition;
  startPos?: { x: number; y: number };
  endPos?: { x: number; y: number };
};

function renderConnector(options: RenderOptions = {}) {
  const connector: FlowConnectorType = {
    id: 'connector-1',
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    condition: options.condition ?? 'success',
  };

  return render(
    <svg>
      <FlowConnector
        connector={connector}
        startPos={options.startPos ?? { x: 20, y: 20 }}
        endPos={options.endPos ?? { x: 180, y: 20 }}
        isSelected={options.isSelected}
        isActive={options.isActive}
        isSkipped={options.isSkipped}
        onClick={options.onClick}
        onDelete={options.onDelete}
        onConditionChange={options.onConditionChange}
        isReadOnly={options.isReadOnly}
      />
    </svg>
  );
}

describe('FlowConnector condition styling', () => {
  it('uses Tailwind stroke classes with dark mode variants for active connectors', () => {
    const { container } = renderConnector({ condition: 'success', isActive: true });

    const visiblePath = container.querySelectorAll('path')[1];
    expect(visiblePath).toHaveClass('stroke-emerald-500');
    expect(visiblePath).toHaveClass('dark:stroke-emerald-400');
  });

  it('uses muted stroke classes for inactive non-any connectors', () => {
    const { container } = renderConnector({ condition: 'failure', isActive: false });

    const visiblePath = container.querySelectorAll('path')[1];
    expect(visiblePath).toHaveClass('stroke-slate-300');
    expect(visiblePath).toHaveClass('dark:stroke-slate-600');
  });

  it('uses skipped connector stroke classes when connector is skipped', () => {
    const { container } = renderConnector({
      condition: 'validation_pass',
      isActive: true,
      isSkipped: true,
    });

    const visiblePath = container.querySelectorAll('path')[1];
    expect(visiblePath).toHaveClass('stroke-slate-400');
    expect(visiblePath).toHaveClass('dark:stroke-slate-500');
  });

  it('applies complementary fill and text classes for the condition label', () => {
    const { container } = renderConnector({ condition: 'validation_fail', isActive: true });

    const labelRect = container.querySelector('rect');
    const labelText = container.querySelector('text');

    expect(labelRect).toHaveClass('fill-orange-50');
    expect(labelRect).toHaveClass('dark:fill-orange-950/45');
    expect(labelRect).toHaveClass('stroke-orange-500');

    expect(labelText).toHaveClass('fill-orange-700');
    expect(labelText).toHaveClass('dark:fill-orange-200');
  });

  it('uses selected fill/text classes when the connector is selected', () => {
    const { container } = renderConnector({
      condition: 'validation_pass',
      isActive: true,
      isSelected: true,
    });

    const labelRect = container.querySelector('rect');
    const labelText = container.querySelector('text');

    expect(labelRect).toHaveClass('fill-blue-500');
    expect(labelRect).toHaveClass('dark:fill-blue-400');
    expect(labelText).toHaveClass('fill-white');
    expect(labelText).toHaveClass('dark:fill-slate-950');
  });

  it('renders wider labels for validation condition chips', () => {
    const { container: validationContainer } = renderConnector({
      condition: 'validation_pass',
      isActive: true,
    });
    const validationRect = validationContainer.querySelector('rect');

    expect(validationRect).toHaveAttribute('width', '86');

    const { container: defaultContainer } = renderConnector({ condition: 'any', isActive: true });
    const defaultRect = defaultContainer.querySelector('rect');

    expect(defaultRect).toHaveAttribute('width', '55');
  });

  it('uses Tailwind text classes in dropdown options instead of inline color styles', () => {
    const onConditionChange = vi.fn();
    renderConnector({
      condition: 'success',
      isActive: true,
      onConditionChange,
    });

    fireEvent.click(screen.getByText('Success'));

    const failureOption = screen.getByRole('button', { name: 'Failure' });
    expect(failureOption).toHaveClass('text-rose-700');
    expect(failureOption).toHaveClass('dark:text-rose-300');
    expect(failureOption.getAttribute('style') ?? '').not.toContain('color');
  });
});
