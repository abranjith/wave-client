/**
 * Unit tests for ArenaReadinessOverlay (FEAT-013 / TASK-004)
 *
 * Verifies rendering for each readiness state and the "Open Settings"
 * callback.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArenaReadinessOverlay } from '../../../components/arena/ArenaReadinessOverlay';

// ============================================================================
// Tests
// ============================================================================

describe('ArenaReadinessOverlay', () => {
  it('shows spinner and loading text when readiness is "loading"', () => {
    render(<ArenaReadinessOverlay readiness="loading" onOpenSettings={vi.fn()} />);

    // Spinner should be present (by aria-label)
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    // Loading text
    expect(screen.getByText('Initializing Arena…')).toBeInTheDocument();
  });

  it('shows "Configure a Provider" heading and "Open Settings" button when readiness is "needs-config"', () => {
    render(<ArenaReadinessOverlay readiness="needs-config" onOpenSettings={vi.fn()} />);

    expect(screen.getByText('Configure a Provider')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open settings/i })).toBeInTheDocument();
  });

  it('calls onOpenSettings when "Open Settings" button is clicked', async () => {
    const onOpenSettings = vi.fn();
    const user = userEvent.setup();

    render(<ArenaReadinessOverlay readiness="needs-config" onOpenSettings={onOpenSettings} />);

    await user.click(screen.getByRole('button', { name: /open settings/i }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('renders nothing when readiness is "ready"', () => {
    const { container } = render(
      <ArenaReadinessOverlay readiness="ready" onOpenSettings={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when readiness is "idle"', () => {
    const { container } = render(
      <ArenaReadinessOverlay readiness="idle" onOpenSettings={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
