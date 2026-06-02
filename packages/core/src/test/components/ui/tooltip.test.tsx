import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@radix-ui/react-tooltip', () => ({
  Provider: ({ children, delayDuration, ...props }: any) => (
    <div data-testid="radix-provider" data-delay-duration={delayDuration} {...props}>
      {children}
    </div>
  ),
  Root: ({ children, ...props }: any) => (
    <div data-testid="radix-root" {...props}>
      {children}
    </div>
  ),
  Trigger: ({ children, ...props }: any) => (
    <button data-testid="radix-trigger" type="button" {...props}>
      {children}
    </button>
  ),
  Portal: ({ children }: any) => <div data-testid="radix-portal">{children}</div>,
  Content: ({ children, sideOffset, className, ...props }: any) => (
    <div
      data-testid="radix-content"
      data-side-offset={sideOffset}
      className={className}
      {...props}
    >
      {children}
    </div>
  ),
  Arrow: (props: any) => <span data-testid="radix-arrow" {...props} />,
}));

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../components/ui/tooltip';

describe('Tooltip wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards delayDuration through TooltipProvider', () => {
    render(
      <TooltipProvider delayDuration={450}>
        <div>child</div>
      </TooltipProvider>
    );

    expect(screen.getByTestId('radix-provider')).toHaveAttribute('data-delay-duration', '450');
  });

  it('creates a fallback provider when Tooltip is rendered without a parent provider', () => {
    render(
      <Tooltip>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent>Details</TooltipContent>
      </Tooltip>
    );

    expect(screen.getByTestId('radix-provider')).toBeInTheDocument();
    expect(screen.getByTestId('radix-root')).toBeInTheDocument();
    expect(screen.getByTestId('radix-content')).toHaveAttribute('data-side-offset', '4');
  });

  it('does not create a nested provider when Tooltip already has a parent provider', () => {
    render(
      <TooltipProvider delayDuration={500}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Details</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    expect(screen.getAllByTestId('radix-provider')).toHaveLength(1);
    expect(screen.getByTestId('radix-provider')).toHaveAttribute('data-delay-duration', '500');
  });
});
