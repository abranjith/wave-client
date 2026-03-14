/**
 * ContextCircle Component
 *
 * SVG ring indicator that communicates how much of the current session's
 * context-window budget has been used. The arc fills clockwise and transitions
 * from blue to red as usage approaches the budget limit, with increasing
 * stroke width to convey urgency. A percentage label is rendered in the
 * centre of the ring.
 */

import React from 'react';
import { cn } from '../../utils/styling';

/** Circumference of the ring arc (2π × radius 12). */
const CIRCUMFERENCE = 2 * Math.PI * 12;

// ============================================================================
// Types
// ============================================================================

/**
 * Props for the ContextCircle component.
 */
export interface ContextCircleProps {
  /** Estimated word count for the current session */
  currentWords: number;
  /** Context budget in words (default 150 000) */
  budgetWords?: number;
  /** Optional CSS class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * SVG ring indicator showing session context-window usage.
 *
 * The ring fills clockwise from blue (0 %) to red (100 %) as the word
 * count approaches the budget. Stroke width grows from 2 to 4 to convey
 * increasing urgency. Values above the budget are clamped to 100 %.
 */
export function ContextCircle({
  currentWords,
  budgetWords = 150_000,
  className,
}: ContextCircleProps): React.ReactElement {
  const ratio = Math.min(currentWords / budgetWords, 1);

  // Interpolate HSL hue: 210 (blue) at 0 % → 0 (red) at 100 %
  const hue = 210 * (1 - ratio);
  const strokeColor = `hsl(${hue}, 80%, 55%)`;

  // Stroke width interpolates from 2 (empty) to 4 (full)
  const strokeWidth = 2 + ratio * 2;

  // dashOffset = 0 means fully filled; circumference means empty
  const dashOffset = CIRCUMFERENCE * (1 - ratio);

  const percentage = Math.round(ratio * 100);
  const tooltipText = `Session size: ~${currentWords.toLocaleString()} words / ${(budgetWords / 1_000).toFixed(0)}K`;

  return (
    <svg
      viewBox="0 0 32 32"
      width={32}
      height={32}
      aria-label={tooltipText}
      className={cn('flex-shrink-0', className)}
    >
      <title>{tooltipText}</title>
      {/* Background track — always full ring */}
      <circle
        cx={16}
        cy={16}
        r={12}
        fill="none"
        className="stroke-slate-200 dark:stroke-slate-700"
        strokeWidth={2}
      />

      {/* Foreground arc — rotated so the fill starts from the top */}
      <circle
        cx={16}
        cy={16}
        r={12}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={dashOffset}
        style={{
          stroke: strokeColor,
          transform: 'rotate(-90deg)',
          transformOrigin: '50% 50%',
          transformBox: 'fill-box',
        }}
      />

      {/* Centre percentage label */}
      <text
        x={16}
        y={16}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}
        fontWeight={600}
        className="fill-slate-700 dark:fill-slate-300"
      >
        {percentage}%
      </text>
    </svg>
  );
}

export default ContextCircle;
