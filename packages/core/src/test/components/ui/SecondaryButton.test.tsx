import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoonIcon } from 'lucide-react';

import { SecondaryButton } from '../../../components/ui/SecondaryButton';

describe('SecondaryButton', () => {
  it('uses icon-only sizing classes that bypass the base button svg fallback rule', () => {
    render(
      <SecondaryButton
        aria-label="Toggle theme"
        icon={<MoonIcon size={20} data-testid="theme-icon" />}
      />
    );

    const button = screen.getByRole('button', { name: 'Toggle theme' });
    const icon = screen.getByTestId('theme-icon');
    const iconWrapper = button.querySelector('span');

    expect(button).toHaveClass('size-9');
    expect(iconWrapper).toHaveClass('h-5', 'w-5');
    expect(icon).toHaveClass('size-full');
  });

  it('uses compact icon wrapper sizing when both icon and text are provided', () => {
    render(
      <SecondaryButton
        text="Settings"
        icon={<MoonIcon size={20} data-testid="settings-icon" />}
      />
    );

    const icon = screen.getByTestId('settings-icon');
    const iconWrapper = icon.parentElement;

    expect(iconWrapper).toHaveClass('h-4', 'w-4');
    expect(icon).toHaveClass('size-full');
  });
});