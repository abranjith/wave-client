/**
 * Unit tests for ContextCircle — FEAT-015 TASK-001
 *
 * Verifies the SVG ring renders the correct percentage, colour, and tooltip
 * for various word-count / budget combinations, including edge cases
 * (zero words, over-budget clamping, custom budget).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ContextCircle } from '../../../components/arena/ContextCircle';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Returns the foreground arc circle element (second <circle> in the SVG).
 * The first circle is the background track; the second is the arc.
 */
function getArcCircle(container: HTMLElement): SVGCircleElement {
  const circles = container.querySelectorAll('circle');
  return circles[1] as SVGCircleElement;
}

/** Parses the HSL hue from an inline stroke style string. */
function getStrokeHue(arcCircle: SVGCircleElement): number {
  const stroke = (arcCircle as unknown as HTMLElement).style.stroke;
  // stroke is "hsl(HHH, 80%, 55%)"
  const match = stroke.match(/hsl\(\s*([\d.]+)/);
  return match ? parseFloat(match[1]) : NaN;
}

// ============================================================================
// Tests
// ============================================================================

describe('ContextCircle', () => {
  it('renders 0% at zero words with blue stroke and thin stroke-width', () => {
    const { container } = render(<ContextCircle currentWords={0} />);

    // Centre label
    expect(screen.getByText('0%')).toBeInTheDocument();

    const arc = getArcCircle(container);

    // Hue should be 210 (blue) at 0%
    expect(getStrokeHue(arc)).toBeCloseTo(210, 0);

    // Stroke width should be ~2 at 0%
    expect(parseFloat(arc.getAttribute('stroke-width') ?? '0')).toBeCloseTo(2, 1);
  });

  it('renders ~50% at 75 000 words with intermediate stroke colour', () => {
    const { container } = render(<ContextCircle currentWords={75_000} />);

    expect(screen.getByText('50%')).toBeInTheDocument();

    const arc = getArcCircle(container);

    // Hue should be ~105 (halfway between 210 and 0)
    const hue = getStrokeHue(arc);
    expect(hue).toBeGreaterThan(100);
    expect(hue).toBeLessThan(110);

    // Stroke width should be ~3 at 50%
    expect(parseFloat(arc.getAttribute('stroke-width') ?? '0')).toBeCloseTo(3, 1);
  });

  it('renders 100% at budget with red stroke and thick stroke-width', () => {
    const { container } = render(<ContextCircle currentWords={150_000} />);

    expect(screen.getByText('100%')).toBeInTheDocument();

    const arc = getArcCircle(container);

    // Hue should be 0 (red) at 100%
    expect(getStrokeHue(arc)).toBeCloseTo(0, 0);

    // Stroke width should be ~4 at 100%
    expect(parseFloat(arc.getAttribute('stroke-width') ?? '0')).toBeCloseTo(4, 1);
  });

  it('clamps to 100% when words exceed the budget', () => {
    const { container } = render(<ContextCircle currentWords={200_000} />);

    // Should display 100%, not 133% or an error
    expect(screen.getByText('100%')).toBeInTheDocument();

    // strokeDashoffset should be 0 (fully filled arc)
    const arc = getArcCircle(container);
    expect(parseFloat(arc.getAttribute('stroke-dashoffset') ?? '1')).toBeCloseTo(0, 1);
  });

  it('tooltip contains the correct word count and budget', () => {
    render(<ContextCircle currentWords={50_000} budgetWords={100_000} />);

    const titleEl = document.querySelector('svg > title');
    const tooltip = titleEl?.textContent ?? '';

    expect(tooltip).toContain('50,000');
    expect(tooltip).toContain('100K');
  });

  it('uses a custom budgetWords to compute the ratio', () => {
    const { container } = render(
      <ContextCircle currentWords={50_000} budgetWords={50_000} />,
    );

    // 50 000 / 50 000 = 1.0 → 100%
    expect(screen.getByText('100%')).toBeInTheDocument();

    const arc = getArcCircle(container);
    expect(parseFloat(arc.getAttribute('stroke-dashoffset') ?? '1')).toBeCloseTo(0, 1);
  });
});
